import type { ImageMetadata, ChunkUploadProgress } from '../types';
import {
  initResumableUpload,
  uploadResumableChunk,
  fetchResumableStatus,
  abortResumableUpload,
  getApiBaseUrl,
  getApiKey,
  getSessionToken,
} from '../api/client';

export interface ChunkUploaderOptions {
  folderId?: string;
  chunkSize?: number;
  onProgress?: (progress: ChunkUploadProgress) => void;
  onSuccess?: (metadata: ImageMetadata) => void;
  onError?: (error: Error) => void;
  onStateChange?: (state: UploaderState) => void;
  maxRetries?: number;
}

export type UploaderState = 'idle' | 'initializing' | 'uploading' | 'paused' | 'completing' | 'cancelling' | 'completed' | 'error' | 'aborted';

const STORAGE_PREFIX = 'imgstore_resumable_';
class TerminalUploadError extends Error {}

export class ChunkUploader {
  private file: File;
  private options: ChunkUploaderOptions;
  private chunkSize: number;
  private uploadId: string | null = null;
  private bytesUploaded = 0;
  private state: UploaderState = 'idle';
  private abortController: AbortController | null = null;
  private isPaused = false;
  private startTime = 0;
  private lastTime = 0;
  private lastBytes = 0;
  private storageKey = '';
  private activeRun: Promise<void> | null = null;
  private pendingResume: Promise<void> | null = null;
  private pendingCancel: Promise<boolean> | null = null;
  private cancelRequested = false;
  private wakeDelay: (() => void) | null = null;
  private currentSpeed = 0; // bytes per second

  constructor(file: File, options: ChunkUploaderOptions = {}) {
    this.file = file;
    this.options = options;
    // Default 10MB chunk size (must be multiple of 256KB)
    this.chunkSize = options.chunkSize || 10 * 1024 * 1024;
  }

  public getState(): UploaderState {
    return this.state;
  }

  public getUploadId(): string | null {
    return this.uploadId;
  }

  private getStorageKey(): string {
    return this.storageKey;
  }

  private saveSession(uploadId: string) {
    try {
      localStorage.setItem(this.getStorageKey(), uploadId);
    } catch {
      // Ignore quota storage error
    }
  }

  private clearSession() {
    try {
      localStorage.removeItem(this.getStorageKey());
    } catch {
      // Ignore
    }
  }

  private setState(state: UploaderState) {
    this.state = state;
    this.options.onStateChange?.(state);
  }

  private stopped() {
    return this.isPaused || this.cancelRequested;
  }

  private reportError(error: unknown) {
    this.setState('error');
    this.options.onError?.(error instanceof Error ? error : new Error(String(error)));
  }

  private run(work: () => Promise<void>): Promise<void> {
    const task = Promise.resolve().then(work).catch(error => {
      if (!this.stopped()) this.reportError(error);
    }).finally(() => {
      if (this.activeRun === task) this.activeRun = null;
    });
    this.activeRun = task;
    return task;
  }

  public start(): Promise<void> {
    if (this.activeRun) return this.activeRun;
    if (this.cancelRequested || this.state === 'completed') return Promise.resolve();
    this.isPaused = false;
    this.setState('initializing');
    this.updateProgress('Initializing upload session...');
    return this.run(() => this.initializeAndUpload());
  }

