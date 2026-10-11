// Exact frozen-data comparison and direct exported accessor verification.
// No image decoding, GPU, runtime controller, or live scene operation.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const base = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(base, 'sprout-prism-v005.manifest.json')));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
function glb(p) {
  const bytes = fs.readFileSync(p), length = bytes.readUInt32LE(12);
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  return { bytes, doc: JSON.parse(bytes.subarray(20, 20+length)), bin: bytes.subarray(28+length) };
}
const old = glb(manifest.baseline_path), current = glb(manifest.path), source = glb(manifest.source_export);
assert.equal(sha(old.bytes), manifest.baseline_sha256);
assert.equal(sha(current.bytes), manifest.sha256);
assert.equal(sha(source.bytes), manifest.source_export_sha256);
assert.equal(sha(fs.readFileSync(manifest.editable_source)), manifest.editable_source_sha256);
const width = { SCALAR:1, VEC2:2, VEC3:3, VEC4:4, MAT4:16 };
const size = { 5121:1, 5123:2, 5125:4, 5126:4 };
function raw(g, i) {
  const a=g.doc.accessors[i], v=g.doc.bufferViews[a.bufferView];
  assert(!a.sparse); const element=width[a.type]*size[a.componentType];
  assert(!v.byteStride || v.byteStride===element);
  const start=(v.byteOffset??0)+(a.byteOffset??0);
  return g.bin.subarray(start, start+a.count*element);
}
function numbers(g, i) {
  const a=g.doc.accessors[i], b=raw(g,i); assert.equal(a.componentType,5126);
  return Array.from({ length:b.length/4 },(_,j)=>b.readFloatLE(j*4));
}
const node=(g,name)=>g.doc.nodes.find(n=>n.name===name);
const mesh=(g,name)=>g.doc.meshes[node(g,name).mesh];
function equalAccessor(a,b,label) {
  assert(raw(old,a).equals(raw(current,b)),label);
  for(const field of ['type','componentType','count','normalized'])
    assert.equal(old.doc.accessors[a][field],current.doc.accessors[b][field],label+'/'+field);
}
const checks={};
const absent=manifest.removed_rendered_objects;
assert(absent.every(name=>!node(current,name)));
assert.equal(current.doc.meshes.length,7);
assert.equal(current.doc.skins[0].joints.length,9);
checks.obsolete_cover_nodes_absent=true;
let unchangedStreams=0;
for(const n of current.doc.nodes) {
  const before=node(old,n.name); assert(before,n.name);
  const semantic=(g,x)=>Object.fromEntries(Object.entries(x).filter(([k])=>!['mesh','children'].includes(k)));
  assert.deepEqual(semantic(old,before),semantic(current,n),'node/'+n.name);
  const children=(g,x)=>(x.children??[]).map(i=>g.doc.nodes[i].name).filter(name=>!absent.includes(name));
  assert.deepEqual(children(old,before),children(current,n),'children/'+n.name);
  if(n.mesh===undefined) continue;
  const a=mesh(old,n.name), b=mesh(current,n.name);
  assert.equal(a.primitives.length,b.primitives.length);
  for(let p=0;p<a.primitives.length;p++) {
    const x=a.primitives[p], y=b.primitives[p];
    assert.deepEqual(Object.keys(x.attributes),Object.keys(y.attributes));
    for(const key of Object.keys(x.attributes)) {
      equalAccessor(x.attributes[key],y.attributes[key],n.name+'/'+key); unchangedStreams++;
    }
    equalAccessor(x.indices,y.indices,n.name+'/indices'); unchangedStreams++;
    assert.deepEqual(old.doc.materials[x.material],current.doc.materials[y.material],n.name+'/material');
    if(!n.name.startsWith('EYE_')) {
      assert.deepEqual(a.extras,b.extras,n.name+'/extras');
      assert.deepEqual(a.weights,b.weights,n.name+'/weights');
      assert.equal(x.targets?.length,y.targets?.length);
      for(let t=0;t<(x.targets?.length??0);t++) for(const key of Object.keys(x.targets[t])) {
        equalAccessor(x.targets[t][key],y.targets[t][key],n.name+'/morph'+t+'/'+key); unchangedStreams++;
      }
    } else {
      assert.deepEqual(b.extras.targetNames,['CloseHappy']); assert.deepEqual(b.weights,[0]);
      assert.equal(y.targets.length,1);
      assert.deepEqual(Object.keys(y.targets[0]).sort(),['NORMAL','POSITION']);
      for(const i of Object.values(y.targets[0])) assert(numbers(current,i).every(Number.isFinite));
      assert(numbers(current,y.targets[0].POSITION).some(v=>Math.abs(v)>.001));
    }
  }
}
checks.retained_node_transforms_and_hierarchy_exact=true;
checks.retained_basis_indices_materials_and_paired_body_morphs_exact=true;
checks.retained_geometry_streams=unchangedStreams;
for(let i=0;i<old.doc.images.length;i++) {
  const a=old.doc.bufferViews[old.doc.images[i].bufferView],b=current.doc.bufferViews[current.doc.images[i].bufferView];
  assert(old.bin.subarray(a.byteOffset??0,(a.byteOffset??0)+a.byteLength).equals(current.bin.subarray(b.byteOffset??0,(b.byteOffset??0)+b.byteLength)));
}
assert.deepEqual(old.doc.textures,current.doc.textures); assert.deepEqual(old.doc.samplers,current.doc.samplers);
equalAccessor(old.doc.skins[0].inverseBindMatrices,current.doc.skins[0].inverseBindMatrices,'inverseBindMatrices');
assert.deepEqual(old.doc.skins[0].joints.map(i=>old.doc.nodes[i].name),current.doc.skins[0].joints.map(i=>current.doc.nodes[i].name));
checks.embedded_texture_pixels_bytes_and_skin_exact=true;
function channels(g,a) {
  return new Map(a.channels.map(c=>[g.doc.nodes[c.target.node].name+'/'+c.target.path,a.samplers[c.sampler]]));
}
const eyes=['EYE_L','EYE_R'], glints=['GLINT_L','GLINT_R'];
const clips=[];
for(const animation of current.doc.animations) {
  const before=old.doc.animations.find(a=>a.name===animation.name); assert(before);
  const a=channels(old,before),b=channels(current,animation), changed=manifest.eye_clips[animation.name];
  for(const [name,s] of a) {
    if(changed && name.startsWith('LID_')) continue;
    const after=b.get(name); assert(after,name);
    equalAccessor(s.input,after.input,animation.name+'/'+name+'/times');
    equalAccessor(s.output,after.output,animation.name+'/'+name+'/values');
    assert.equal(s.interpolation,after.interpolation); unchangedStreams+=2;
  }
  const duration=Math.max(...animation.samplers.map(s=>Math.max(...numbers(current,s.input))));
  const oldDuration=Math.max(...before.samplers.map(s=>Math.max(...numbers(old,s.input))));
  assert.equal(duration,oldDuration);
  if(changed) {
    assert.equal(b.size,a.size+2); assert.equal(b.size,changed.channels);
    for(const e of eyes) {
      const s=b.get(e+'/weights'); assert(s); const values=numbers(current,s.output);
      if(animation.name==='Sprout_SleepLoop') {
        assert.equal(values.length,2); assert(values.every(v=>v===1));
      } else {
        assert.equal(values.length,changed.source_closure_samples.length);
        values.forEach((v,i)=>assert(Math.abs(v-changed.source_closure_samples[i])<1e-5));
      }
      assert.deepEqual(numbers(current,s.input),numbers(source,channels(source,source.doc.animations.find(a=>a.name===animation.name)).get(e+'/weights').input));
    }
    for(const g of glints) {
      const s=b.get(g+'/scale'); assert(s); const vals=numbers(current,s.output);
      assert(vals.every(v=>Number.isFinite(v)&&v>=.000999&&v<=1.000001));
      if(animation.name==='Sprout_SleepLoop') assert(vals.every(v=>Math.abs(v-.001)<1e-7));
    }
  } else assert.equal(a.size,b.size);
  clips.push({ name:animation.name, duration, channels:b.size, eye_channels_changed:Boolean(changed) });
}
assert.equal(clips.length,11);
checks.all_11_clip_durations_and_non_eye_streams_exact=true;
checks.all_authored_eye_sample_vectors_and_glint_scales_valid=true;
const report={pass:true,asset:manifest.path,sha256:manifest.sha256,bytes:current.bytes.length,
  baseline_sha256:manifest.baseline_sha256,source_sha256:manifest.editable_source_sha256,
  checks,clips,scope:'Direct actual GLB accessor bytes and topology; image bytes preserved but not decoded here. No browser/material appearance, native timing or source-render claims.'};
const output=path.join(base,'proofs','v005-frozen-data-audit.json');
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({output,pass:true,checks,clips:clips.length}));
