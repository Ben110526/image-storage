/* V2 optics — SDF geometry & displacement-field generation.
 *
 * Geometry is expressed in CSS pixels. A pane silhouette is a signed distance
 * field (SDF): negative inside, 0 on the edge, positive outside. From the SDF
 * we derive a thickness profile: ~flat in the center (no refraction), curved
 * inside an edge band. Sample displacement points along the SDF gradient,
 * scaled by the profile's slope — center neutral, edge bends inward.
 *
 * The field is rasterized into an RGBA map for SVG feDisplacementMap:
 *   R,G encode the displacement direction (0.5 = neutral)
 *   B   encodes the thickness profile (used by rim/highlight composites)
 *   A   opaque inside the pane + margin, 0 outside
 *
 * Units are CSS pixels; the caller renders the map at the pane's device-pixel
 * resolution and scales the filter by 1/dpr so displacement stays in CSS px.
 */

export type PaneShape =
  | { kind: 'circle'; size: number }
  | { kind: 'pill'; width: number; height: number }
  | { kind: 'rect'; width: number; height: number; radius: number };

export interface LensProfile {
  /** Width of the curved edge band, CSS px. */
  edgeBand: number;
  /** Max sample displacement at the edge, CSS px (positive = inward). */
  displacement: number;
}

/** Signed distance to the silhouette edge, in CSS px (negative = inside). */
export function paneSDF(shape: PaneShape, x: number, y: number): number {
  switch (shape.kind) {
    case 'circle': {
      const c = shape.size / 2;
      return Math.hypot(x - c, y - c) - c;
    }
    case 'pill':
      return sdRoundRect(shape.width, shape.height, shape.height / 2, x, y);
    case 'rect':
      return sdRoundRect(shape.width, shape.height, shape.radius, x, y);
  }
}

function sdRoundRect(w: number, h: number, r: number, x: number, y: number): number {
  const qx = Math.abs(x - w / 2) - (w / 2 - r);
  const qy = Math.abs(y - h / 2) - (h / 2 - r);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r;
}

/* Thickness profile: t(u) over u = depth from edge (0 at edge → 1 at band
 * inner limit). Smooth dome: flat (slope→0) at the inner limit, steepest near
 * the edge. sin(u·π/2) gives slope 0 at u=1 and max slope at u=0. */
function thickness(u: number): number {
  const c = Math.min(1, Math.max(0, u));
  return Math.sin((c * Math.PI) / 2);
}

/**
 * Rasterize the displacement field for a pane. Returns an ImageData-sized
 * Uint8ClampedArray plus the CSS-px scale to feed feDisplacementMap.
 *
 * @param padding Extra CSS px around the pane included in the map so the
 *                filter region can sample outside-edge pixels.
 */
export function buildDisplacementMap(
  shape: PaneShape,
  profile: LensProfile,
  dpr: number,
  padding = 4,
): { data: Uint8ClampedArray<ArrayBuffer>; width: number; height: number; scale: number } {
  const pw = shapeWidth(shape) + padding * 2;
  const ph = shapeHeight(shape) + padding * 2;
  const width = Math.max(1, Math.round(pw * dpr));
  const height = Math.max(1, Math.round(ph * dpr));
  const data = new Uint8ClampedArray(new ArrayBuffer(width * height * 4));

  /* feDisplacementMap moves a sample by scale·(channel−0.5) in *user units*.
   * The filter's user unit here is the CSS px of the element the backdrop is
   * sampled at, so scale is already in CSS px — the map is simply rendered at
   * dpr resolution with values computed from CSS-px geometry. */
  const scale = profile.displacement * 2; // channel range ±0.5 → ±displacement

  const EPS = 0.75; // finite-difference step, CSS px
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const x = px / dpr - padding; // CSS px relative to pane origin
      const y = py / dpr - padding;
      const d = paneSDF(shape, x, y);

      const i = (py * width + px) * 4;
      if (d >= padding) {
        data[i + 3] = 0; // fully outside the padded region
        continue;
      }

      /* SDF gradient via central differences — points outward from center. */
      const gx =
        (paneSDF(shape, x + EPS, y) - paneSDF(shape, x - EPS, y)) / (2 * EPS);
      const gy =
        (paneSDF(shape, x, y + EPS) - paneSDF(shape, x, y - EPS)) / (2 * EPS);
      const gl = Math.hypot(gx, gy) || 1;
      const nx = gx / gl;
      const ny = gy / gl;

      const depth = -d; // >0 inside
      const u = depth / profile.edgeBand; // 0 at edge → ≥1 past the band
      /* Displacement magnitude follows the profile slope: 0 in the flat
       * center, rising toward the edge, easing back at the very rim so there
       * is no discontinuity at the silhouette. */
      const inside = Math.max(0, Math.min(1, u));
      const slopeMag = inside >= 1 ? 0 : Math.cos((inside * Math.PI) / 2);
      const rimFade = depth >= 0 ? 1 : Math.max(0, 1 + d / padding);
      const mag = slopeMag * rimFade; // 0..1 of max displacement

      /* Displace INWARD (against the outward normal) → channel value < 0.5. */
      const dx = -nx * mag * 0.5;
      const dy = -ny * mag * 0.5;

      data[i] = Math.round((0.5 + dx) * 255);
      data[i + 1] = Math.round((0.5 + dy) * 255);
      data[i + 2] = Math.round(thickness(u) * 255);
      data[i + 3] = 255;
    }
  }
  return { data, width, height, scale };
}

export function shapeWidth(s: PaneShape): number {
  return s.kind === 'circle' ? s.size : s.width;
}
export function shapeHeight(s: PaneShape): number {
  return s.kind === 'circle' ? s.size : s.height;
}

/** Encode the map as a PNG data URL via an offscreen canvas (browser only). */
export function displacementMapToDataURL(
  map: { data: Uint8ClampedArray<ArrayBuffer>; width: number; height: number },
): string {
  const canvas = document.createElement('canvas');
  canvas.width = map.width;
  canvas.height = map.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  ctx.putImageData(new ImageData(map.data, map.width, map.height), 0, 0);
  return canvas.toDataURL('image/png');
}