  private async initializeAndUpload(): Promise<void> {
    if (this.stopped()) return;
    // Scope saved sessions to backend + credential + file identity; never store the credential.
    // Keep default-folder legacy resume keys working; explicitly selected folders
    // must never resume the same file's session in another destination.
    const identityParts = [getApiBaseUrl(), getSessionToken() || getApiKey(), this.file.name, this.file.size, this.file.lastModified];
    if (this.options.folderId) identityParts.push(this.options.folderId);
    const identity = JSON.stringify(identityParts);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity));
    this.storageKey = STORAGE_PREFIX + Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    if (this.stopped()) return;
    // 1. Check if an active session exists in localStorage
    const savedUploadId = localStorage.getItem(this.getStorageKey());
    if (savedUploadId) {
      // Retain the ID even if status fails, so cancellation/retry can still use it.
      this.uploadId = savedUploadId;
      try {
        const status = await this.readInitialStatus();
        if (!status || this.stopped()) return;
        if (status.status === 'completed' && status.file) {
          this.finish(status.file);
          return;
        }
        if (status.status === 'uploading' || status.status === 'processing') {
          this.bytesUploaded = status.bytes_received;
        } else if (status.status === 'aborted') {
          this.clearSession();
          this.uploadId = null;
        }
      } catch (error) {
        if (this.stopped()) return;
        const status = (error as { response?: { status?: number } }).response?.status;
        if (status === 404 || status === 410) {
          this.clearSession();
          this.uploadId = null;
        } else throw error; // Keep the session on network/server errors; never silently duplicate.
      }
    }

    // 2. Initialize fresh session if none valid
    if (this.stopped()) return;
    if (!this.uploadId) {
      const initRes = await initResumableUpload(
        this.file.name,
        this.file.size,
        this.file.type || undefined,
        this.options.folderId
      );
      this.uploadId = initRes.upload_id;
      this.chunkSize = initRes.chunk_size || this.chunkSize;
      this.saveSession(this.uploadId);
    }

    // cancel() waits for this run, then aborts the newly returned session.
    if (this.stopped()) return;
    // 3. Begin upload loop
    this.setState('uploading');
    this.startTime = Date.now();
    this.lastTime = this.startTime;
    this.lastBytes = this.bytesUploaded;

    await this.uploadLoop();
  }

  private finish(file: ImageMetadata) {
    this.bytesUploaded = this.file.size;
    this.clearSession();
    this.setState('completed');
    this.emitProgress(this.file.size, this.file.size);
    this.options.onSuccess?.(file);
  }

  private queryStatus() {
    this.abortController = new AbortController();
    return fetchResumableStatus(this.uploadId!, this.abortController.signal);
  }

  private retryable(error: unknown): boolean {
    if (error instanceof TerminalUploadError) return false;
    const code = (error as { response?: { status?: number } })?.response?.status;
    return !code || ![400, 401, 403, 404, 410, 413].includes(code);
  }

  private delay(ms: number): Promise<void> {
    if (this.stopped()) return Promise.resolve();
    return new Promise(resolve => {
      const done = () => {
        clearTimeout(timer);
        this.wakeDelay = null;
        resolve();
      };
      const timer = setTimeout(done, ms);
      this.wakeDelay = done;
    });
  }

  private async retryDelay(failures: number) {
    this.updateProgress(`Connection interrupted. Retrying (${failures}/${this.options.maxRetries ?? 5})...`);
    await this.delay(Math.min(1000 * 2 ** failures, 10000));
  }

  private async readInitialStatus() {
    for (let failures = 0; !this.stopped(); failures++) {
      try { return await this.queryStatus(); }
      catch (error) {
        if (this.stopped()) return;
        if (!this.retryable(error) || failures >= (this.options.maxRetries ?? 5)) throw error;
        await this.retryDelay(failures + 1);
      }
    }
  }

  private async syncStatus(): Promise<boolean> {
    const status = await this.queryStatus();
    if (this.stopped()) return true;
    if (status.status === 'completed' && status.file) { this.finish(status.file); return true; }
    if (status.status === 'aborted') throw new TerminalUploadError('Upload session has been aborted.');
    this.bytesUploaded = status.bytes_received; // zero is a valid acknowledged offset
    return false;
  }

  private async uploadLoop(needsStatus = false): Promise<void> {
    const total = this.file.size;
    const maxRetries = this.options.maxRetries ?? 5;
    let failures = 0;
    let finalizationPolls = 0;
    while (!this.stopped()) {
      try {
        // Never resend bytes until the server confirms the offset. Status failures
        // share the retry budget with chunk failures instead of escaping the loop.
        if (needsStatus || this.bytesUploaded >= total) {
          if (await this.syncStatus()) return;
          needsStatus = false;
        }
        if (this.bytesUploaded >= total) {
          this.setState('completing');
          this.updateProgress('Finalizing file in cloud storage & CDN...');
          if (++finalizationPolls >= 30) {
            throw new TerminalUploadError('Finalization is still pending. Resume this file to check again; do not re-upload.');
          }
          failures = 0;
          await this.delay(1000);
          continue;
        }
        // Rebuild the chunk after EVERY recovery; never reuse an old range.
        const start = this.bytesUploaded;
        const end = Math.min(start + this.chunkSize, total) - 1;
        this.abortController = new AbortController();
        const res = await uploadResumableChunk(
          this.uploadId!, this.file.slice(start, end + 1), `bytes ${start}-${end}/${total}`,
          loaded => {
            if (!this.stopped()) { this.calculateSpeedAndEta(start + loaded); this.emitProgress(start + loaded, total); }
          },
          this.abortController.signal
        );
        if (this.stopped()) return;
        if (res.status === 308) {
          const match = res.range?.match(/^bytes=0-(\d+)$/);
          const next = match ? Number(match[1]) + 1 : 0;
          if (next <= start) throw new Error('Server has not acknowledged upload progress.');
          this.bytesUploaded = next;
        } else {
          const file = res.data?.file || res.data?.data?.file;
          if (!file?.id || (res.data?.status && res.data.status !== 'completed')) {
            throw new Error('Upload result is pending confirmation.');
          } else { this.finish(file); return; }
        }
        failures = 0;
      } catch (error) {
        if (this.stopped()) return;
        if (!this.retryable(error) || ++failures > maxRetries) throw error;
        needsStatus = true;
        await this.retryDelay(failures);
      }
    }
  }

  private calculateSpeedAndEta(currentBytes: number) {
    const now = Date.now();
    const timeDelta = (now - this.lastTime) / 1000;

    if (timeDelta >= 0.5) {
      const bytesDelta = currentBytes - this.lastBytes;
      const instantSpeed = bytesDelta / timeDelta;
      // Exponential Moving Average (EMA)
      this.currentSpeed = this.currentSpeed === 0 ? instantSpeed : this.currentSpeed * 0.7 + instantSpeed * 0.3;
      this.lastTime = now;
      this.lastBytes = currentBytes;
    }
  }

  private emitProgress(currentBytes: number, totalBytes: number) {
    const percent = Math.min(100, Math.round((currentBytes / totalBytes) * 100));
    const remainingBytes = Math.max(0, totalBytes - currentBytes);
    const etaSeconds = this.currentSpeed > 0 ? Math.round(remainingBytes / this.currentSpeed) : 0;

    this.options.onProgress?.({
      bytesUploaded: currentBytes,
      totalBytes,
      percent,
      speedBytesPerSec: this.state === 'uploading' ? this.currentSpeed : 0,
      etaSeconds,
      statusText: this.state === 'completing' ? 'Finalizing file...' : 'Uploading...',
    });
  }

  private updateProgress(statusText: string) {
    const total = this.file.size;
    const percent = Math.min(100, Math.round((this.bytesUploaded / total) * 100));
    this.options.onProgress?.({
      bytesUploaded: this.bytesUploaded,
      totalBytes: total,
      percent,
      speedBytesPerSec: this.state === 'uploading' ? this.currentSpeed : 0,
      etaSeconds: 0,
      statusText,
    });
  }

  public pause(): void {
    if (this.state !== 'uploading' && this.state !== 'completing') return;
    this.isPaused = true;
    this.setState('paused');
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.wakeDelay?.();
    this.updateProgress('Upload paused.');
  }

  public resume(): Promise<void> {
    if (this.pendingResume) return this.pendingResume;
    if (this.pendingCancel || (this.state !== 'paused' && this.state !== 'error')) return Promise.resolve();
    this.pendingResume = (async () => {
      // A paused request may still be unwinding. Queue resume instead of dropping it.
      await this.activeRun;
      if (this.pendingCancel || (this.state !== 'paused' && this.state !== 'error')) return;
      this.cancelRequested = false;
      this.isPaused = false;
      if (!this.uploadId) { await this.start(); return; }
      this.setState('uploading');
      this.updateProgress('Resuming from confirmed server progress...');
      this.lastTime = Date.now();
      this.lastBytes = this.bytesUploaded;
      await this.run(() => this.uploadLoop(true));
    })().finally(() => { this.pendingResume = null; });
    return this.pendingResume;
  }

  public cancel(): Promise<boolean> {
    if (this.pendingCancel) return this.pendingCancel;
    if (this.state === 'completed' || this.state === 'aborted') return Promise.resolve(true);
    this.cancelRequested = true;
    this.isPaused = true;
    this.setState('cancelling');
    this.updateProgress('Waiting for server confirmation of cancellation...');
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.wakeDelay?.();
    this.pendingCancel = (async () => {
      // Do not abort the init request: we need its ID to release the reservation.
      await this.activeRun;
      try {
        if (this.uploadId) await abortResumableUpload(this.uploadId);
      } catch {
        this.reportError(new Error('Cancellation not confirmed. Resume the file to check its status.'));
        return false;
      }
      this.clearSession();
      this.uploadId = null;
      this.setState('aborted');
      this.updateProgress('Upload canceled.');
      return true;
    })().finally(() => { this.pendingCancel = null; });
    return this.pendingCancel;
  }
}
