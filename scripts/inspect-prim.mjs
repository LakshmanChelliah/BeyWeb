import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read('Rock_Leone.glb');
const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
const pos = prim.getAttribute('POSITION');
const idx = prim.getIndices();
console.log('pos count', pos.getCount(), 'componentType', pos.getComponentType(), 'type', pos.getType());
console.log('pos array len', pos.getArray().length, 'byteStride', pos.getByteStride());
console.log('idx count', idx.getCount(), 'componentType', idx.getComponentType());
console.log('idx array len', idx.getArray().length, 'max idx', Math.max(...idx.getArray()));
