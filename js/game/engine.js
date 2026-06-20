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
  updateTopCollisions,
  beginLaunchDrop,
  stepSleepOutTimers,
} from '../physics/top.js';
import {
  beginRingOut,
  isRingOutCinematicDone,
  clearRingOut,
} from '../physics/ringOut.js';
import { createGameState, resetRoundState } from './state.js';
import { evaluateWin, trackSleepers, formatEndGame } from './rules.js';
import { createScene, updateCamera, resetMobileCameraFraming } from '../render/scene.js';
import { createArenaMesh } from '../render/arena.js';
import { createTopGroups, loadTopModel, setTopEmissive } from '../render/top.js';
import { beyColorHex, getBeyOrDefault } from './beys.js';
import {
  createAbilityRuntime,
  triggerAbility as triggerAbilityCore,
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
  ABILITY_REGISTRY,
} from './abilities.js';
import { stepSimulation } from './simulation.js';
import { createStarBlastVfx } from '../render/starBlastVfx.js';
import { createLeoneAbilityVfx } from '../render/leoneAbilityVfx.js';
import { createPegasusSpeedBoostVfx } from '../render/pegasusSpeedBoostVfx.js';
import { createLdragoAbilityVfx } from '../render/ldragoAbilityVfx.js';
import { createLibraAbilityVfx } from '../render/libraAbilityVfx.js';
import { createBullAbilityVfx } from '../render/bullAbilityVfx.js';
import { createCollisionSparksVfx } from '../render/collisionSparksVfx.js';
import { applySnapshotMeta } from '../net/snapshot.js';
import { createInterpolator } from '../net/interpolation.js';

/**
 * Boots the shared game engine for PC (2-player) or mobile (gyro + AI).
 */
