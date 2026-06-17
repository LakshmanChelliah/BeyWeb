import fs from 'fs';
import path from 'path';

const root = path.resolve('js/game');
const lines = fs.readFileSync(path.join(root, 'abilities.js'), 'utf8').split('\n');
const slice = (a, b) => lines.slice(a - 1, b).join('\n');

const dir = path.join(root, 'abilities');
fs.mkdirSync(dir, { recursive: true });

const constantsSrc = slice(27, 135);
const sharedRaw = slice(137, 760);
const sharedNames = [...sharedRaw.matchAll(/^function (\w+)/gm)].map((m) => m[1]);
const sharedSrc = sharedRaw.replace(/^function /gm, 'export function ');

let registryRaw = slice(761, 1241);
for (const name of [...sharedNames].sort((a, b) => b.length - a.length)) {
  registryRaw = registryRaw.replace(new RegExp(`\\b${name}\\b`, 'g'), `shared.${name}`);
}

fs.writeFileSync(
  path.join(dir, 'constants.js'),
  `import { CONFIG } from '../../config.js';

${constantsSrc}
`
);

fs.writeFileSync(
  path.join(dir, 'shared.js'),
  `import * as CANNON from 'cannon-es';
import { CONFIG } from '../../config.js';
import { setBodyCollisions } from '../../physics/top.js';
import { isAtPocketAngle } from '../../physics/arena.js';
import { clamp01 } from '../../utils/math.js';
import * as C from './constants.js';

${sharedSrc}
`
);

// Prefix constant references in shared with C. - too many. Instead re-export constants into shared scope:
// Simpler: duplicate constants import via re-export in shared
const sharedFinal = `import * as CANNON from 'cannon-es';
import { CONFIG } from '../../config.js';
import { setBodyCollisions } from '../../physics/top.js';
import { isAtPocketAngle } from '../../physics/arena.js';
import { clamp01 } from '../../utils/math.js';
export * from './constants.js';

${sharedSrc}
`;
fs.writeFileSync(path.join(dir, 'shared.js'), sharedFinal);

const registryBody = registryRaw.replace(/^export const ABILITY_REGISTRY = /, '');
fs.writeFileSync(
  path.join(dir, 'registry.js'),
  `import { CONFIG } from '../../config.js';
import { clamp01 } from '../../utils/math.js';
import * as shared from './shared.js';

export const ABILITY_REGISTRY = ${registryBody};
`
);

function prefixShared(src, names) {
  let out = src;
  for (const name of [...names].sort((a, b) => b.length - a.length)) {
    out = out.replace(new RegExp(`\\b${name}\\b`, 'g'), `shared.${name}`);
  }
  return out;
}

const runtimeBlock = prefixShared(slice(1243, 1388), sharedNames)
  .replace(/^function makeSlot/m, 'export function makeSlot')
  .replace(/^function spinKey/m, 'function spinKey')
  .replace(/^function makeCtx/m, 'export function makeCtx')
  .replace(/^function activateSlot/m, 'export function activateSlot');
fs.writeFileSync(
  path.join(dir, 'runtime.js'),
  `import { CONFIG } from '../../config.js';
import * as shared from './shared.js';
import { ABILITY_REGISTRY } from './registry.js';

${runtimeBlock}
`
);

const visualModules = [
  ['pegasus.js', 1391, 1637],
  ['leone.js', 1638, 1714],
  ['bull.js', 1715, 1807],
  ['libra.js', 1808, 1858],
  ['ldrago.js', 1859, 1919],
];

for (const [file, start, end] of visualModules) {
  fs.writeFileSync(
    path.join(dir, file),
    `import { CONFIG } from '../../config.js';
import { setBodyCollisions } from '../../physics/top.js';
import { clamp01 } from '../../utils/math.js';
import * as shared from './shared.js';

${prefixShared(slice(start, end), sharedNames)}
`
  );
}

fs.writeFileSync(
  path.join(dir, 'presentation.js'),
  `import * as C from './constants.js';

${prefixShared(slice(1920, 2004), sharedNames)}
`
);

const timersBlock = prefixShared(slice(2007, 2052), sharedNames);
fs.writeFileSync(
  path.join(dir, 'timers.js'),
  `import { CONFIG } from '../../config.js';
import * as shared from './shared.js';
import { activateSlot, makeCtx } from './runtime.js';

${timersBlock}
`
);

let contactBlock = slice(2054, 2306);
contactBlock = contactBlock.replace(/^export \{ isLibraBusterChannelingBody \};\n?/m, '');
fs.writeFileSync(
  path.join(dir, 'contact.js'),
  `import { CONFIG } from '../../config.js';
import * as shared from './shared.js';

${prefixShared(contactBlock, sharedNames)}
`
);

// Backup original
fs.copyFileSync(path.join(root, 'abilities.js'), path.join(root, 'abilities.js.bak'));

fs.writeFileSync(
  path.join(dir, 'index.js'),
  `export * from './constants.js';
export * from './shared.js';
export { ABILITY_REGISTRY } from './registry.js';
export {
  createAbilityRuntime,
  triggerAbility,
  stepAbilities,
  activateSlot,
  makeCtx,
} from './runtime.js';
export { tickAbilityVisuals } from './pegasus.js';
export { tickLeoneAbilityVisuals } from './leone.js';
export { tickBullAbilityVisuals } from './bull.js';
export { tickLibraAbilityVisuals } from './libra.js';
export { tickLdragoAbilityVisuals } from './ldrago.js';
export {
  shouldStarBlastGlow,
  getCinematicFlightLift,
  getCameraCue,
  resetStarBlastCamera,
} from './presentation.js';
export { tickAbilityTimers } from './timers.js';
export {
  resolveContactAbilities,
  isLibraBusterChannelingBody,
  canTopsContactVertically,
  clearAbilityFlags,
} from './contact.js';
`
);

fs.writeFileSync(
  path.join(root, 'abilities.js'),
  `/** Barrel re-export — implementation lives in ./abilities/ */
export * from './abilities/index.js';
`
);

console.log('Split complete');
