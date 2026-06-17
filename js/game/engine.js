import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { createPhysicsWorld } from '../physics/world.js';
import { createArenaPhysics } from '../physics/arena.js';
import { setupContactHandlers } from '../physics/contact.js';
import {
  createTopPhysicsBody,
  decaySpin,
  stabilizeTop,
  resetTopWobble,
  syncTopVisual,
  clampLaunchSpeed,
  pinTopToFloor,
  settleSleepingTop,
  updateTopCollisions,
  beginLaunchDrop,
  stepLaunchDrop,
  applyCenterPull,
  resolveWallClipping,
} from '../physics/top.js';
import {
  beginRingOut,
  stepRingOutBodies,
  isRingOutCinematicDone,
  clearRingOut,
} from '../physics/ringOut.js';
import { createGameState, resetRoundState } from './state.js';
import { evaluateWin, trackSleepers, formatEndGame } from './rules.js';
import { createScene, updateCamera, resetMobileCameraFraming } from '../render/scene.js';
import { createArenaMesh } from '../render/arena.js';
import { createTopGroups, loadTopModel, setTopEmissive } from '../render/top.js';
import { beyColorHex } from './beys.js';
import {
  createAbilityRuntime,
  triggerAbility as triggerAbilityCore,
  stepAbilities,
  tickAbilityTimers,
  tickAbilityVisuals,
  tickLeoneAbilityVisuals,
  tickLdragoAbilityVisuals,
  tickLibraAbilityVisuals,
  tickBullAbilityVisuals,
  getCameraCue,
  resetStarBlastCamera,
  shouldStarBlastGlow,
  clearAbilityFlags,
  cancelAbilitiesOnSpinStop,
  isLibraBusterChannelingBody,
  SPECIAL_LOGO_FLASH_DUR,
} from './abilities.js';
import { createStarBlastVfx } from '../render/starBlastVfx.js';
import { createLeoneAbilityVfx } from '../render/leoneAbilityVfx.js';
import { createPegasusSpeedBoostVfx } from '../render/pegasusSpeedBoostVfx.js';
import { createLdragoAbilityVfx } from '../render/ldragoAbilityVfx.js';
import { createLibraAbilityVfx } from '../render/libraAbilityVfx.js';
import { createBullAbilityVfx } from '../render/bullAbilityVfx.js';
import { createCollisionSparksVfx } from '../render/collisionSparksVfx.js';

/**
 * Boots the shared game engine for PC (2-player) or mobile (gyro + AI).
 */
