import * as THREE from 'three';
const Y_AXIS = new THREE.Vector3(0, 1, 0);
function merged(parts) {
  const geometries = parts.map((part) => {
    const geometry = part.index ? part.toNonIndexed() : part;
    if (geometry !== part) part.dispose();
    return geometry;
  });
  const count = geometries.reduce((sum, geometry) => sum + geometry.attributes.position.count, 0);
  const output = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const data = new Float32Array(count * 3);
    let offset = 0;
    for (const geometry of geometries) {
      data.set(geometry.attributes[name].array, offset);
      offset += geometry.attributes[name].array.length;
    }
    output.setAttribute(name, new THREE.BufferAttribute(data, 3));
  }
  geometries.forEach((geometry) => geometry.dispose());
  output.computeBoundingBox();
  output.computeBoundingSphere();
  return output;
}

function coloured(geometry, colour) {
  if (colour === null && geometry.hasAttribute('color')) return geometry;
  const base = typeof colour === 'function' ? null : new THREE.Color(colour);
  const normal = geometry.attributes.normal;
  const position = geometry.attributes.position;
  const values = new Float32Array(geometry.attributes.position.count * 3);
  for (let i = 0; i < normal.count; i++) {
    const c = base || new THREE.Color(colour(position.getX(i), position.getY(i), position.getZ(i)));
    const shade = 0.975 + normal.getY(i) * 0.035 - normal.getX(i) * 0.012;
    values[i * 3] = c.r * shade;
    values[i * 3 + 1] = c.g * shade;
    values[i * 3 + 2] = c.b * shade;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(values, 3));
  return geometry;
}

export function workshop() {
  const parts = new Map([['body', []]]);
  let active = 'body';
  const pivots = { body: [0, 0, 0] };
  function add(geometry, colour, position = [0, 0, 0], rotation = [0, 0, 0]) {
    geometry.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(...position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
      new THREE.Vector3(1, 1, 1),
    ));
    parts.get(active).push(coloured(geometry, colour));
  }
  return {
    add,
    section(name, pivot) {
      active = name;
      if (!parts.has(name)) parts.set(name, []);
      pivots[name] = pivot;
    },
    sphere(colour, position, scale, rotation = [0, 0, 0], segments = 24) {
      const geometry = new THREE.SphereGeometry(1, segments, 16);
      geometry.scale(...scale);
      add(geometry, colour, position, rotation);
    },
    box(colour, position, size, rotation = [0, 0, 0], radius = 0.05) {
      const [width, height, depth] = size;
      const r = Math.min(radius, width / 3, height / 3, depth / 3);
      const x = -width / 2 + r;
      const y = -height / 2 + r;
      const w = width - r * 2;
      const h = height - r * 2;
      const shape = new THREE.Shape();
      shape.moveTo(x, y - r);
      shape.lineTo(x + w, y - r);
      shape.quadraticCurveTo(x + w + r, y - r, x + w + r, y);
      shape.lineTo(x + w + r, y + h);
      shape.quadraticCurveTo(x + w + r, y + h + r, x + w, y + h + r);
      shape.lineTo(x, y + h + r);
      shape.quadraticCurveTo(x - r, y + h + r, x - r, y + h);
      shape.lineTo(x - r, y);
      shape.quadraticCurveTo(x - r, y - r, x, y - r);
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: Math.max(0.005, depth - r * 2),
        bevelEnabled: true,
        bevelSegments: 2,
        steps: 1,
        bevelSize: r * 0.45,
        bevelThickness: r,
        curveSegments: 4,
      });
      geometry.translate(0, 0, -depth / 2 + r);
      add(geometry, colour, position, rotation);
    },
    tube(colour, points, radius = 0.035, closed = false) {
      const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)), closed);
      add(new THREE.TubeGeometry(curve, Math.min(96, Math.max(12, points.length * 7)), radius, 7, closed), colour);
    },
    rod(colour, start, end, radius, topRadius = radius) {
      const a = new THREE.Vector3(...start);
      const b = new THREE.Vector3(...end);
      const direction = b.clone().sub(a);
      const geometry = new THREE.CylinderGeometry(topRadius, radius, direction.length(), 14, 1);
      geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y_AXIS, direction.normalize()));
      add(geometry, colour, a.add(b).multiplyScalar(0.5).toArray());
    },
    lathe(colour, points, position, scale = [1, 1, 1], rotation = [0, 0, 0]) {
      const geometry = new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), 28);
      geometry.scale(...scale);
      add(geometry, colour, position, rotation);
    },
    shape(colour, points, depth, position, rotation = [0, 0, 0], bevel = 0.035) {
      const shape = new THREE.Shape();
      shape.moveTo(...points[0]);
      for (let i = 1; i < points.length; i++) shape.lineTo(...points[i]);
      shape.closePath();
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: true,
        bevelSegments: 3,
        steps: 1,
        bevelSize: bevel,
        bevelThickness: bevel,
      });
      geometry.translate(0, 0, -depth / 2);
      add(geometry, colour, position, rotation);
    },
    finish() {
      const chunks = [...parts].filter(([, geometries]) => geometries.length).map(([name, geometries]) => {
        const geometry = merged(geometries);
        const pivot = pivots[name];
        geometry.translate(-pivot[0], -pivot[1], -pivot[2]);
        return { name, geometry, pivot };
      });
      const geometry = merged(chunks.map((chunk) => chunk.geometry.clone().translate(...chunk.pivot)));
      const floor = geometry.boundingBox.min.y;
      if (Math.abs(floor) > 0.00001) {
        geometry.translate(0, -floor, 0);
        for (const chunk of chunks) chunk.pivot[1] -= floor;
      }
      return { chunks, geometry, height: geometry.boundingBox.max.y };
    },
  };
}
