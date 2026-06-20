import { createMatchEnvironment, serverTick } from '../js/game/matchFactory.js';
import { getBeyById } from '../js/game/beys.js';
import { CONFIG } from '../js/config.js';

const pegasus = getBeyById('pegasus');
const ldrago = getBeyById('ldrago');
const match = createMatchEnvironment({ playerBey: pegasus, aiBey: ldrago, seed: 12345 });

const ticks = Math.floor(10 / CONFIG.FIXED_DT);
const dummyInput = [
  { steer: { x: 1, y: 0 }, ability: null },
  { steer: { x: -1, y: 0 }, ability: null },
];

for (let i = 0; i < ticks; i++) {
  serverTick({ match, slotInputs: dummyInput });
}

console.log(`server tick OK (${ticks} ticks)`);
process.exit(0);
