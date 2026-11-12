import * as THREE from 'three';
import { getCharacterGeometry } from '../characters.js';
const cache = new Map();

export function getBattleGeometry(kind) {
  if (cache.has(kind)) return cache.get(kind);
  const source = getCharacterGeometry(kind), p = source.attributes.position, n = source.attributes.normal, c = source.attributes.color;
  const groups = new Map(), remap = new Uint32Array(p.count), clusters = [], cell = .065;
  for (let i = 0; i < p.count; i++) {
    const key = `${Math.round(p.getX(i)/cell)},${Math.round(p.getY(i)/cell)},${Math.round(p.getZ(i)/cell)},${Math.round(c.getX(i)*9)},${Math.round(c.getY(i)*9)},${Math.round(c.getZ(i)*9)}`;
    let id = groups.get(key);
    if (id === undefined) { id = clusters.length; groups.set(key,id); clusters.push({p:[0,0,0],n:[0,0,0],c:[0,0,0],count:0}); }
    const group=clusters[id];group.count++;
    for(let axis=0;axis<3;axis++){group.p[axis]+=p.array[i*3+axis];group.n[axis]+=n.array[i*3+axis];group.c[axis]+=c.array[i*3+axis];}
    remap[i]=id;
  }
  const indices=[];
  for(let i=0;i<p.count;i+=3){const a=remap[i],b=remap[i+1],d=remap[i+2];if(a!==b&&b!==d&&a!==d)indices.push(a,b,d);}
  const result=new THREE.BufferGeometry(), positions=[],normals=[],colors=[];
  for(const g of clusters){const length=Math.hypot(...g.n)||1;for(let axis=0;axis<3;axis++){positions.push(g.p[axis]/g.count);normals.push(g.n[axis]/length);colors.push(g.c[axis]/g.count);}}
  result.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  result.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  result.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));result.setIndex(indices);
  result.computeBoundingBox();result.translate(0,-result.boundingBox.min.y,0);result.computeBoundingSphere();
  source.dispose();cache.set(kind,result);return result;
}
