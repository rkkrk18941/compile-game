// Compresses The・Island GLB assets in place: dedup, prune, reorder, quantize and
// EXT_meshopt_compression. Run after re-exporting assets from island/blender/*.py.
//
//   node tools/optimize-island.mjs [files...]
import { NodeIO, PropertyType } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, reorder, quantize } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";
import { readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "island", "assets");
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  "meshopt.encoder": MeshoptEncoder,
  "meshopt.decoder": MeshoptDecoder,
});

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".glb")) out.push(p);
  }
  return out;
}

const files = process.argv.slice(2).length ? process.argv.slice(2) : walk(root);
let before = 0, after = 0;
for (const f of files) {
  const doc = await io.read(f);
  if (doc.getRoot().listExtensionsUsed().some((e) => e.extensionName === "EXT_meshopt_compression")) {
    console.log("skip (already compressed)", f);
    continue;
  }
  const size0 = statSync(f).size;
  await doc.transform(
    // keep materials: the game binds textures by material name, and texture-less
    // materials that differ only by name would otherwise be merged
    dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.MESH, PropertyType.TEXTURE] }),
    prune({ keepAttributes: true, keepLeaves: true }),
    reorder({ encoder: MeshoptEncoder }),
    quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeColor: 8, quantizeWeight: 8 }),
  );
  doc.createExtension((await import("@gltf-transform/extensions")).EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: "filter" });
  await io.write(f, doc);
  const size1 = statSync(f).size;
  before += size0;
  after += size1;
  console.log(`${f.replace(root + "/", "")}: ${(size0 / 1024).toFixed(0)} KB -> ${(size1 / 1024).toFixed(0)} KB`);
}
console.log(`total ${(before / 1048576).toFixed(1)} MB -> ${(after / 1048576).toFixed(1)} MB`);
