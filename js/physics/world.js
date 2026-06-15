import * as CANNON from 'cannon-es';
import { CONFIG } from '../config.js';

/** Creates the Cannon-es world and contact materials */
export function createPhysicsWorld() {
  const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, -CONFIG.GRAVITY, 0),
  });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.allowSleep = false;
  world.defaultContactMaterial.friction = 0.4;
  world.defaultContactMaterial.restitution = 0.08;

  const topMaterial  = new CANNON.Material('top');
  const bowlMaterial = new CANNON.Material('bowl');  // floor only
  const wallMaterial = new CANNON.Material('wall');  // rim walls only

  // Top ↔ floor: moderate friction keeps beys controllable on the flat surface.
  world.addContactMaterial(
    new CANNON.ContactMaterial(topMaterial, bowlMaterial, {
      friction: 0.55,
      restitution: 0.04,
    })
  );

  // Top ↔ wall: zero friction so beys never "grip" the rim;
  // restitution proportional to impact speed gives a clean elastic bounce.
  world.addContactMaterial(
    new CANNON.ContactMaterial(topMaterial, wallMaterial, {
      friction: 0.0,
      restitution: 0.65,
    })
  );

  // Note: there is intentionally no top ↔ top contact material. Bey-vs-bey
  // collision is handled entirely by the custom 2D resolver in contact.js;
  // cannon-es never resolves top-top contact (see updateTopCollisions), so a
  // material here would have no effect.

  return { world, topMaterial, bowlMaterial, wallMaterial };
}
