import * as THREE from 'three';
import {
  grungeChunk,
  grungeColor,
  grungeEmissive,
  grungeRoughness,
  grungeUniforms,
  grungeVertex,
  grungeVertexChunk,
  type KeyIcon,
  type Surface,
} from './grunge';

/**
 * The screen as a real light source. There is no averaged screen color: surfaces integrate the
 * actual picture over a grid of taps, each tap being a mip of the pixels in its zone and placed at
 * that zone's position on the screen. A red sprite on the left lights the left of the keypad red.
 */
export interface GlowUniforms {
  uGlowScreen: { value: THREE.Texture };
  uGlowCenter: { value: THREE.Vector3 };
  /** Half-extent vectors of the screen, along texture u and v. */
  uGlowU: { value: THREE.Vector3 };
  uGlowV: { value: THREE.Vector3 };
  uGlowNormal: { value: THREE.Vector3 };
  uGlowStrength: { value: number };
}

export function createGlowUniforms(screen: THREE.Texture): GlowUniforms {
  return {
    uGlowScreen: { value: screen },
    uGlowCenter: { value: new THREE.Vector3() },
    uGlowU: { value: new THREE.Vector3(1, 0, 0) },
    uGlowV: { value: new THREE.Vector3(0, -1, 0) },
    uGlowNormal: { value: new THREE.Vector3(0, 0, 1) },
    uGlowStrength: { value: 0 },
  };
}

/** 6x6 taps at mip 2.4: every pixel contributes, grouped in zones of about 5x5. */
const glowChunk = /* glsl */ `
  #define GLOW_TAPS 6
  #define GLOW_LOD 2.4
  uniform sampler2D uGlowScreen;
  uniform vec3 uGlowCenter;
  uniform vec3 uGlowU;
  uniform vec3 uGlowV;
  uniform vec3 uGlowNormal;
  uniform float uGlowStrength;

  vec3 screenIrradiance(vec3 P, vec3 N) {
    if (uGlowStrength <= 0.0 || dot(P - uGlowCenter, uGlowNormal) < 0.0) return vec3(0.0);
    vec3 sum = vec3(0.0);
    for (int j = 0; j < GLOW_TAPS; j++) {
      for (int i = 0; i < GLOW_TAPS; i++) {
        vec2 q = (vec2(float(i), float(j)) + 0.5) / float(GLOW_TAPS);
        vec3 L = uGlowCenter + uGlowU * (q.x * 2.0 - 1.0) + uGlowV * (q.y * 2.0 - 1.0) - P;
        float d2 = dot(L, L);
        vec3 dir = L / sqrt(d2);
        float facing = dot(N, dir);
        if (facing <= 0.0) continue;
        // Wider than Lambert, so light reaches the keypad at its grazing angle.
        float emit = 0.25 + 0.75 * max(-dot(uGlowNormal, dir), 0.0);
        sum += textureLod(uGlowScreen, q, GLOW_LOD).rgb * facing * emit / (d2 + 0.04);
      }
    }
    return sum * uGlowStrength / float(GLOW_TAPS * GLOW_TAPS);
  }

  // The picture blooming onto the bezel, measured across the plane of the screen so it stays
  // attached to the surface from every angle.
  vec3 screenBloom(vec3 P) {
    vec3 r = P - uGlowCenter;
    if (uGlowStrength <= 0.0 || dot(r, uGlowNormal) < 0.0) return vec3(0.0);
    vec2 p = vec2(dot(r, uGlowU) / dot(uGlowU, uGlowU), dot(r, uGlowV) / dot(uGlowV, uGlowV));
    float outside = length(max(abs(p) - 1.0, 0.0));
    return textureLod(uGlowScreen, clamp(p * 0.5 + 0.5, 0.0, 1.0), 3.0).rgb * exp(-outside * 5.0) * uGlowStrength * 0.06;
  }
`;

/** A copy of `source` that is lit by the screen. */
export function withScreenGlow(
  source: THREE.Material,
  uniforms: GlowUniforms,
  surface?: Surface,
  icon?: KeyIcon,
): THREE.Material {
  const material = source.clone();
  const weathering = surface ? grungeUniforms(surface, icon) : null;
  material.customProgramCacheKey = () => (weathering ? 'glow+grunge' : 'glow');
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    if (weathering) {
      Object.assign(shader.uniforms, weathering);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${grungeChunk}`)
        .replace('#include <color_fragment>', `#include <color_fragment>\n${grungeColor}`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${grungeRoughness}`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${grungeEmissive}`);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${grungeVertexChunk}`)
        .replace('#include <project_vertex>', `#include <project_vertex>\n${grungeVertex}`);
    }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGlowWorld;')
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvGlowWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vGlowWorld;\n${glowChunk}`)
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         totalEmissiveRadiance += diffuseColor.rgb *
           (screenIrradiance(vGlowWorld, inverseTransformDirection(normal, viewMatrix)) + screenBloom(vGlowWorld));`,
      );
  };
  return material;
}

const additive = {
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  premultipliedAlpha: true,
  toneMapped: false,
} as const;

/** The pool of screen light on the surface under Dotoro (the canvas has no real floor). */
export function createGlowFloorMaterial(uniforms: GlowUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    ...additive,
    uniforms: { ...uniforms },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      ${glowChunk}
      varying vec3 vWorld;
      varying vec2 vUv;
      void main() {
        vec3 light = 0.05 * screenIrradiance(vWorld, vec3(0.0, 1.0, 0.0));
        // Fades in from the plane of the screen, so there is no hard edge behind Dotoro.
        light *= smoothstep(0.0, 1.2, dot(vWorld - uGlowCenter, uGlowNormal));
        light *= 1.0 - smoothstep(0.12, 0.42, length(vUv - 0.5));
        gl_FragColor = vec4(light, max(light.r, max(light.g, light.b)));
        #include <colorspace_fragment>
      }
    `,
  });
}