export function createGame({ mode, canvas, ui, input, isVsCpu }) {
  const state = createGameState();
  const { renderer, scene, camera } = createScene(canvas);
  const { world, topMaterial, bowlMaterial, wallMaterial } = createPhysicsWorld();
  const arena = createArenaPhysics(world, bowlMaterial, wallMaterial);
  createArenaMesh(scene);

  const { playerGroup, aiGroup } = createTopGroups(scene);
  const starBlastVfx = {
    player: createStarBlastVfx(scene),
    ai: createStarBlastVfx(scene),
  };
  const leoneVfx = {
    player: createLeoneAbilityVfx(scene),
    ai: createLeoneAbilityVfx(scene),
  };
  const speedBoostVfx = {
    player: createPegasusSpeedBoostVfx(scene),
    ai: createPegasusSpeedBoostVfx(scene),
  };
  const ldragoVfx = {
    player: createLdragoAbilityVfx(scene),
    ai: createLdragoAbilityVfx(scene),
  };
  const libraVfx = {
    player: createLibraAbilityVfx(scene),
    ai: createLibraAbilityVfx(scene),
  };
  const bullVfx = {
    player: createBullAbilityVfx(scene),
    ai: createBullAbilityVfx(scene),
  };
  const collisionSparksVfx = createCollisionSparksVfx(scene);

  function resetAllAbilityVfx() {
    starBlastVfx.player.reset();
    starBlastVfx.ai.reset();
    leoneVfx.player.reset();
    leoneVfx.ai.reset();
    speedBoostVfx.player.reset();
    speedBoostVfx.ai.reset();
    ldragoVfx.player.reset();
    ldragoVfx.ai.reset();
    libraVfx.player.reset();
    libraVfx.ai.reset();
    bullVfx.player.reset();
    bullVfx.ai.reset();
    collisionSparksVfx.reset();
  }

  const contacts = setupContactHandlers(
    world,
    () => state,
    (event) => collisionSparksVfx.spawn(event)
  );

  // Debug collider rings (toggle with KeyC): a flat unit ring scaled to each
  // bey's outerRadius, drawn at the model's mid-height so the collider edge can
  // be compared against the visible disc when calibrating COLLIDER_INSET.
  function makeDebugRing(color) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.97, 1.0, 48),
      new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    scene.add(ring);
    return ring;
  }
  const debug = {
    show: false,
    playerRing: makeDebugRing(0x00ff88),
    aiRing: makeDebugRing(0xff4466),
  };
  function syncDebugRing(ring, body) {
    if (!debug.show || !body) {
      ring.visible = false;
      return;
    }
    const r = body.userData.outerRadius ?? CONFIG.DEFAULT_OUTER_RADIUS;
    const yOff = body.userData.visualYOffset ?? 0;
    const flightLift = body.userData.flightLift ?? 0;
    ring.visible = true;
    ring.position.set(body.position.x, body.position.y + yOff + flightLift, body.position.z);
    ring.scale.set(r, r, r);
  }
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyC') {
      debug.show = !debug.show;
    }
  });

  const dom = {
    hud: ui.hud,
    startOverlay: ui.startOverlay,
    gameoverOverlay: ui.gameoverOverlay,
    btnStart: ui.btnStart,
    btnRestart: ui.btnRestart,
    btnChangeBey: ui.btnChangeBey || null,
    btnRecalibrate: ui.btnRecalibrate || null,
    playerSpinEl: ui.playerSpinEl,
    aiSpinEl: ui.aiSpinEl,
    playerBar: ui.playerBar,
    aiBar: ui.aiBar,
    playerAvatar: ui.playerAvatar || null,
    aiAvatar: ui.aiAvatar || null,
    gameoverTitle: ui.gameoverTitle,
    gameoverMsg: ui.gameoverMsg,
    controlsHint: ui.controlsHint,
    abilityBars: { player: ui.playerAbilities || null, ai: ui.aiAbilities || null },
    specialFlash: ui.specialFlash || null,
    specialFlashImg: ui.specialFlashImg || null,
  };

  const clock = new THREE.Clock();

  function abilityKeyLabels() {
    if (mode !== 'pc') return { player: {}, ai: {} };
    if (isVsCpu?.()) return { player: { power: 'Q', special: 'E' }, ai: {} };
    return { player: { power: 'Q', special: 'E' }, ai: { power: '.', special: '/' } };
  }
  const abilityButtons = { player: [], ai: [] };

  function buildAbilityButtons(side) {
    abilityButtons[side] = [];
    const container = dom.abilityBars[side];
    if (!container) return;
    container.innerHTML = '';
    const runtime = state.abilities?.[side];
    if (!runtime) {
      container.classList.remove('visible');
      return;
    }
    for (const slotName of ['power', 'special']) {
      const slot = runtime[slotName];
      if (!slot) continue;
      const ability = slot.ability;
      const btn = document.createElement('button');
      btn.className = `ability-btn slot-${slotName}`;
      btn.type = 'button';
      btn.style.setProperty('--ability-glow', ability.glow || '#4f8cff');
      const keyLabel = abilityKeyLabels()[side]?.[slotName];
      btn.innerHTML =
        `<span class="ability-cd"></span>` +
        `<span class="ability-icon">${ability.icon || ''}</span>` +
        `<span class="ability-name">${ability.name}</span>` +
        (keyLabel ? `<span class="ability-key">${keyLabel}</span>` : '');
      btn.addEventListener('click', () => triggerAbility(side, slotName));
      container.appendChild(btn);
      abilityButtons[side].push({ btn, slot, cdEl: btn.querySelector('.ability-cd') });
    }
    container.classList.toggle('visible', abilityButtons[side].length > 0);
  }

  function updateAbilityHud() {
    for (const side of ['player', 'ai']) {
      for (const { btn, slot, cdEl } of abilityButtons[side]) {
        const ability = slot.ability;
        const total = slot.cooldownTotal || ability.cooldown || 0;
        const ratio = total ? slot.cooldownRemaining / total : 0;
        cdEl.style.transform = `scaleY(${Math.max(0, Math.min(1, ratio))})`;
        btn.classList.toggle('cooling', slot.cooldownRemaining > 0);
        btn.classList.toggle('active', slot.active || slot.windupRemaining > 0);
      }
    }
  }

  function abilityGlow(side) {
    const runtime = state.abilities?.[side];
    if (!runtime) return null;
    const sp = runtime.special;
    if (sp && (sp.active || sp.windupRemaining > 0)) {
      if (sp.ability.id === 'pegasus_star_blast') {
        const body = side === 'player' ? state.playerBody : state.aiBody;
        if (!shouldStarBlastGlow(body)) return null;
        if (body?.userData.starImpactFlash) {
          return { color: sp.ability.glow, intensity: 2.4 };
        }
        const pulse = 0.7 + 0.3 * Math.sin(performance.now() * 0.009);
        return { color: sp.ability.glow, intensity: pulse * 1.45 };
      }
      if (sp.ability.id === 'leone_lion_wall') {
        const body = side === 'player' ? state.playerBody : state.aiBody;
        const burst = body?.userData.lionWallBurstT ?? 0;
        const pulse = 0.65 + 0.35 * Math.sin(performance.now() * 0.009);
        const base = pulse * 0.55;
        const intensity = burst > 0 ? Math.max(base, 0.7 + burst * 0.45) : base;
        // Warm stone / wind haze — not saturated green.
        return { color: '#c4bfb6', intensity };
      }
      if (sp.ability.id === 'ldrago_supreme_flight') {
        const body = side === 'player' ? state.playerBody : state.aiBody;
        const repulse = body?.userData.flightRepulseT ?? 0;
        const launch = body?.userData.ldragoFlightLaunchT ?? 0;
        const windup = body?.userData.ldragoFlightWindup;
        const active = body?.userData.airborne && body?.userData.invulnerable;
        const pulse = 0.72 + 0.28 * Math.sin(performance.now() * 0.011);
        let base = pulse * 1.35;
        if (windup) base = Math.max(base, pulse * 1.65);
        if (active) base = Math.max(base, pulse * 1.85);
        if (launch > 0) base = Math.max(base, 2.8 + launch * 1.2);
        if (body?.userData.ldragoLightningCharging) {
          base = Math.max(base, pulse * 2.15);
        }
        if (body?.userData.ldragoFlightRerising) {
          base = Math.max(base, pulse * 2.05);
        }
        const intensity = repulse > 0 ? Math.max(base, 2.0 + repulse * 1.1) : base;
        return { color: sp.ability.glow, intensity };
      }
      if (sp.ability.id === 'libra_sonic_buster') {
        const body = side === 'player' ? state.playerBody : state.aiBody;
        const channeling = body?.userData.sonicBusterWindup || body?.userData.sonicBuster;
        const pulse = 0.7 + 0.3 * Math.sin(performance.now() * 0.02);
        const base = channeling ? pulse * 1.45 : pulse * 0.65;
        return { color: sp.ability.glow, intensity: base };
      }
      if (sp.ability.id === 'bull_red_horn_uppercut') {
        const body = side === 'player' ? state.playerBody : state.aiBody;
        if (body?.userData.bullImpactFlash) {
          return { color: '#ef4444', intensity: 2.5 };
        }
        const phase = body?.userData.bullUpperPhase;
        const pulse = 0.7 + 0.3 * Math.sin(performance.now() * 0.012);
        const intense =
          sp.windupRemaining > 0 || phase === 'windup' || phase === 'dash';
        return { color: sp.ability.glow, intensity: intense ? pulse * 1.55 : pulse * 0.9 };
      }
      return { color: sp.ability.glow, intensity: 1.0 };
    }
    const pw = runtime.power;
    if (pw && pw.active) {
      if (pw.ability.id === 'leone_wide_ball') {
        const pulse = 0.6 + 0.4 * Math.sin(performance.now() * 0.006);
        return { color: pw.ability.glow, intensity: pulse * 0.9 };
      }
      if (pw.ability.id === 'pegasus_speed_boost') {
        const pulse = 0.7 + 0.3 * Math.sin(performance.now() * 0.014);
        return { color: pw.ability.glow, intensity: pulse * 1.15 };
      }
      if (pw.ability.id === 'ldrago_spin_steal') {
        const body = side === 'player' ? state.playerBody : state.aiBody;
        const burst = body?.userData.spinStealBurstT ?? 0;
        const pulse = 0.65 + 0.35 * Math.sin(performance.now() * 0.012);
        const base = pulse * 1.05;
        const intensity = burst > 0 ? Math.max(base, 1.4 + burst * 0.8) : base;
        return { color: pw.ability.glow, intensity };
      }
      if (pw.ability.id === 'libra_sonic_shield') {
        const body = side === 'player' ? state.playerBody : state.aiBody;
        const burst = body?.userData.sonicShieldBurstT ?? 0;
        const pulse = 0.68 + 0.32 * Math.sin(performance.now() * 0.01);
        const base = pulse * 1.1;
        const intensity = burst > 0 ? Math.max(base, 1.35 + burst * 0.65) : base;
        return { color: pw.ability.glow, intensity };
      }
      if (pw.ability.id === 'bull_maximum_stampede') {
        const pulse = 0.68 + 0.32 * Math.sin(performance.now() * 0.013);
        return { color: pw.ability.glow, intensity: pulse * 1.2 };
      }
      return { color: pw.ability.glow, intensity: 0.55 };
    }
    return null;
  }

  function updateAbilityVisuals() {
    const pg = abilityGlow('player');
    setTopEmissive(playerGroup, pg ? pg.color : 0x000000, pg ? pg.intensity : 0);
    const ag = abilityGlow('ai');
    setTopEmissive(aiGroup, ag ? ag.color : 0x000000, ag ? ag.intensity : 0);
  }

  function playSpecialFlash(bey, glowColor) {
    const overlay = dom.specialFlash;
    const img = dom.specialFlashImg;
    if (!overlay || !img || !bey?.logo) return;
    img.src = bey.logo;
    overlay.style.setProperty('--flash-glow', glowColor || '#4f8cff');
    overlay.style.setProperty('--flash-dur', `${SPECIAL_LOGO_FLASH_DUR}s`);
    overlay.classList.remove('flash-play');
    void overlay.offsetWidth; // force reflow to restart the animation
    overlay.classList.add('flash-play');
  }

  function stopSpecialFlash() {
    dom.specialFlash?.classList.remove('flash-play');
  }

  function syncSpecialFlashOverlay() {
    if (!dom.specialFlash?.classList.contains('flash-play')) return;
    for (const side of ['player', 'ai']) {
      const sp = state.abilities?.[side]?.special;
      if (sp && (sp.windupRemaining > 0 || sp.active)) return;
    }
    stopSpecialFlash();
  }

  function triggerAbility(side, slot) {
    if (!state.gameRunning || state.gameFrozen || state.launchGrace > 0 || state.pendingKo) return;
    const ability = triggerAbilityCore(state, side, slot);
    if (ability && slot === 'special') {
      const bey = side === 'player' ? state.playerBey : state.aiBey;
      playSpecialFlash(bey, ability.glow);
    }
  }

  function updateHud() {
    const pPct = Math.round(state.playerSpin * 100);
    const aPct = Math.round(state.aiSpin * 100);
    dom.playerSpinEl.textContent = `${pPct}%`;
    dom.aiSpinEl.textContent = `${aPct}%`;
    dom.playerBar.style.width = `${pPct}%`;
    dom.aiBar.style.width = `${aPct}%`;
  }

  /** Points each HUD avatar at the bey that side actually chose */
  function updateAvatars() {
    const apply = (img, bey) => {
      if (!img || !bey) return;
      if (bey.logo) img.src = bey.logo;
      img.alt = bey.name || '';
      img.style.setProperty('--avatar-accent', bey.color || '#4f8cff');
    };
    apply(dom.playerAvatar, state.playerBey);
    apply(dom.aiAvatar, state.aiBey);
  }

  function freezeBodies() {
    for (const body of [state.playerBody, state.aiBody]) {
      if (!body) continue;
      body.velocity.set(0, 0, 0);
      body.angularVelocity.set(0, 0, 0);
    }
  }

  function endGame(result) {
    state.gameFrozen = true;
    state.gameRunning = false;
    state.lastOutcome = result;
    state.pendingKo = null;
    freezeBodies();
    clearRingOut(state.playerBody);
    clearRingOut(state.aiBody);
    input.clearKeys?.();
    clearAbilityFlags(state.playerBody);
    clearAbilityFlags(state.aiBody);
    setTopEmissive(playerGroup, 0x000000, 0);
    setTopEmissive(aiGroup, 0x000000, 0);
    resetAllAbilityVfx();
    dom.specialFlash?.classList.remove('flash-play');

    const endMode = mode === 'pc' && isVsCpu?.() ? 'pc-cpu' : mode;
    const copy = formatEndGame(result, endMode);
    dom.gameoverTitle.textContent = copy.title;
    dom.gameoverTitle.className = copy.titleClass;
    dom.gameoverMsg.textContent = copy.message;
    dom.gameoverOverlay.classList.add('visible');
    input.onMatchEnd?.(result);
  }

  function spawnTops() {
    resetStarBlastCamera();
    resetMobileCameraFraming();
    resetAllAbilityVfx();
    if (state.playerBody) {
      world.removeBody(state.playerBody);
    }
    if (state.aiBody) {
      world.removeBody(state.aiBody);
    }

    resetRoundState(state);
    const spawnAngle = 0.7;

    state.playerBody = createTopPhysicsBody(
      world,
      topMaterial,
      -Math.cos(spawnAngle) * CONFIG.SPAWN_OFFSET,
      -Math.sin(spawnAngle) * CONFIG.SPAWN_OFFSET,
      CONFIG.COLLISION_PLAYER,
      1
    );
    state.aiBody = createTopPhysicsBody(
      world,
      topMaterial,
      Math.cos(spawnAngle) * CONFIG.SPAWN_OFFSET,
      Math.sin(spawnAngle) * CONFIG.SPAWN_OFFSET,
      CONFIG.COLLISION_AI,
      2
    );

    // Stamp bey stats onto each body so physics handlers can read them.
    const playerBey = state.playerBey;
    const aiBey = state.aiBey;
    state.playerBody.userData.beyStats = {
      id: playerBey.id,
      atk: playerBey.atk ?? 50,
      move: playerBey.move ?? playerBey.atk ?? 50,
      def: playerBey.def ?? 50,
      sta: playerBey.sta ?? 50,
    };
    state.playerBody.userData.beyColor = beyColorHex(playerBey.color);
    state.aiBody.userData.beyStats = {
      id: aiBey.id,
      atk: aiBey.atk ?? 50,
      move: aiBey.move ?? aiBey.atk ?? 50,
      def: aiBey.def ?? 50,
      sta: aiBey.sta ?? 50,
    };
    state.aiBody.userData.beyColor = beyColorHex(aiBey.color);

    // Tag sides and build the per-bey ability runtimes + on-screen buttons.
    state.playerBody.userData.side = 'player';
    state.aiBody.userData.side = 'ai';
    resetTopWobble(state.playerBody);
    resetTopWobble(state.aiBody);
    clearAbilityFlags(state.playerBody);
    clearAbilityFlags(state.aiBody);
    state.abilities = {
      player: createAbilityRuntime(playerBey),
      ai: createAbilityRuntime(aiBey),
    };
    buildAbilityButtons('player');
    buildAbilityButtons('ai');

    stabilizeTop(state.playerBody, 0.15, 1, state.launchGrace);
    stabilizeTop(state.aiBody, 0.15, -0.95, state.launchGrace);
    beginLaunchDrop(state.playerBody);
    beginLaunchDrop(state.aiBody);
    updateTopCollisions(state);
    updateHud();
    updateAvatars();

    loadTopModel(playerBey.model, beyColorHex(playerBey.color), playerGroup, state.playerBody);
    loadTopModel(aiBey.model, beyColorHex(aiBey.color), aiGroup, state.aiBody);
  }

  function returnToMenu() {
    state.gameRunning = false;
    state.gameFrozen = false;
    resetAllAbilityVfx();
    dom.gameoverOverlay.classList.remove('visible');
    dom.hud.classList.remove('visible');
    dom.controlsHint?.classList.remove('visible');
    dom.startOverlay.classList.remove('hidden');
    dom.btnStart.disabled = false;
    input.clearKeys?.();
  }

  function resetGame() {
    state.gameFrozen = false;
    dom.gameoverOverlay.classList.remove('visible');
    input.clearKeys?.();
    spawnTops();
    state.gameRunning = true;
    clock.getDelta();
  }

  function startGame() {
    if (state.gameRunning) return;
    dom.btnStart.disabled = true;
    spawnTops();
    dom.startOverlay.classList.add('hidden');
    dom.hud.classList.add('visible');
    dom.controlsHint?.classList.add('visible');
    state.gameRunning = true;
    state.gameFrozen = false;
    clock.getDelta();
  }

  function stepPhysics() {
    stepRingOutBodies(state);

    if (state.playerBody) {
      if (!state.playerBody.userData.ringOut) {
        settleSleepingTop(state.playerBody, state.playerSpin);
      }
      stabilizeTop(state.playerBody, state.playerSpin, 1, state.launchGrace);
      pinTopToFloor(state.playerBody);
    }
    if (state.aiBody) {
      if (!state.aiBody.userData.ringOut) {
        settleSleepingTop(state.aiBody, state.aiSpin);
      }
      stabilizeTop(state.aiBody, state.aiSpin, -0.95, state.launchGrace);
      pinTopToFloor(state.aiBody);
    }

    if (!state.pendingKo) {
      input.applySteering?.(state);
      applyCenterPull(state.playerBody, state.playerSpin);
      applyCenterPull(state.aiBody, state.aiSpin);
    }

    world.step(CONFIG.FIXED_DT);

    stepLaunchDrop(state.playerBody, state.launchGrace);
    stepLaunchDrop(state.aiBody, state.launchGrace);

    contacts.resolve(state, CONFIG.FIXED_DT);
    contacts.resolveWallContacts(state, CONFIG.FIXED_DT);
    contacts.resolveWallClipSpin(state, state.playerBody, state.aiBody);
    resolveWallClipping(state.playerBody, state.aiBody, contacts.emitWallImpact);

    // Run after physics so cinematic moves (Star Blast climb/dive) aren't
    // overwritten by gravity or floor pinning in the same step.
    stepAbilities(state, CONFIG.FIXED_DT);

    if (state.playerBody) {
      clampLaunchSpeed(state.playerBody, state.launchGrace);
      stabilizeTop(state.playerBody, state.playerSpin, 1, state.launchGrace);
      pinTopToFloor(state.playerBody);
      if (!state.playerBody.userData.ringOut) {
        settleSleepingTop(state.playerBody, state.playerSpin);
      }
    }
    if (state.aiBody) {
      clampLaunchSpeed(state.aiBody, state.launchGrace);
      stabilizeTop(state.aiBody, state.aiSpin, -0.95, state.launchGrace);
      pinTopToFloor(state.aiBody);
      if (!state.aiBody.userData.ringOut) {
        settleSleepingTop(state.aiBody, state.aiSpin);
      }
    }
  }

  function gameLoop() {
    requestAnimationFrame(gameLoop);
    const dt = Math.min(clock.getDelta(), 0.05);

    if (state.gameRunning && !state.gameFrozen) {
      if (state.launchGrace > 0) {
        state.launchGrace = Math.max(0, state.launchGrace - dt);
      }
      updateTopCollisions(state);

      state.accumulator += dt;
      while (state.accumulator >= CONFIG.FIXED_DT) {
        stepPhysics();
        state.accumulator -= CONFIG.FIXED_DT;
      }

      const playerSandMult =
        state.playerBody?.userData.sonicSlow > 0 &&
        !isLibraBusterChannelingBody(state, state.playerBody)
          ? 2
          : 1;
      const aiSandMult =
        state.aiBody?.userData.sonicSlow > 0 &&
        !isLibraBusterChannelingBody(state, state.aiBody)
          ? 2
          : 1;

      state.playerSpin = state.playerBody?.userData.controlLocked
        ? state.playerSpin
        : decaySpin(
            state.playerSpin,
            dt,
            state.playerBey.sta ?? 50,
            playerSandMult
          );
      state.aiSpin = state.aiBody?.userData.controlLocked
        ? state.aiSpin
        : decaySpin(
            state.aiSpin,
            dt,
            state.aiBey.sta ?? 50,
            aiSandMult
          );
      cancelAbilitiesOnSpinStop(state, dt);
      tickAbilityTimers(state, dt);
      syncSpecialFlashOverlay();
      tickAbilityVisuals(state, dt);
      tickLeoneAbilityVisuals(state, dt);
      tickLdragoAbilityVisuals(state, dt);
      tickLibraAbilityVisuals(state, dt);
      tickBullAbilityVisuals(state, dt);
      trackSleepers(state);
      updateHud();
      updateAbilityHud();

      const result = evaluateWin(state);
      if (result?.cinematic) {
        if (!state.pendingKo) {
          state.pendingKo = { ...result, elapsed: 0 };
          const loserBody = result.loser === 1 ? state.playerBody : state.aiBody;
          clearAbilityFlags(loserBody);
          beginRingOut(loserBody);
        }
      } else if (result) {
        endGame(result);
      }

      if (state.pendingKo) {
        state.pendingKo.elapsed += dt;
        const loserBody =
          state.pendingKo.loser === 1 ? state.playerBody : state.aiBody;
        if (isRingOutCinematicDone(loserBody, state.pendingKo.elapsed)) {
          endGame(state.pendingKo);
        }
      }
    }

    updateAbilityVisuals();

    if (state.playerBody) {
      state.playerVisualYaw = syncTopVisual(
        playerGroup,
        state.playerBody,
        state.playerSpin,
        state.playerVisualYaw,
        dt,
        1
      );
    }
    if (state.aiBody) {
      state.aiVisualYaw = syncTopVisual(
        aiGroup,
        state.aiBody,
        state.aiSpin,
        state.aiVisualYaw,
        dt,
        -0.95
      );
    }

    syncDebugRing(debug.playerRing, state.playerBody);
    syncDebugRing(debug.aiRing, state.aiBody);

    starBlastVfx.player.update(playerGroup, state.playerBody, camera, dt);
    starBlastVfx.ai.update(aiGroup, state.aiBody, camera, dt);
    leoneVfx.player.update(playerGroup, state.playerBody, camera, dt);
    leoneVfx.ai.update(aiGroup, state.aiBody, camera, dt);
    speedBoostVfx.player.update(playerGroup, state.playerBody, camera, dt);
    speedBoostVfx.ai.update(aiGroup, state.aiBody, camera, dt);
    ldragoVfx.player.update(playerGroup, state.playerBody, camera, dt);
    ldragoVfx.ai.update(aiGroup, state.aiBody, camera, dt);
    libraVfx.player.update(playerGroup, state.playerBody, camera, dt);
    libraVfx.ai.update(aiGroup, state.aiBody, camera, dt);
    bullVfx.player.update(playerGroup, state.playerBody, camera, dt);
    bullVfx.ai.update(aiGroup, state.aiBody, camera, dt);
    collisionSparksVfx.update(camera, dt);

    if (!state.gameFrozen) {
      updateCamera(camera, state, mode, getCameraCue(state, dt, mode));
    }
    renderer.render(scene, camera);
  }

  dom.btnStart.addEventListener('click', () => input.onStartClick?.(startGame) ?? startGame());
  dom.btnRestart.addEventListener('click', () => input.onRestart?.(resetGame) ?? resetGame());
  dom.btnChangeBey?.addEventListener('click', () => input.onChangeBey?.());
  dom.btnRecalibrate?.addEventListener('click', () => input.onRecalibrate?.());

  gameLoop();

  return { state, startGame, resetGame, returnToMenu, spawnTops, triggerAbility, playerGroup, aiGroup };
}
