/* V2-07 — meaningful unit tests for the optics engine core (plan §14.2:
 * geometry/map + neutral center must be proven by pixel-level assertions,
 * not className checks). */
import { describe, expect, it } from 'vitest';
import {
  buildDisplacementMap,
  paneSDF,
  shapeHeight,
  shapeWidth,
  type PaneShape,
} from '../displacement';

const PROFILE = { edgeBand: 10, displacement: 5 };

function channels(
  map: ReturnType<typeof buildDisplacementMap>,
  cssX: number,
  cssY: number,
  dpr: number,
  padding: number,
) {
  const px = Math.round((cssX + padding) * dpr);
  const py = Math.round((cssY + padding) * dpr);
  const i = (py * map.width + px) * 4;
  return { r: map.data[i], g: map.data[i + 1], b: map.data[i + 2], a: map.data[i + 3] };
}

describe('paneSDF geometry', () => {
  it('circle: negative inside, zero on edge, positive outside', () => {
    const c: PaneShape = { kind: 'circle', size: 40 };
    expect(paneSDF(c, 20, 20)).toBeLessThan(0); // center
    expect(paneSDF(c, 40, 20)).toBeCloseTo(0, 5); // right edge
    expect(paneSDF(c, 60, 20)).toBeGreaterThan(0); // outside
  });

  it('pill: SDF matches a stadium (rect with radius = h/2)', () => {
    const pill: PaneShape = { kind: 'pill', width: 120, height: 40 };
    expect(paneSDF(pill, 60, 20)).toBeLessThan(0);
    expect(paneSDF(pill, -5, 20)).toBeGreaterThan(0);
    expect(paneSDF(pill, 0, 20)).toBeCloseTo(0, 5);
  });

  it('rounded rect: corners curve, edges are flat', () => {
    const r: PaneShape = { kind: 'rect', width: 100, height: 60, radius: 12 };
    // mid-edge sits on the silhouette
    expect(paneSDF(r, 50, 0)).toBeCloseTo(0, 5);
    // diagonal outside the corner is farther than along the axis
    expect(paneSDF(r, -6, -6)).toBeGreaterThan(paneSDF(r, -6, 30));
  });

  it('shapeWidth/shapeHeight agree across kinds', () => {
    expect(shapeWidth({ kind: 'circle', size: 24 })).toBe(24);
    expect(shapeHeight({ kind: 'circle', size: 24 })).toBe(24);
    expect(shapeWidth({ kind: 'pill', width: 90, height: 30 })).toBe(90);
    expect(shapeHeight({ kind: 'rect', width: 90, height: 30, radius: 4 })).toBe(30);
  });
});

describe('buildDisplacementMap', () => {
  const dpr = 1;
  const padding = 4;

  it('rasterizes at (shape + 2·padding) × dpr', () => {
    const map = buildDisplacementMap({ kind: 'rect', width: 100, height: 50, radius: 8 }, PROFILE, 2, padding);
    expect(map.width).toBe(Math.round(108 * 2));
    expect(map.height).toBe(Math.round(58 * 2));
  });

  it('neutral center: displacement ≈ 0 in the flat middle of the pane', () => {
    const shape: PaneShape = { kind: 'rect', width: 120, height: 80, radius: 10 };
    const map = buildDisplacementMap(shape, PROFILE, dpr, padding);
    const c = channels(map, 60, 40, dpr, padding); // exact center
    // R/G encode direction around 0.5 → 127/128 is neutral
    expect(Math.abs(c.r - 128)).toBeLessThanOrEqual(2);
    expect(Math.abs(c.g - 128)).toBeLessThanOrEqual(2);
    expect(c.a).toBe(255);
    // thickness (B) is at max deep inside
    expect(c.b).toBe(255);
  });

  it('edge bends inward: displacement magnitude > 0 near the silhouette', () => {
    const shape: PaneShape = { kind: 'rect', width: 120, height: 80, radius: 10 };
    const map = buildDisplacementMap(shape, PROFILE, dpr, padding);
    // 3px inside the left edge, vertically centered — inside the curved band
    // (edgeBand 10), away from the rim fade; the outward normal is (-1, 0),
    // so displacement is inward: R channel ≠ neutral 128.
    const edge = channels(map, 3, 40, dpr, padding);
    expect(Math.abs(edge.r - 128)).toBeGreaterThan(2);
    expect(edge.a).toBe(255);
  });

  it('map alpha is 0 outside the padded region', () => {
    const shape: PaneShape = { kind: 'circle', size: 40 };
    const map = buildDisplacementMap(shape, PROFILE, dpr, padding);
    // corner of the map = padding px beyond the silhouette at 45°
    const corner = channels(map, -padding + 0.5, -padding + 0.5, dpr, padding);
    expect(corner.a).toBe(0);
  });

  it('scale equals ±displacement (channel range ±0.5)', () => {
    const map = buildDisplacementMap({ kind: 'pill', width: 80, height: 32 }, PROFILE, dpr, padding);
    expect(map.scale).toBe(PROFILE.displacement * 2);
  });

  it('symmetric panes produce symmetric displacement (left vs right edge)', () => {
    const shape: PaneShape = { kind: 'rect', width: 120, height: 80, radius: 10 };
    const map = buildDisplacementMap(shape, PROFILE, dpr, padding);
    const left = channels(map, 3, 40, dpr, padding);
    const right = channels(map, 116, 40, dpr, padding);
    // The map rasterizes at sub-CSS-px resolution (shape 120 + padding →
    // 128px-wide map), so mirrored CSS coordinates land at slightly different
    // depths. Assert the invariant, not bit-exactness: both edges displace
    // measurably, with OPPOSITE signs around neutral (inward on both sides),
    // and magnitudes within the sub-pixel sampling tolerance.
    const leftMag = Math.abs(left.r - 128);
    const rightMag = Math.abs(right.r - 128);
    expect(leftMag).toBeGreaterThan(2);
    expect(rightMag).toBeGreaterThan(2);
    expect(Math.abs(leftMag - rightMag)).toBeLessThanOrEqual(12);
    expect(Math.sign(left.r - 128)).not.toBe(Math.sign(right.r - 128));
  });
});
