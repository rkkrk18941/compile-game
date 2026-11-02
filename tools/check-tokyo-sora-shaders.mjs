// Optional Linux check: node tools/check-tokyo-sora-shaders.mjs
// Uses installed Mesa/EGL for actual GLES compilation, without browser automation.
import {build} from 'esbuild';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import * as THREE from 'three';
const root=resolve(import.meta.dirname,'..'),temp=mkdtempSync(resolve(tmpdir(),'tokyo-shaders-'));
try{
 const b=await build({entryPoints:[resolve(root,'tokyo-sora/src/shaders.js')],platform:'node',bundle:true,format:'esm',write:false});const path=resolve(temp,'shader.mjs');writeFileSync(path,b.outputFiles[0].text);const m=await import(pathToFileURL(path).href);
 const expand=src=>src.replace(/#include <([\w\d_]+)>/g,(_,name)=>{if(!THREE.ShaderChunk[name])throw Error('Missing shader chunk '+name);return expand(THREE.ShaderChunk[name]);});
 const common=`#version 300 es\nprecision highp float;precision highp int;\n#define USE_LOGDEPTHBUF\n#define HIGH_PRECISION\n#define texture2D texture\nuniform mat4 viewMatrix;uniform vec3 cameraPosition;\n`;
 const vp=common+`#define attribute in\n#define varying out\nuniform mat4 modelMatrix,modelViewMatrix,projectionMatrix;uniform mat3 normalMatrix;in vec3 position;in vec3 normal;in vec2 uv;\n`;
 const fp=common+`#define varying in\nout highp vec4 pc_fragColor;\n#define gl_FragColor pc_fragColor\n#define TONE_MAPPING\n`+THREE.ShaderChunk.tonemapping_pars_fragment+`\nvec3 toneMapping(vec3 c){return ACESFilmicToneMapping(c);}\n`+THREE.ShaderChunk.colorspace_pars_fragment+`\nvec4 linearToOutputTexel(vec4 v){return sRGBTransferOETF(v);}\n`;
 const materials={ground:m.groundMaterial(null,[0,0]),building:m.buildingMaterial(),road:m.overlayMaterial(),structure:m.structMaterial(),water:m.waterMaterial()};
 const sources=Object.entries(materials).map(([name,material])=>{const defs=Object.entries(material.defines||{}).map(([k,v])=>`#define ${k} ${v}\n`).join('');return {name,vertex:vp+defs+expand(material.vertexShader),fragment:fp+defs+expand(material.fragmentShader)};});
 const result=spawnSync('python',['tools/check-tokyo-sora-gles.py'],{cwd:root,input:JSON.stringify(sources),encoding:'utf8'});process.stdout.write(result.stdout||'');if(result.status!==0){process.stderr.write(result.stderr||'GLES verification unavailable\n');process.exitCode=1;}
}finally{rmSync(temp,{recursive:true,force:true});}
