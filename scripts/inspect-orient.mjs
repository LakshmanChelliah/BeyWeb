import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read('rock_leone.glb');
const pos = doc.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute('POSITION').getArray();
let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,minZ=Infinity,maxZ=-Infinity;
for (let i=0;i<pos.length;i+=3){
  minX=Math.min(minX,pos[i]); maxX=Math.max(maxX,pos[i]);
  minY=Math.min(minY,pos[i+1]); maxY=Math.max(maxY,pos[i+1]);
  minZ=Math.min(minZ,pos[i+2]); maxZ=Math.max(maxZ,pos[i+2]);
}
console.log('bbox', {minX,maxX,minY,maxY,minZ,maxZ});
console.log('sizes', {x:maxX-minX,y:maxY-minY,z:maxZ-minZ});