export function createGame({ mode, canvas, ui, input, isVsCpu, isOnline, getLocalSlot }) {
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
  const netInterpolator = createInterpolator();
  let lastSnapAt = 0;
  let lastServerTick = 0;

  function onlineActive() {
    return isOnline?.() ?? false;
  }

  function localSlot() {
    return getLocalSlot?.() ?? 0;
  }

  /** Map HUD side (you/opponent) to sim body side (player=slot0, ai=slot1). */
  function hudToSimSide(hudSide) {
    if (!onlineActive() || localSlot() === 0) return hudSide;
    return hudSide === 'player' ? 'ai' : 'player';
  }

  function simBody(simSide) {
    return simSide === 'player' ? state.playerBody : state.aiBody;
  }

  function localYouBey() {
    return localSlot() === 1 ? state.aiBey : state.playerBey;
  }

  function localOppBey() {
    return localSlot() === 1 ? state.playerBey : state.aiBey;
  }

  function handleNetEvents(events) {
    for (const ev of events ?? []) {
      if (ev.type === 'ability_trigger') {
        const isYou = ev.side === localSlot();
        const bey = isYou ? localYouBey() : localOppBey();
        const ability = ABILITY_REGISTRY[ev.abilityId];
        if (ev.slot === 'special') {
          playSpecialFlash(bey, ability?.glow || ev.glow);
        }
      }
      if (ev.type === 'collision_spark') {
        collisionSparksVfx.spawn(ev);
      }
    }
  }

  function applyNetSnapshot(msg) {
    if (onlineActive() && input.isAwaitingRoundReady?.()) return;
    if (onlineActive() && !state.gameRunning && state.gameFrozen) return;
    if (msg.tick != null && msg.tick <= lastServerTick) return;
    if (msg.tick != null) lastServerTick = msg.tick;

    lastSnapAt = performance.now();
    netInterpolator.pushSnapshot(msg);
    applySnapshotMeta(state, msg);
    handleNetEvents(msg.events);
    updateHud();
    updateAbilityHud();
  }

  function startOnlineRound() {
    if (!state.playerBody) spawnTops();
    netInterpolator.reset();
    lastServerTick = 0;
    lastSnapAt = 0;
    state.gameFrozen = false;
    state.pendingKo = null;
    dom.startOverlay.classList.add('hidden');
    dom.hud.classList.add('visible');
    dom.controlsHint?.classList.add('visible');
    dom.gameoverOverlay.classList.remove('visible');
    for (const container of Object.values(dom.abilityBars)) {
      container?.classList.add('visible');
    }
    state.gameRunning = true;
    state.gameFrozen = false;
    clock.getDelta();
  }

  function tearDownOnlineMatch() {
    resetStarBlastCamera();
    resetMobileCameraFraming();
    resetAllAbilityVfx();
    netInterpolator.reset();
    input.clearKeys?.();
    state.pendingKo = null;
    state.launchGrace = 0;
    state.gameRunning = false;
    state.gameFrozen = false;
    if (state.playerBody) {
      world.removeBody(state.playerBody);
      state.playerBody = null;
    }
    if (state.aiBody) {
      world.removeBody(state.aiBody);
      state.aiBody = null;
    }
    state.abilities = null;
    for (const container of Object.values(dom.abilityBars)) {
      container?.classList.remove('visible');
      if (container) container.innerHTML = '';
    }
    dom.hud.classList.remove('visible');
    dom.controlsHint?.classList.remove('visible');
    dom.gameoverOverlay.classList.remove('visible');
    dom.specialFlash?.classList.remove('flash-play');
  }

  function endOnlineRound() {
    state.gameFrozen = true;
    state.gameRunning = false;
    freezeBodies();
    dom.gameoverOverlay.classList.add('visible');
  }

  function abilityKeyLabels() {
    if (mode !== 'pc') return { player: {}, ai: {} };
    if (isVsCpu?.()) return { player: { power: 'Q', special: 'E' }, ai: {} };
    return { player: { power: 'Q', special: 'E' }, ai: { power: ',', special: '.' } };
  }
  const abilityButtons = { player: [], ai: [] };

  function buildAbilityButtons(hudSide) {
    abilityButtons[hudSide] = [];
    const simSide = hudToSimSide(hudSide);
    const container = dom.abilityBars[hudSide];
    if (!container) return;
    container.innerHTML = '';
    const runtime = state.abilities?.[simSide];
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
      const keyLabel = abilityKeyLabels()[hudSide]?.[slotName];
      btn.innerHTML =
        `<span class="ability-cd"></span>` +
        `<span class="ability-icon">${ability.icon || ''}</span>` +
        `<span class="ability-name">${ability.name}</span>` +
        (keyLabel ? `<span class="ability-key">${keyLabel}</span>` : '');
      btn.setAttribute('aria-label', `${ability.name}${keyLabel ? ` (${keyLabel})` : ''}`);
      btn.addEventListener('click', () => triggerAbility(hudSide, slotName));
      container.appendChild(btn);
      abilityButtons[hudSide].push({ btn, slot, cdEl: btn.querySelector('.ability-cd') });
    }
    container.classList.toggle('visible', abilityButtons[hudSide].length > 0);
  }

  function updateAbilityHud() {
    for (const hudSide of ['player', 'ai']) {
      for (const { btn, slot, cdEl } of abilityButtons[hudSide]) {
        const ability = slot.ability;
        const total = slot.cooldownTotal || ability.cooldown || 0;
        const ratio = total ? slot.cooldownRemaining / total : 0;
        cdEl.style.transform = `scaleY(${Math.max(0, Math.min(1, ratio))})`;
        const busy = slot.cooldownRemaining > 0 || slot.windupRemaining > 0 || slot.active;
        btn.classList.toggle('cooling', slot.cooldownRemaining > 0);
        btn.classList.toggle('active', slot.active || slot.windupRemaining > 0);
        btn.disabled = busy;
        btn.setAttribute('aria-disabled', busy ? 'true' : 'false');
      }
    }
  }

  function abilityGlow(simSide) {
    const runtime = state.abilities?.[simSide];
    if (!runtime) return null;
    const body = simBody(simSide);
    const sp = runtime.special;
    if (sp && (sp.active || sp.windupRemaining > 0)) {
      if (sp.ability.id === 'pegasus_star_blast') {
        if (!shouldStarBlastGlow(body) && !(sp.windupRemaining > 0 || sp.active)) return null;
        if (body?.userData.starImpactFlash) {
          return { color: sp.ability.glow, intensity: 2.4 };
        }
        const pulse = 0.7 + 0.3 * Math.sin(performance.now() * 0.009);
        return { color: sp.ability.glow, intensity: pulse * 1.45 };
      }
      if (sp.ability.id === 'leone_lion_wall') {
        const burst = body?.userData.lionWallBurstT ?? 0;
        const pulse = 0.65 + 0.35 * Math.sin(performance.now() * 0.009);
        const base = pulse * 0.55;
        const intensity = burst > 0 ? Math.max(base, 0.7 + burst * 0.45) : base;
        // Warm stone / wind haze — not saturated green.
        return { color: '#c4bfb6', intensity };
      }
      if (sp.ability.id === 'ldrago_supreme_flight') {
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
        const channeling = body?.userData.sonicBusterWindup || body?.userData.sonicBuster;
        const pulse = 0.7 + 0.3 * Math.sin(performance.now() * 0.02);
        const base = channeling ? pulse * 1.45 : pulse * 0.65;
        return { color: sp.ability.glow, intensity: base };
      }
      if (sp.ability.id === 'bull_red_horn_uppercut') {
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
        const burst = body?.userData.spinStealBurstT ?? 0;
        const pulse = 0.65 + 0.35 * Math.sin(performance.now() * 0.012);
        const base = pulse * 1.05;
        const intensity = burst > 0 ? Math.max(base, 1.4 + burst * 0.8) : base;
        return { color: pw.ability.glow, intensity };
      }
      if (pw.ability.id === 'libra_sonic_shield') {
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
    // Glow follows sim bodies (playerGroup=slot0, aiGroup=slot1), not HUD labels.
    const pGlow = abilityGlow('player');
    setTopEmissive(playerGroup, pGlow ? pGlow.color : 0x000000, pGlow ? pGlow.intensity : 0);
    const aGlow = abilityGlow('ai');
    setTopEmissive(aiGroup, aGlow ? aGlow.color : 0x000000, aGlow ? aGlow.intensity : 0);
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
    if (!state.gameRunning || state.gameFrozen || state.pendingKo) return;
    const simSide = hudToSimSide(side);
    const abilitySlot = state.abilities?.[simSide]?.[slot];
    if (abilitySlot?.cooldownRemaining > 0 || abilitySlot?.windupRemaining > 0 || abilitySlot?.active) {
      return;
    }
    if (onlineActive()) {
      if (side !== 'player') return;
      input.queueAbility?.(slot);
      return;
    }
    if (state.launchGrace > 0) return;
    const ability = triggerAbilityCore(state, side, slot);
    if (ability && slot === 'special') {
      const bey = side === 'player' ? state.playerBey : state.aiBey;
      playSpecialFlash(bey, ability.glow);
    }
  }

  function updateHud() {
    const youSpin = onlineActive() && localSlot() === 1 ? state.aiSpin : state.playerSpin;
    const rivalSpin = onlineActive() && localSlot() === 1 ? state.playerSpin : state.aiSpin;
    const pPct = Math.round(youSpin * 100);
    const aPct = Math.round(rivalSpin * 100);
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
    if (onlineActive()) {
      apply(dom.playerAvatar, localYouBey());
      apply(dom.aiAvatar, localOppBey());
    } else {
      apply(dom.playerAvatar, state.playerBey);
      apply(dom.aiAvatar, state.aiBey);
    }
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

    const playerBey = getBeyOrDefault(state.playerBey?.id, 'pegasus');
    const aiBey = getBeyOrDefault(state.aiBey?.id, 'ldrago');
    state.playerBey = playerBey;
    state.aiBey = aiBey;

    const stampBody = (body, bey) => {
      body.userData.beyStats = {
        id: bey.id,
        atk: bey.atk ?? 50,
        move: bey.move ?? bey.atk ?? 50,
        def: bey.def ?? 50,
        sta: bey.sta ?? 50,
      };
      body.userData.beyColor = beyColorHex(bey.color);
    };

    // Stamp bey stats onto sim bodies (player=slot0, ai=slot1).
    stampBody(state.playerBody, playerBey);
    stampBody(state.aiBody, aiBey);

    // Tag sides and build ability runtimes aligned to sim bodies.
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

    // Always bind visuals to sim groups/bodies (player=slot0, ai=slot1).
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
    for (const container of Object.values(dom.abilityBars)) {
      container?.classList.remove('visible');
    }
    dom.startOverlay.classList.remove('hidden');
    dom.btnStart.disabled = false;
    input.clearKeys?.();
  }

  function resetGame() {
    if (onlineActive()) return;
    state.gameFrozen = false;
    dom.gameoverOverlay.classList.remove('visible');
    input.clearKeys?.();
    spawnTops();
    netInterpolator.reset();
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
    stepSimulation({ state, world, contacts, input });
  }

  function gameLoop() {
    requestAnimationFrame(gameLoop);
    const dt = Math.min(clock.getDelta(), 0.05);

    if (state.gameRunning && !state.gameFrozen) {
      if (onlineActive()) {
        input.applySteering?.(state);
        updateTopCollisions(state);
        netInterpolator.update(dt, state, localSlot());
      } else {
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
      stepSleepOutTimers(state.playerBody, state.playerSpin, dt);
      stepSleepOutTimers(state.aiBody, state.aiSpin, dt);
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
      } // end local physics

      if (onlineActive()) {
        syncSpecialFlashOverlay();
        updateHud();
        updateAbilityHud();
        input.onNetFrame?.({
          snapAge: lastSnapAt ? performance.now() - lastSnapAt : 0,
          dt,
          serverTick: lastServerTick,
          interpDelay: netInterpolator.delayTicks,
        });
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
        1,
        state
      );
    }
    if (state.aiBody) {
      state.aiVisualYaw = syncTopVisual(
        aiGroup,
        state.aiBody,
        state.aiSpin,
        state.aiVisualYaw,
        dt,
        -0.95,
        state
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

  return {
    state,
    startGame,
    resetGame,
    returnToMenu,
    spawnTops,
    triggerAbility,
    applyNetSnapshot,
    startOnlineRound,
    endOnlineRound,
    endOfflineMatch: endGame,
    tearDownOnlineMatch,
    setNetRtt(ms) {
      netInterpolator.setRtt(ms);
    },
    playerGroup,
    aiGroup,
  };
}
