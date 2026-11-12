import * as THREE from 'three';
import { makeMao, makeJiahao, makeKun } from './models/animals-and-human.js';
import { makeMengqi, makeNailong, makeNaiwa } from './models/creatures.js';

const builders = { mao: makeMao, jiahao: makeJiahao, mengqi: makeMengqi, kun: makeKun, nailong: makeNailong, naiwa: makeNaiwa };
const cache = new Map();
const surface = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .67, metalness: .015 });
const furSurface = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .92, metalness: 0 });
const contour = new THREE.MeshBasicMaterial({color:'#263638',side:THREE.BackSide});

function definition(kind) {
  if (!Object.hasOwn(builders, kind)) throw new RangeError(`Unknown character kind: ${kind}`);
  if (!cache.has(kind)) cache.set(kind, builders[kind]());
  return cache.get(kind);
}

export function createCharacter(kind, { outline = false } = {}) {
  const model=definition(kind), root=new THREE.Group(), chunks=new Map();
  root.name='character-'+kind;
  for (const chunk of model.chunks) {
    const pivot=new THREE.Group();pivot.name=chunk.name;pivot.position.set(...chunk.pivot);
    const mesh=new THREE.Mesh(chunk.geometry,kind==='mao'||kind==='mengqi'?furSurface:surface);
    mesh.castShadow=mesh.receiveShadow=true;pivot.add(mesh);
    if(outline){const edge=new THREE.Mesh(chunk.geometry,contour);edge.scale.setScalar(1.008);pivot.add(edge);}
    root.add(pivot);chunks.set(chunk.name,pivot);
  }
  root.userData.kind=kind;root.userData.height=model.height;
  root.userData.animate=time=>{
    const body=chunks.get('body');if(body)body.scale.y=1+Math.sin(time*1.55)*.004;
    const head=chunks.get('head');if(head){head.rotation.y=Math.sin(time*.65)*.026;head.rotation.z=Math.sin(time*1.1)*(kind==='naiwa'?.018:.007);}
    const tail=chunks.get('tail');if(tail)tail.rotation.z=Math.sin(time*1.35)*.045;
    const ball=chunks.get('ball');if(ball)ball.rotation.y=Math.sin(time*.8)*.08;
  };
  return root;
}

export function getCharacterGeometry(kind) { return definition(kind).geometry.clone(); }
