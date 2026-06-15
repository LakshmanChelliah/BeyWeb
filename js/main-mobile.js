import { createGame } from './game/engine.js';
import { createGyroInput } from './input/gyro.js';
import { applyAISteering } from './input/ai.js';
import { createBeySelection } from './ui/selection.js';
import { queryGameUi } from './ui/domRefs.js';

const btnStart = document.getElementById('btn-start');
const permissionHint = document.getElementById('permission-hint');
const selectOverlay = document.getElementById('select-overlay');
const gyro = createGyroInput(document.getElementById('game-canvas'));

const game = createGame({
  mode: 'mobile',
  canvas: document.getElementById('game-canvas'),
  ui: queryGameUi({
    controlsHintId: 'tilt-hint',
    playerAbilitiesId: 'player-abilities',
  }),
  input: {
    applySteering(state) {
      gyro.applyGyroSteer(state.playerBody, state.playerSpin);
      applyAISteering(state.aiBody, state.playerBody, state.aiSpin);
    },
    async onStartClick(startGame) {
      btnStart.disabled = true;
      btnStart.textContent = 'Requesting…';

      const granted = await gyro.requestMotionPermission();
      if (!granted) {
        btnStart.disabled = false;
        btnStart.textContent = 'Calibrate & Start';
        permissionHint.textContent =
          'Motion permission denied. On desktop, use mouse to steer instead.';
        gyro.setMouseFallback();
      }

      gyro.startListening();
      await gyro.calibrateOnce();
      startGame();
    },
  },
});

const selection = createBeySelection({
  root: selectOverlay,
  players: [{ label: 'YOU' }],
  onComplete(picks) {
    game.state.playerBey = picks[0];
    // Rival picks a random bey from those still available.
    const open = selection.remaining();
    game.state.aiBey = open[Math.floor(Math.random() * open.length)];
    setTimeout(() => selectOverlay.classList.add('hidden'), 600);
  },
});

document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
