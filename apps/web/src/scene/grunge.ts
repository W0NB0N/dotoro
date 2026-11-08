import * as THREE from 'three';

/**
 * Weathering for Dotoro's shell, so it belongs on a damp desk in a neon city: grey-green paint,
 * mossy patches, dirt that has run down in streaks, rust specks and fine scratches. All procedural,
 * in world space, so there is no texture to download and nothing stretches across UV seams.
 */
export interface Surface {
  /** Paint color the original is pulled toward. */
  tint: THREE.ColorRepresentation;
  /** 0 keeps the model's own color, 1 replaces it. */
  tintAmount: number;
  /** Color of the green-grey patches. */
  moss: THREE.ColorRepresentation;
  /** Overall weathering, 0 to 1. */
  grime: number;
}

/** Dark blue-grey: a cool, low-saturation base that lets the neon spilling onto it carry the color. */
export const SHELL: Surface = { tint: '#4a5670', tintAmount: 1, moss: '#262e3e', grime: 0.35 };
export const KEYS: Surface = { tint: '#22283a', tintAmount: 1, moss: '#171c28', grime: 0.25 };
export const POWER: Surface = { tint: '#2a2234', tintAmount: 1, moss: '#1c1624', grime: 0.25 };

/**
 * A backlit pixel icon on a key's top face. `rows` are 8 bits each, most significant bit on the
 * left, first row at the back of the key. `rect` is the icon's center and size across the top face,
 * as fractions of the key's bounding box.
 */
export interface KeyIcon {
  rows: readonly number[];
  color: THREE.ColorRepresentation;
  boxMin: THREE.Vector3;
  boxSize: THREE.Vector3;
  rect: readonly [number, number, number, number];
}

export const ICONS = {
  up: [0x18, 0x3c, 0x7e, 0xff, 0x18, 0x18, 0x18, 0x00],
  down: [0x00, 0x18, 0x18, 0x18, 0xff, 0x7e, 0x3c, 0x18],
  left: [0x10, 0x30, 0x70, 0xff, 0xff, 0x70, 0x30, 0x10],
  right: [0x08, 0x0c, 0x0e, 0xff, 0xff, 0x0e, 0x0c, 0x08],
  enter: [0x01, 0x01, 0x21, 0x61, 0xff, 0x60, 0x20, 0x00],
  menu: [0x00, 0x7e, 0x00, 0x7e, 0x00, 0x7e, 0x00, 0x00],
  power: [0x18, 0x5a, 0x99, 0x99, 0x81, 0x81, 0x42, 0x3c],
} as const;

export interface GrungeUniforms {
  uTint: { value: THREE.Color };
  uTintAmount: { value: number };
  uMoss: { value: THREE.Color };
  uGrime: { value: number };
  uIconOn: { value: number };
  uIconRows: { value: number[] };
  uIconColor: { value: THREE.Color };
  uKeyMin: { value: THREE.Vector3 };
  uKeySize: { value: THREE.Vector3 };
  uIconRect: { value: THREE.Vector4 };
}

export function grungeUniforms(surface: Surface, icon?: KeyIcon): GrungeUniforms {
  return {
    uTint: { value: new THREE.Color(surface.tint) },
    uTintAmount: { value: surface.tintAmount },
    uMoss: { value: new THREE.Color(surface.moss) },
    uGrime: { value: surface.grime },
    uIconOn: { value: icon ? 1 : 0 },
    uIconRows: { value: icon ? [...icon.rows] : [0, 0, 0, 0, 0, 0, 0, 0] },
    uIconColor: { value: new THREE.Color(icon?.color ?? '#000000') },
    uKeyMin: { value: icon?.boxMin.clone() ?? new THREE.Vector3() },
    uKeySize: { value: icon?.boxSize.clone() ?? new THREE.Vector3(1, 1, 1) },
    uIconRect: { value: new THREE.Vector4(...(icon?.rect ?? [0.5, 0.5, 1, 1])) },
  };
}

