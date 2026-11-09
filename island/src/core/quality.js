// Picks a rendering tier for the device and keeps the frame rate up with dynamic resolution.
// tier 0: low phones, 1: typical phones / laptops, 2: desktop GPUs, 3: ultra
const KEY = "island.quality";

export function detectQuality(renderer) {
  const gl = renderer.getContext();
  let gpu = "";
  try {
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  } catch (e) { gpu = ""; }
  gpu = String(gpu || "");
  const ua = navigator.userAgent || "";
  const touch = matchMedia("(pointer: coarse)").matches || /iPhone|iPad|Android/i.test(ua);
  const small = Math.min(screen.width, screen.height) < 820;
  const mobile = touch && (small || /iPhone|Android/i.test(ua));
  let tier = 2;
  if (mobile) {
    tier = 1;
    if (/Mali-G(5|6)|Mali-T|Adreno \(TM\) [3-5]|PowerVR|SwiftShader/i.test(gpu)) tier = 0;
    if (/Apple GPU/i.test(gpu) && Math.max(screen.width, screen.height) * devicePixelRatio > 2400) tier = 1;
  } else {
    if (/Intel|SwiftShader|llvmpipe|Mali|Adreno/i.test(gpu)) tier = 1;
    if (/NVIDIA|GeForce|RTX|Radeon RX|Radeon Pro|Apple M[1-9] (Pro|Max|Ultra)/i.test(gpu)) tier = 2;
    if (/RTX (30|40|50)|RX (6|7|9)[0-9]{3}|M[2-9] (Max|Ultra)/i.test(gpu)) tier = 3;
  }
  if (/SwiftShader|llvmpipe/i.test(gpu)) tier = 0;
  const saved = localStorage.getItem(KEY);
  const forced = new URLSearchParams(location.search).get("q");
  if (forced !== null && forced !== "") tier = Math.max(0, Math.min(3, +forced));
  else if (saved !== null) tier = Math.max(0, Math.min(3, +saved));
  return makeQuality(tier, { gpu, mobile });
}

export function makeQuality(tier, info = {}) {
  const dpr = window.devicePixelRatio || 1;
  const q = {
    tier,
    gpu: info.gpu || "",
    mobile: !!info.mobile,
    pixelRatio: [1, Math.min(dpr, 1.5), Math.min(dpr, 1.75), Math.min(dpr, 2)][tier],
    minPixelRatio: [0.6, 0.7, 0.85, 1][tier],
    msaa: tier >= 2 ? 4 : 0,
    shadowCascades: [1, 1, 3, 3][tier],
    shadowSize: [1024, 2048, 2048, 4096][tier],
    shadowFar: [45, 65, 140, 220][tier],
    bloom: tier >= 1,
    godrays: tier >= 2,
    foliageDensity: [0.45, 0.7, 1, 1.25][tier],
    grassDensity: [0.35, 0.65, 1, 1.4][tier],
    grassRadius: [11, 16, 23, 30][tier],
    viewDist: [700, 1100, 2400, 3200][tier],
    layerSize: tier >= 2 ? 1024 : 512,
  };
  return q;
}

export function saveQuality(tier) {
  localStorage.setItem(KEY, String(tier));
}

/** Adjusts the render scale to hold a target frame time. */
export class DynamicResolution {
  constructor(quality, apply) {
    this.q = quality;
    this.apply = apply;
    this.scale = 1;
    this.acc = 0;
    this.frames = 0;
    this.target = quality.mobile ? 1 / 32 : 1 / 55;
    this.cool = 2;
  }
  tick(dt) {
    this.acc += Math.min(dt, 0.1);
    this.frames++;
    this.cool -= dt;
    if (this.acc < 1.0) return;
    const avg = this.acc / this.frames;
    this.acc = 0;
    this.frames = 0;
    if (this.cool > 0) return;
    let s = this.scale;
    if (avg > this.target * 1.18) s *= 0.9;
    else if (avg < this.target * 0.8) s *= 1.05;
    const minS = this.q.minPixelRatio / this.q.pixelRatio;
    s = Math.max(minS, Math.min(1, s));
    if (Math.abs(s - this.scale) > 0.02) {
      this.scale = s;
      this.apply(this.q.pixelRatio * s);
      this.cool = 1.5;
    }
  }
}
