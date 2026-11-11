// Shared GLSL and the material patcher that gives every object in the world the same
// atmosphere: height fog with sun in-scattering, canopy sky-occlusion under the jungle,
// wind for vegetation and leaf translucency.
import * as THREE from "three";

// Uniforms shared by reference across every patched material.
export const G = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.2).normalize() },
  uSunColor: { value: new THREE.Color(1, 0.95, 0.85) },
  uFogColor: { value: new THREE.Color(0.62, 0.72, 0.82) },
  uFogSun: { value: new THREE.Color(1.0, 0.85, 0.6) },
  // x: base density, y: height falloff, z: fog base height, w: aerial density
  uFogParams: { value: new THREE.Vector4(0.0006, 0.014, 0.0, 0.00007) },
  uSkyLut: { value: null },
  uHeightTex: { value: null },
  uBiomeTex: { value: null },
  // x: world size, y: half size, z: samples per side, w: water level
  uTerrain: { value: new THREE.Vector4(1600, 800, 1024, 0) },
  // x,y: wind direction, z: strength, w: gust phase
  uWind: { value: new THREE.Vector4(0.8, 0.6, 1.0, 0) },
  uCanopy: { value: 1.0 },
  uNight: { value: 0 },
};

export const GLSL_COMMON = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uFogColor;
uniform vec3 uFogSun;
uniform vec4 uFogParams;
uniform sampler2D uHeightTex;
uniform sampler2D uBiomeTex;
uniform vec4 uTerrain;
uniform vec4 uWind;
uniform float uCanopy;
uniform float uNight;
uniform sampler2D uSkyLut;

float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y);
}
float fbm3(vec2 p){ return vnoise(p)*0.55 + vnoise(p*2.03+7.1)*0.3 + vnoise(p*4.11-3.7)*0.15; }

// exact bilinear height lookup (matches the CPU collision query)
float terrainHeight(vec2 xz){
  float n = uTerrain.z;
  vec2 f = (xz + uTerrain.y) / uTerrain.x * (n - 1.0);
  f = clamp(f, vec2(0.0), vec2(n - 1.001));
  ivec2 i = ivec2(floor(f)); vec2 t = f - vec2(i);
  float a = texelFetch(uHeightTex, i, 0).r, b = texelFetch(uHeightTex, i + ivec2(1,0), 0).r;
  float c = texelFetch(uHeightTex, i + ivec2(0,1), 0).r, d = texelFetch(uHeightTex, i + ivec2(1,1), 0).r;
  return mix(mix(a, b, t.x), mix(c, d, t.x), t.y);
}
vec3 biomeAt(vec2 xz){ return texture2D(uBiomeTex, (xz + uTerrain.y) / uTerrain.x).rgb; }

// Height fog integrated along the view ray + distance haze, with forward scattering
// toward the sun. Returns the fogged colour.
vec3 applyAtmosphere(vec3 col, vec3 ray){
  float dist = length(ray);
  vec3 dir = ray / max(dist, 1e-4);
  float y0 = cameraPosition.y - uFogParams.z;
  float k = uFogParams.y;
  float dy = ray.y;
  float od;
  if (abs(dy) > 0.01) od = uFogParams.x * exp(-k * max(y0, 0.0)) * (1.0 - exp(-k * dy)) / (k * dy) * dist;
  else od = uFogParams.x * exp(-k * max(y0, 0.0)) * dist;
  od += uFogParams.w * dist;
  float fogAmt = 1.0 - exp(-max(od, 0.0));
  // in-scattered light = the sky radiance just above the horizon in this direction
  vec3 hd = normalize(vec3(dir.x, max(dir.y, 0.0) * 0.5 + 0.03, dir.z));
  vec3 fc = texture2D(uSkyLut, vec2(atan(hd.z, hd.x) / 6.2831853 + 0.5, asin(hd.y) / 3.14159265 + 0.5)).rgb;
  fc = mix(uFogColor, fc, 0.85) + uFogSun * pow(max(dot(dir, uSunDir), 0.0), 8.0) * 0.12 * (1.0 - uNight);
  return mix(col, fc, fogAmt);
}

