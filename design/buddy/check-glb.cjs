/* Independent exported-data audit. Run from repository root with Node. */
const fs = require('node:fs');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const path = require('node:path');
const file = path.resolve('public/buddy/insight-core-v1.glb');
const bytes = fs.readFileSync(file);
assert.equal(bytes.toString('ascii',0,4),'glTF');
assert.equal(bytes.readUInt32LE(4),2);
assert.equal(bytes.readUInt32LE(8),bytes.length);
const jsonLength = bytes.readUInt32LE(12);
const gltf = JSON.parse(bytes.subarray(20,20+jsonLength).toString());
const binaryStart = 28+jsonLength;
function samples(index) {
  const accessor = gltf.accessors[index], view = gltf.bufferViews[accessor.bufferView];
  assert.equal(accessor.componentType,5126);
  const size = {SCALAR:1,VEC3:3,VEC4:4}[accessor.type];
  assert.ok(size);
  const start = binaryStart+(view.byteOffset||0)+(accessor.byteOffset||0);
  return Array.from({length:accessor.count},(_,i)=>Array.from({length:size},(_,j)=>
    bytes.readFloatLE(start+i*(view.byteStride||size*4)+j*4)));
}
assert.equal(gltf.meshes.length,5);
assert.equal(gltf.cameras,undefined);
assert.equal(gltf.extensions?.KHR_lights_punctual,undefined);
assert.ok(gltf.nodes.every(n=>/^(HERO_|RIG_)/.test(n.name)));
assert.equal(gltf.animations.length,1);
const animation = gltf.animations[0];
assert.equal(animation.channels.length,3);
const tracks = animation.channels.map(channel=>{
  const sampler = animation.samplers[channel.sampler];
  const times = samples(sampler.input).flat(), values = samples(sampler.output);
  assert.equal(times[0],0); assert.equal(times.at(-1),6); assert.equal(times.length,145);
  assert.ok(values.flat().every(Number.isFinite));
  const first = values[0], last = values.at(-1);
  const seamError = channel.target.path==='rotation'
    ? Math.abs(1-Math.abs(first.reduce((sum,v,i)=>sum+v*last[i],0)))
    : Math.max(...first.map((v,i)=>Math.abs(v-last[i])));
  assert.ok(seamError<1e-5);
  const maximumStep = channel.target.path==='rotation'
    ? Math.max(...values.slice(1).map((value,i)=>2*Math.acos(Math.min(1,Math.abs(value.reduce((sum,v,j)=>sum+v*values[i][j],0))))))
    : Math.max(...values.slice(1).map((value,i)=>Math.max(...value.map((v,j)=>Math.abs(v-values[i][j])))));
  assert.ok(maximumStep<0.1);
  return {node:gltf.nodes[channel.target.node].name,path:channel.target.path,keys:times.length,seamError,maximumStep};
});
const report = {file:'public/buddy/insight-core-v1.glb',bytes:bytes.length,
  sha256:crypto.createHash('sha256').update(bytes).digest('hex'),
  meshes:gltf.meshes.map(m=>({name:m.name,vertices:m.primitives.reduce((n,p)=>n+gltf.accessors[p.attributes.POSITION].count,0),
    normals:m.primitives.every(p=>p.attributes.NORMAL!==undefined)})),
  animation:animation.name,durationSeconds:6,tracks,extensions:gltf.extensionsUsed,
  materials:gltf.materials};
assert.ok(report.meshes.every(m=>m.normals));
fs.writeFileSync(path.resolve('design/buddy/glb-audit.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({bytes:report.bytes,durationSeconds:6,tracks,meshes:report.meshes},null,2));
