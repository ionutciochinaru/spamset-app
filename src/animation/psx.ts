/**
 * PlayStation-1 style rendering, rebuilt for three.js:
 * - the scene renders into a small target (about 256 px on the long side) that is
 *   shown with hard, unfiltered pixels;
 * - vertices snap to that low-res pixel grid, giving the characteristic wobble;
 * - colours drop to 15-bit (5 bits per channel) with 4x4 ordered dithering.
 * Faceted models (flat lighting) complete the look. Works on web and native (expo-gl),
 * because it does not depend on browser image scaling.
 */
import * as THREE from 'three';

/** Pixels on the long side of the low-res frame. */
export const PSX_RESOLUTION = 256;

const grid = { value: new THREE.Vector2(PSX_RESOLUTION / 2, PSX_RESOLUTION / 2) };

/** Patch every material under `root` to snap its vertices to the low-res grid (once each). */
export function snapVertices(root: THREE.Object3D) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (material.userData.psx) continue;
      material.userData.psx = true;
      const previous = material.onBeforeCompile;
      material.onBeforeCompile = (shader, renderer) => {
        previous?.call(material, shader, renderer);
        shader.uniforms.psxGrid = grid;
        shader.vertexShader = shader.vertexShader
          .replace('void main() {', 'uniform vec2 psxGrid;\nvoid main() {')
          .replace(
            '#include <project_vertex>',
            `#include <project_vertex>
            {
              vec2 ndc = gl_Position.xy / gl_Position.w;
              ndc = floor(ndc * psxGrid + 0.5) / psxGrid;
              gl_Position.xy = ndc * gl_Position.w;
            }`,
          );
      };
      material.needsUpdate = true;
    }
  });
}

const quadVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const quadFragment = /* glsl */ `
  uniform sampler2D frame;
  uniform vec2 resolution;
  varying vec2 vUv;

  float bayer4(vec2 p) {
    int x = int(mod(p.x, 4.0));
    int y = int(mod(p.y, 4.0));
    int i = x + y * 4;
    float m[16];
    m[0] = 0.0;  m[1] = 8.0;  m[2] = 2.0;  m[3] = 10.0;
    m[4] = 12.0; m[5] = 4.0;  m[6] = 14.0; m[7] = 6.0;
    m[8] = 3.0;  m[9] = 11.0; m[10] = 1.0; m[11] = 9.0;
    m[12] = 15.0; m[13] = 7.0; m[14] = 13.0; m[15] = 5.0;
    for (int k = 0; k < 16; k++) if (k == i) return m[k] / 16.0;
    return 0.0;
  }

  void main() {
    vec4 color = texture2D(frame, vUv);
    gl_FragColor = linearToOutputTexel(color);
    // 15-bit colour with ordered dithering, per low-res pixel.
    vec2 pixel = floor(vUv * resolution);
    float d = bayer4(pixel) - 0.5;
    gl_FragColor.rgb = clamp(floor(gl_FragColor.rgb * 31.0 + 0.5 + d) / 31.0, 0.0, 1.0);
  }
`;

/** Renders a scene through the low-res PSX frame. */
export class PSXPass {
  private target = new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    generateMipmaps: false,
  });
  private material = new THREE.ShaderMaterial({
    uniforms: { frame: { value: this.target.texture }, resolution: { value: new THREE.Vector2(1, 1) } },
    vertexShader: quadVertex,
    fragmentShader: quadFragment,
    depthTest: false,
    depthWrite: false,
  });
  private quad = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  constructor() {
    this.quad.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
  }

  render(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, width: number, height: number) {
    const scale = PSX_RESOLUTION / Math.max(width, height, 1);
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    if (this.target.width !== w || this.target.height !== h) this.target.setSize(w, h);
    grid.value.set(w / 2, h / 2);
    this.material.uniforms.resolution.value.set(w, h);
    gl.setRenderTarget(this.target);
    gl.render(scene, camera);
    gl.setRenderTarget(null);
    gl.render(this.quad, this.camera);
  }

  dispose() {
    this.target.dispose();
    this.material.dispose();
  }
}