// How much open sky a point sees: dark under the jungle canopy, open on beaches and ridges.
float skyVisibility(vec3 wp){
  vec3 b = biomeAt(wp.xz);
  float ground = terrainHeight(wp.xz);
  float above = wp.y - ground;
  float canopy = b.r * (1.0 - b.b * 0.7) * uCanopy;
  float under = 1.0 - smoothstep(4.0, 24.0, above);
  return 1.0 - canopy * mix(0.45, 0.78, under);
}
`;

const FOG_VERT_PARS = /* glsl */ `varying vec3 vAtmoRay; varying vec3 vAtmoWorld;`;
const FOG_VERT = /* glsl */ `
  vAtmoRay = mvPosition.xyz * mat3(viewMatrix);
  vAtmoWorld = cameraPosition + vAtmoRay;
`;

// Wind displacement in world space. vertex colour: r = leaf flutter, g = branch bend, b = phase.
export const GLSL_WIND = /* glsl */ `
vec3 windOffset(vec3 wp, vec3 local, vec3 vc, float stiffness){
  float t = uTime;
  vec2 wd = uWind.xy;
  float strength = uWind.z;
  float phase = dot(wp.xz, vec2(0.031, 0.027)) + vc.b * 6.2831;
  float gust = 0.55 + 0.45 * sin(t * 0.35 + dot(wp.xz, wd) * 0.012) * sin(t * 0.21 + wp.x * 0.004);
  float h = max(local.y, 0.0);
  // whole plant bends away from the wind, more at the top (quadratic in height)
  float bend = (sin(t * 0.9 + phase) * 0.35 + 0.65) * gust * strength * h * h * 0.0016 / stiffness;
  vec3 off = vec3(wd.x, 0.0, wd.y) * bend;
  off.y -= bend * 0.3 * h * 0.05;
  // branches sway
  off += vec3(wd.x, 0.0, wd.y) * vc.g * sin(t * 1.7 + phase * 1.3) * 0.12 * gust * strength;
  // leaf flutter
  float fl = sin(t * 7.3 + phase * 9.0 + local.x * 3.0) * sin(t * 5.1 + local.z * 4.0);
  off += vec3(0.6, 1.0, 0.5) * fl * vc.r * 0.045 * (0.5 + gust) * strength;
  return off;
}
`;

const LEAF_DIRECT = /* glsl */ `
uniform vec3 uTranslucency;
void RE_Direct_Leaf( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
  RE_Direct_Physical( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
  // light passing through the leaf toward the viewer
  float back = saturate( dot( -geometryNormal, directLight.direction ) );
  float view = pow( saturate( dot( geometryViewDir, -directLight.direction ) ), 3.0 );
  reflectedLight.directDiffuse += directLight.color * material.diffuseColor * uTranslucency * ( back * 0.6 + view * 1.4 );
}
#undef RE_Direct
#define RE_Direct RE_Direct_Leaf
`;

/**
 * Patch a built-in material (MeshStandardMaterial / MeshPhysicalMaterial / MeshDepthMaterial).
 * opts.wind: 0 none, else stiffness (1 = soft grass/leaves, 4 = trunks)
 * opts.leaf: translucency colour (THREE.Color) for foliage
 * opts.csm: the CSM instance to register with
 * opts.sky: apply canopy sky-occlusion (default true)
 */
export function patchMaterial(mat, opts = {}) {
  const wind = opts.wind || 0;
  const isDepth = mat.isMeshDepthMaterial || mat.isMeshDistanceMaterial;
  let prev = null;
  if (opts.csm && !isDepth) {
    opts.csm.setupMaterial(mat);
    prev = mat.onBeforeCompile;
  }
  const uTrans = { value: opts.leaf ? opts.leaf.clone() : new THREE.Color(0, 0, 0) };
  const extra = opts.extra || null;
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    for (const k in G) shader.uniforms[k] = G[k];
    if (opts.leaf) shader.uniforms.uTranslucency = uTrans;
    if (opts.alphaMip) shader.uniforms.uMapSize = { value: opts.alphaMip };
    if (extra && extra.uniforms) Object.assign(shader.uniforms, extra.uniforms);
    let vs = shader.vertexShader;
    let fs = shader.fragmentShader;
    vs = vs.replace("#include <common>", "#include <common>\n" + GLSL_COMMON + (wind ? GLSL_WIND + "\nattribute vec4 aWind;\nvarying float vAO;\n" : "") + FOG_VERT_PARS + (extra && extra.vertexPars ? extra.vertexPars : ""));
    if (wind) {
      // displace in world space, after instancing
      vs = vs.replace("#include <project_vertex>", /* glsl */ `
        vec4 wpos = vec4( transformed, 1.0 );
        #ifdef USE_BATCHING
          wpos = batchingMatrix * wpos;
        #endif
        #ifdef USE_INSTANCING
          wpos = instanceMatrix * wpos;
        #endif
        wpos = modelMatrix * wpos;
        vec3 wvc = aWind.rgb;
        vAO = aWind.a;
        wpos.xyz += windOffset( wpos.xyz, transformed, wvc, ${wind.toFixed(2)} );
        vec4 mvPosition = viewMatrix * wpos;
        gl_Position = projectionMatrix * mvPosition;
      `);
    }
    if (extra && extra.vertex) vs = vs.replace("#include <fog_vertex>", "#include <fog_vertex>\n" + extra.vertex);
    if (!isDepth) {
      vs = vs.replace("#include <fog_vertex>", "#include <fog_vertex>\n" + FOG_VERT);
      fs = fs.replace("#include <common>", "#include <common>\n" + GLSL_COMMON + FOG_VERT_PARS + (wind ? "\nvarying float vAO;\n" : "") + (opts.alphaMip ? "\nuniform vec2 uMapSize;\n" : "") + (extra && extra.fragmentPars ? extra.fragmentPars : ""));
      if (opts.leaf) {
        fs = fs.replace("#include <alphatest_fragment>", /* glsl */ `
          {
            float camD = length(vAtmoRay);
            float keep = smoothstep(0.6, 1.9, camD);
            if (keep < 0.999 && hash12(gl_FragCoord.xy) > keep) discard;
          }
          #include <alphatest_fragment>`);
      }
      if (opts.alphaMip) {
        fs = fs.replace("#include <alphatest_fragment>", /* glsl */ `
          {
            vec2 tx = vMapUv * uMapSize;
            float lod = max(0.0, 0.5 * log2(max(dot(dFdx(tx), dFdx(tx)), dot(dFdy(tx), dFdy(tx)))));
            diffuseColor.a *= 1.0 + lod * 0.32;
          }
          #include <alphatest_fragment>`);
      }
      if (wind) {
        fs = fs.replace("#include <color_fragment>", "#include <color_fragment>\n diffuseColor.rgb *= mix(0.42, 1.0, vAO);");
        fs = fs.replace("#include <aomap_fragment>", "#include <aomap_fragment>\n reflectedLight.indirectDiffuse *= mix(0.3, 1.0, vAO * vAO);");
      }
      if (opts.leaf) fs = fs.replace("#include <lights_physical_pars_fragment>", "#include <lights_physical_pars_fragment>\n" + LEAF_DIRECT);
      if (opts.sky !== false) {
        fs = fs.replace("#include <lights_fragment_maps>", /* glsl */ `
          #include <lights_fragment_maps>
          {
            float sv = skyVisibility( vAtmoWorld );
            iblIrradiance *= sv * vec3(0.92, 1.0, 0.9) + (1.0 - sv) * vec3(0.0);
            #if defined( RE_IndirectSpecular ) && defined( USE_ENVMAP )
              radiance *= mix( 0.25, 1.0, sv );
            #endif
          }
        `);
      }
      if (extra && extra.fragment) fs = fs.replace("#include <opaque_fragment>", extra.fragment + "\n#include <opaque_fragment>");
      fs = fs.replace("#include <fog_fragment>", "gl_FragColor.rgb = applyAtmosphere( gl_FragColor.rgb, vAtmoRay );");
    }
    shader.vertexShader = vs;
    shader.fragmentShader = fs;
  };
  const key = `isl:${wind}:${opts.leaf ? 1 : 0}:${opts.sky !== false ? 1 : 0}:${opts.alphaMip ? 1 : 0}:${extra ? extra.key || "x" : ""}`;
  mat.customProgramCacheKey = () => key;
  mat.userData.patched = true;
  return mat;
}

/** Depth material for shadow casting of wind-animated, alpha-tested foliage. */
export function windDepthMaterial(map, wind, alphaTest = 0.5) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: map || null, alphaTest: map ? alphaTest : 0 });
  if (map) m.side = THREE.DoubleSide;
  return patchMaterial(m, { wind });
}
