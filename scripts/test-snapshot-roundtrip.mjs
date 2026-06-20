import { createMatchEnvironment, serverTick } from '../js/game/matchFactory.js';
import { serializeState, applySnapshot, snapshotRoundtripTest } from '../js/net/snapshot.js';
import { createGameState } from '../js/game/state.js';
import { getBeyById } from '../js/game/beys.js';

const pegasus = getBeyById('pegasus');
const ldrago = getBeyById('ldrago');

const match = createMatchEnvironment({ playerBey: pegasus, aiBey: ldrago, seed: 42 });
const { state } = match;

const dummyInput = [
  { steer: { x: 0, y: -1 }, ability: null },
  { steer: { x: 0, y: 1 }, ability: null },
];

for (let i = 0; i < 120; i++) {
  serverTick({ match, slotInputs: dummyInput });
}

const snap = serializeState(state, 120);
const stateB = createGameState();
stateB.playerBey = pegasus;
stateB.aiBey = ldrago;
stateB.playerBody = state.playerBody;
stateB.aiBody = state.aiBody;
stateB.abilities = state.abilities;

const clone = createMatchEnvironment({ playerBey: pegasus, aiBey: ldrago, seed: 99 });
for (let i = 0; i < 120; i++) {
  serverTick({ match: clone, slotInputs: dummyInput });
}

const snapClone = serializeState(clone.state, 120);
const verify = createMatchEnvironment({ playerBey: pegasus, aiBey: ldrago, seed: 99 });
for (let i = 0; i < 120; i++) {
  serverTick({ match: verify, slotInputs: dummyInput });
}

applySnapshot(verify.state, snapClone);

const eps = 0.01;
const pa = verify.state.playerBody.position;
const pb = clone.state.playerBody.position;
if (Math.abs(pa.x - pb.x) > eps || Math.abs(pa.z - pb.z) > eps) {
  console.error('Roundtrip failed', pa.x, pb.x, pa.z, pb.z);
  process.exit(1);
}

console.log('snapshot roundtrip OK');
process.exit(0);
