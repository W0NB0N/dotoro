import { Framebuffer, type Kernel, crtPower } from '@dotoro/kernel';
import * as THREE from 'three';
import { createGlowUniforms } from './screenGlow';

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Pixels sit edge to edge with no gaps, and each one bleeds softly into its neighbours. Sampling at
// texel centres at LOD 0 keeps them crisp even though the texture is mipmapped for the glow.
// The vignette is a fit of the prototype's vignette.png (the same falloff on each axis, multiplied)
// at the prototype's 65% blend. It goes with the picture, so a screen that is off is plain glass.
//
// Scanlines run at two per pixel row, so they stay neutral on the row boundaries and don't bring
// back the grid. Bright pixels bloom over them, as phosphor does, and they fade out before they
// get too fine for the display and would shimmer. A faint refresh band rolls down the picture.
const fragmentShader = /* glsl */ `
  uniform sampler2D uScreen;
  uniform float uBrightness;
  uniform float uLit;
  uniform float uTime;
  uniform float uRoll;
  varying vec2 vUv;

  void main() {
    vec3 color = textureLod(uScreen, (floor(vUv * 32.0) + 0.5) / 32.0, 0.0).rgb;
    color += textureLod(uScreen, vUv, 1.5).rgb * 0.09;

    float lines = vUv.y * 64.0;
    float resolved = 1.0 - smoothstep(0.33, 0.5, fwidth(lines));
    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    float depth = 0.26 * resolved * mix(1.0, 0.55, clamp(luma, 0.0, 1.0));
    float dark = 0.5 + 0.5 * sin(lines * 6.2831853);
    color *= (1.0 - depth * dark) / (1.0 - depth * 0.5);

    float band = (vUv.y - fract(uTime / 7.0)) * 9.0;
    color *= 1.0 + uRoll * exp(-band * band);

    color *= uBrightness;

    vec2 falloff = 0.32 + 0.68 * sqrt(max(4.0 * vUv * (1.0 - vUv), 0.0));
    float vignette = pow(mix(1.0, falloff.x * falloff.y, 0.65 * uLit), 2.2);

    // Unlit pixels show the dark glass.
    gl_FragColor = vec4(max(color, vec3(0.012, 0.013, 0.016)) * vignette, 1.0);
    #include <colorspace_fragment>
  }
`;

const POWER_ON_SECONDS = 0.35;
const POWER_OFF_SECONDS = 0.55;
const GLOW_STRENGTH = 2.8;
const REFRESH_BAND = 0.05;

/** Shader material + 32x32 texture that mirrors `kernel.screen`. Call `update` every frame. */
export function createScreen(kernel: Kernel) {
  const pixels = new Uint8Array(32 * 32 * 4);
  const texture = new THREE.DataTexture(pixels, 32, 32, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.needsUpdate = true;

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uScreen: { value: texture },
      uBrightness: { value: 1.6 },
      uLit: { value: 0 },
      uTime: { value: 0 },
      uRoll: { value: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : REFRESH_BAND },
    },
    toneMapped: false,
  });
  const glow = createGlowUniforms(texture);

  // The kernel blanks its screen at power-off, so keep the last picture for the collapse.
  const lastPicture = new Framebuffer();
  const collapsing = new Framebuffer();
  let version = -1;
  let shutter = 1; // 0 = full picture, 1 = black
  let drawnShutter = -1;

  return {
    material,
    glow,
    update(delta: number) {
      const changed = kernel.version !== version;
      version = kernel.version;
      if (kernel.powered && changed) lastPicture.copyFrom(kernel.screen);

      shutter = kernel.powered
        ? Math.max(0, shutter - delta / POWER_ON_SECONDS)
        : Math.min(1, shutter + delta / POWER_OFF_SECONDS);

      if (changed || shutter !== drawnShutter) {
        drawnShutter = shutter;
        if (shutter === 0) {
          lastPicture.writeRGBA(pixels);
        } else {
          crtPower(lastPicture, collapsing, shutter);
          collapsing.writeRGBA(pixels);
        }
        texture.needsUpdate = true;
      }
      material.uniforms.uLit!.value = 1 - shutter;
      material.uniforms.uTime!.value += delta;
      glow.uGlowStrength.value = shutter < 1 ? GLOW_STRENGTH : 0;
    },
    dispose() {
      texture.dispose();
      material.dispose();
    },
  };
}
