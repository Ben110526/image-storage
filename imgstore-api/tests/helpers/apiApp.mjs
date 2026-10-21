import { build } from 'esbuild';

/* Shared bundle loader for the Worker app.
 *
 * The API under test imports `cloudflare:workers` (DurableObject base class),
 * which does not exist under plain Node. We stub it and bundle src/index.ts to
 * an ESM data: URL so every test file can drive the real Hono app with an
 * in-memory env (see ./fixture.mjs). */

if (typeof globalThis.FixedLengthStream === 'undefined') {
  globalThis.FixedLengthStream = class FixedLengthStream extends TransformStream { constructor() { super(); } };
}

const cfMockPlugin = {
  name: 'cloudflare-workers-mock',
  setup(b) {
    b.onResolve({ filter: /^cloudflare:workers$/ }, args => ({
      path: args.path,
      namespace: 'cf-mock'
    }));
    b.onLoad({ filter: /.*/, namespace: 'cf-mock' }, () => ({
      contents: `
        export class DurableObject {
          constructor(ctx, env) {
            this.ctx = ctx;
            this.env = env;
          }
        }
      `,
      loader: 'js'
    }));
  }
};

const bundle = await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  plugins: [cfMockPlugin]
});

const loaded = await import(
  'data:text/javascript;base64,' +
  Buffer.from(bundle.outputFiles[0].text + '\n//# sourceURL=imgstore-tests.mjs').toString('base64')
);

export const app = loaded.default;
export const ClientQuotaDO = loaded.ClientQuotaDO;
export const UploadSessionDO = loaded.UploadSessionDO;
export const originalFetch = globalThis.fetch;
