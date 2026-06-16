import * as THREE from 'three';
import { CONFIG } from '../config.js';

const DISH_RADIUS = CONFIG.WALL_RADIUS + 0.15;
const PLATFORM_OUTER_RADIUS = CONFIG.PLATFORM_OUTER_RADIUS;

const COLORS = {
  dishCenter: '#43464d',
  dishEdge: '#2c2f35',
  dishLip: 0x55585f,
  navyWall: 0x27325a,
  navyWallTop: 0x35457a,
  barrier: 0xe4e6ea,
  marbleBase: '#c9c6bd',
  marbleVein: '#bdb9af',
  marbleGrid: '#a6a299',
};

/** Soft radial gradient that mimics overhead lighting on the matte dish */
function createDishTexture() {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2;

  const grad = ctx.createRadialGradient(cx, cy * 0.85, r * 0.1, cx, cy, r);
  grad.addColorStop(0, COLORS.dishCenter);
  grad.addColorStop(0.7, '#393c42');
  grad.addColorStop(1, COLORS.dishEdge);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Light marble platform with a large square tile grid */
function createMarbleTexture() {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = COLORS.marbleBase;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = COLORS.marbleVein;
  for (let i = 0; i < 50; i++) {
    ctx.lineWidth = 0.5 + Math.random() * 1.5;
    ctx.globalAlpha = 0.25 + Math.random() * 0.25;
    ctx.beginPath();
    ctx.moveTo(Math.random() * size, Math.random() * size);
    ctx.bezierCurveTo(
      Math.random() * size, Math.random() * size,
      Math.random() * size, Math.random() * size,
      Math.random() * size, Math.random() * size
    );
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const tile = size / 4;
  ctx.strokeStyle = COLORS.marbleGrid;
  ctx.lineWidth = 4;
  for (let i = 0; i <= 4; i++) {
    const p = i * tile;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}

/** Trapezoidal wedge cross-section: ramps up from the dish to a flat top */
function createWedgeShape() {
  const innerX = -0.62;
  const outerX = 0.62;
  const h = CONFIG.WALL_HEIGHT * 0.9;

  const shape = new THREE.Shape();
  shape.moveTo(innerX, 0);
  shape.lineTo(innerX * 0.25, h);
  shape.lineTo(outerX, h);
  shape.lineTo(outerX, 0);
  shape.closePath();
  return shape;
}

/** Navy wedge wall segments following each arc between the KO pockets */
function addWallSegments(group) {
  const wedge = createWedgeShape();
  const wallMat = new THREE.MeshStandardMaterial({
    color: COLORS.navyWall,
    metalness: 0.4,
    roughness: 0.36,
    emissive: 0x0b1430,
    emissiveIntensity: 0.12,
  });

  const radius = CONFIG.WALL_RADIUS + 0.1;

  for (let i = 0; i < CONFIG.POCKET_ANGLES.length; i++) {
    const pocketStart = CONFIG.POCKET_ANGLES[i];
    const pocketEnd = CONFIG.POCKET_ANGLES[(i + 1) % CONFIG.POCKET_ANGLES.length];
    let wallStart = pocketStart + CONFIG.POCKET_HALF_WIDTH;
    let wallEnd = pocketEnd - CONFIG.POCKET_HALF_WIDTH;
    if (wallEnd < wallStart) wallEnd += Math.PI * 2;

    const span = wallEnd - wallStart;
    const segments = Math.max(10, CONFIG.WALL_SEGMENTS_PER_ARC * 2);
    const arcLen = span * radius;
    const segDepth = (arcLen / segments) * 1.25;

    for (let j = 0; j <= segments; j++) {
      const angle = wallStart + (span * j) / segments;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      const geo = new THREE.ExtrudeGeometry(wedge, {
        depth: segDepth,
        bevelEnabled: false,
      });
      geo.translate(0, 0, -segDepth / 2);

      const wall = new THREE.Mesh(geo, wallMat);
      wall.position.set(x, 0.02, z);
      wall.rotation.y = -angle;
      wall.castShadow = true;
      wall.receiveShadow = true;
      group.add(wall);
    }
  }
}

/**
 * Flat physics arena styled to match stadiumtexturereference.png:
 * smooth dark battle dish, navy wedge walls with three gaps,
 * a light barrier ring, and a marble tiled outer platform.
 */
export function createArenaMesh(scene) {
  const group = new THREE.Group();

  const platform = new THREE.Mesh(
    new THREE.CircleGeometry(PLATFORM_OUTER_RADIUS, 80),
    new THREE.MeshStandardMaterial({
      map: createMarbleTexture(),
      roughness: 0.6,
      metalness: 0.05,
    })
  );
  platform.rotation.x = -Math.PI / 2;
  platform.position.y = CONFIG.FLOOR_Y - 0.04;
  platform.receiveShadow = true;
  group.add(platform);

  const dish = new THREE.Mesh(
    new THREE.CircleGeometry(DISH_RADIUS, 80),
    new THREE.MeshStandardMaterial({
      map: createDishTexture(),
      roughness: 0.82,
      metalness: 0.12,
    })
  );
  dish.rotation.x = -Math.PI / 2;
  dish.position.y = CONFIG.FLOOR_Y + 0.02;
  dish.receiveShadow = true;
  group.add(dish);

  const dishLip = new THREE.Mesh(
    new THREE.RingGeometry(DISH_RADIUS - 0.18, DISH_RADIUS + 0.05, 80),
    new THREE.MeshStandardMaterial({
      color: COLORS.dishLip,
      metalness: 0.5,
      roughness: 0.3,
    })
  );
  dishLip.rotation.x = -Math.PI / 2;
  dishLip.position.y = CONFIG.FLOOR_Y + 0.035;
  group.add(dishLip);

  addWallSegments(group);

  const barrier = new THREE.Mesh(
    new THREE.CylinderGeometry(
      PLATFORM_OUTER_RADIUS,
      PLATFORM_OUTER_RADIUS,
      1.1,
      80,
      1,
      true
    ),
    new THREE.MeshStandardMaterial({
      color: COLORS.barrier,
      metalness: 0.2,
      roughness: 0.5,
      side: THREE.DoubleSide,
    })
  );
  barrier.position.y = 0.55;
  group.add(barrier);

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(PLATFORM_OUTER_RADIUS - 0.3, PLATFORM_OUTER_RADIUS + 0.5, 0.7, 80),
    new THREE.MeshStandardMaterial({ color: 0x10141c, metalness: 0.2, roughness: 0.85 })
  );
  base.position.y = -0.5;
  base.receiveShadow = true;
  group.add(base);

  scene.add(group);
  return group;
}
