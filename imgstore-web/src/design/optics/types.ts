/* V2-03 optics types — the shared vocabulary for the Liquid Glass engine.
 *
 * The engine is scene-owned (ADR-ENGINE: Đường B, canvas 2D). A GlassScene
 * paints the backdrop the app owns; GlassPane instances registered in the
 * registry sample that scene through an SDF displacement field
 * (displacement.ts). Nothing here samples live DOM.
 */

import type { LensProfile, PaneShape } from './displacement';

export type { LensProfile, PaneShape };

/** Material role — maps to a tuned profile in profiles.ts. */
export type GlassRole = 'button' | 'pill' | 'panel';

/** A registered pane: shape + profile + where to find its backdrop. */
export interface PaneRegistration {
  /** Stable id for debugging/evidence (e.g. 'navbar', 'dropzone'). */
  id: string;
  role: GlassRole;
  /** Host element the material canvas is absolutely positioned into. */
  host: HTMLElement;
  /** Material canvas the scheduler renders displaced scene pixels into. */
  canvas: HTMLCanvasElement;
  /**
   * The scene this pane samples. A pane over the app background samples the
   * GlassScene canvas; a pane over a media stage samples that stage's canvas.
   */
  scene: SceneSource;
}

/** A canvas the app owns and can read back (scene or media stage). */
export interface SceneSource {
  canvas: HTMLCanvasElement;
  /** CSS-px rect the canvas covers, in viewport coordinates at sample time. */
  rect: () => DOMRect;
}

export interface PaneRenderStats {
  renders: number;
  lastMs: number;
  maxMs: number;
}
