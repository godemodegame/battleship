export const clamp01 = (x) => Math.min(1, Math.max(0, x));

export const mix = (a, b, k) => a + (b - a) * k;

export function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export const easeOutCubic = (t) => 1 - Math.pow(1 - clamp01(t), 3);

export const easeInQuad = (t) => clamp01(t) * clamp01(t);

export function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const x = clamp01(t);
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}