/** Vertex side: the key's own coordinates, so the icon sits on its top face whatever its transform. */
export const grungeVertexChunk = /* glsl */ `
  varying vec3 vKeyLocal;
  varying vec3 vKeyNormal;
`;
export const grungeVertex = /* glsl */ `
  vKeyLocal = position;
  vKeyNormal = normal;
`;

/** Declarations: needs `vGlowWorld`, the world position the screen glow already passes along. */
export const grungeChunk = /* glsl */ `
  uniform vec3 uTint;
  uniform float uTintAmount;
  uniform vec3 uMoss;
  uniform float uGrime;
  uniform float uIconOn;
  uniform int uIconRows[8];
  uniform vec3 uIconColor;
  uniform vec3 uKeyMin;
  uniform vec3 uKeySize;
  uniform vec4 uIconRect;
  varying vec3 vKeyLocal;
  varying vec3 vKeyNormal;

  float gHash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float gNoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(gHash(i), gHash(i + vec3(1, 0, 0)), f.x), mix(gHash(i + vec3(0, 1, 0)), gHash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(gHash(i + vec3(0, 0, 1)), gHash(i + vec3(1, 0, 1)), f.x), mix(gHash(i + vec3(0, 1, 1)), gHash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }

  float gFbm(vec3 p) {
    float sum = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
      sum += amp * gNoise(p);
      p *= 2.03;
      amp *= 0.5;
    }
    return sum;
  }
`;

/** Runs after <color_fragment>: repaints diffuseColor and leaves `gDirt` for the roughness pass. */
export const grungeColor = /* glsl */ `
  vec3 gp = vGlowWorld * 3.0;
  vec3 paint = mix(diffuseColor.rgb, uTint, uTintAmount);
  // Smudges where hands and grime have darkened the paint.
  float patches = gFbm(gp * 1.6);
  paint = mix(paint, uMoss, smoothstep(0.52, 0.7, patches) * 0.75 * uGrime);
  // A little dirt run down the sides.
  float gDirt = smoothstep(0.45, 0.8, gFbm(vec3(gp.x * 9.0, gp.y * 0.7, gp.z * 9.0)));
  paint *= 1.0 - gDirt * 0.18 * uGrime;
  // Rust specks.
  float speck = smoothstep(0.68, 0.76, gFbm(gp * 7.0));
  paint = mix(paint, vec3(0.12, 0.1, 0.06), speck * 0.6 * uGrime);
  // Fine scratches that catch the light.
  float scratch = step(0.982, gNoise(vec3(gp.x * 38.0 + gp.y * 11.0, gp.y * 3.0, gp.z * 38.0)));
  paint = mix(paint, paint * 1.7 + 0.04, scratch * 0.5 * uGrime);
  diffuseColor.rgb = paint;
  // The key's icon, on its top face only.
  float iconLit = 0.0;
  if (uIconOn > 0.5 && vKeyNormal.y > 0.55) {
    vec2 keyUv = (vKeyLocal.xz - uKeyMin.xz) / uKeySize.xz;
    vec2 cell = (keyUv - uIconRect.xy) / uIconRect.zw + 0.5;
    if (cell.x >= 0.0 && cell.x < 1.0 && cell.y >= 0.0 && cell.y < 1.0) {
      int ix = int(cell.x * 8.0);
      int iy = int(cell.y * 8.0);
      if (((uIconRows[iy] >> (7 - ix)) & 1) == 1) {
        diffuseColor.rgb = uIconColor * 0.4;
        iconLit = 1.0;
      }
    }
  }
`;

/** Runs after <emissivemap_fragment>: icons glow a little, as if backlit. */
export const grungeEmissive = /* glsl */ `
  totalEmissiveRadiance += uIconColor * iconLit * 0.7;
`;

/** Runs after <roughnessmap_fragment>: dirty paint is dull. */
export const grungeRoughness = /* glsl */ `
  roughnessFactor = clamp(roughnessFactor + 0.2 + gDirt * 0.25 * uGrime, 0.0, 1.0);
`;
