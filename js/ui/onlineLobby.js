import { joinUrl, MSG } from '../net/protocol.js?v=23';

function normalizeRoomCode(raw) {
  return String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

/**
 * Online lobby: join by room code, create room, copy link, wait for opponent.
 */
export function createOnlineLobby({ root, netClient, onReady, onRoomJoined }) {
  let hostMsg = null;
  let inRoom = false;
  const unsubs = [];

  root.innerHTML = `
    <div class="online-lobby">
      <div class="online-lobby-header">
        <h2 class="online-lobby-title">Online Battle</h2>
        <p class="online-lobby-status" id="online-status">Connecting…</p>
      </div>

      <div class="online-lobby-entry" id="online-entry-panel">
        <div class="online-join-block">
          <p class="online-link-label">Join with room code</p>
          <div class="online-link-row">
            <input
              type="text"
              class="online-code-input"
              id="online-join-code"
              maxlength="6"
              autocapitalize="characters"
              autocomplete="off"
              spellcheck="false"
              placeholder="ABC123"
              aria-label="Room code"
            />
            <button type="button" class="online-join-btn" id="online-join-btn">Join Room</button>
          </div>
        </div>
        <p class="online-lobby-divider" aria-hidden="true">or</p>
        <button type="button" class="online-create-btn" id="online-create-btn">Create Room</button>
      </div>

      <div class="online-lobby-room" id="online-room-panel" hidden>
        <div class="online-lobby-peers" aria-label="Connection status">
          <div class="online-peer" id="peer-you">
            <span class="online-peer-dot" aria-hidden="true"></span>
            <span class="online-peer-name">You</span>
          </div>
          <div class="online-peer-connector" aria-hidden="true"></div>
          <div class="online-peer" id="peer-opp">
            <span class="online-peer-dot" aria-hidden="true"></span>
            <span class="online-peer-name">Opponent</span>
          </div>
        </div>

        <div class="online-lobby-share" id="online-host-panel" hidden>
          <p class="online-link-label">Invite your rival</p>
          <div class="online-link-row">
            <input type="text" class="online-link-input" id="online-link" readonly />
            <button type="button" class="online-copy-btn" id="online-copy">Copy Link</button>
          </div>
          <div class="online-room-code-row">
            <p class="online-room-code">Room code: <strong id="online-room-code"></strong></p>
            <button type="button" class="online-copy-code-btn" id="online-copy-code">Copy Code</button>
          </div>
        </div>

        <p class="online-wait-hint" id="online-wait" aria-live="polite">Waiting for opponent…</p>
      </div>

      <div class="online-ready-popup" id="online-ready-popup" hidden>
        <div class="online-ready-popup-backdrop" aria-hidden="true"></div>
        <div
          class="online-ready-popup-card"
          role="dialog"
          aria-labelledby="online-ready-title"
          aria-describedby="online-ready-desc"
        >
          <p class="online-ready-popup-eyebrow">Both connected</p>
          <h3 class="online-ready-popup-title" id="online-ready-title">Ready to battle?</h3>
          <p class="online-ready-popup-desc" id="online-ready-desc">
            Pick your bey and lock in when you are ready.
          </p>
          <button type="button" class="online-continue-btn" id="online-continue" disabled>
            Choose Your Bey
          </button>
        </div>
      </div>
    </div>
  `;

  const statusEl = root.querySelector('#online-status');
  const entryPanel = root.querySelector('#online-entry-panel');
  const roomPanel = root.querySelector('#online-room-panel');
  const hostPanel = root.querySelector('#online-host-panel');
  const linkInput = root.querySelector('#online-link');
  const copyBtn = root.querySelector('#online-copy');
  const copyCodeBtn = root.querySelector('#online-copy-code');
  const roomCodeEl = root.querySelector('#online-room-code');
  const joinCodeInput = root.querySelector('#online-join-code');
  const joinBtn = root.querySelector('#online-join-btn');
  const createBtn = root.querySelector('#online-create-btn');
  const waitEl = root.querySelector('#online-wait');
  const continueBtn = root.querySelector('#online-continue');
  const readyPopup = root.querySelector('#online-ready-popup');
  const peerYou = root.querySelector('#peer-you');
  const peerOpp = root.querySelector('#peer-opp');

  /** Inline display overrides broken `[hidden]` + `display:flex` combos on some mobile browsers. */
  function setPanelVisible(el, visible) {
    if (!el) return;
    if (visible) {
      el.hidden = false;
      el.style.removeProperty('display');
      el.removeAttribute('aria-hidden');
    } else {
      el.hidden = true;
      el.style.display = 'none';
      el.setAttribute('aria-hidden', 'true');
    }
  }

  function hideReadyPopup() {
    setPanelVisible(readyPopup, false);
    continueBtn.disabled = true;
  }

  function showReadyPopup() {
    if (!inRoom) return;
    continueBtn.disabled = false;
    setPanelVisible(readyPopup, true);
    continueBtn.focus({ preventScroll: true });
  }

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function showEntryPanel() {
    inRoom = false;
    setPanelVisible(entryPanel, true);
    setPanelVisible(roomPanel, false);
    setPanelVisible(hostPanel, false);
    hideReadyPopup();
    peerYou?.classList.remove('connected');
    peerOpp?.classList.remove('connected');
  }

  function showRoomPanel({ isHost = false } = {}) {
    inRoom = true;
    setPanelVisible(entryPanel, false);
    setPanelVisible(roomPanel, true);
    setPanelVisible(hostPanel, isHost);
    peerYou?.classList.add('connected');
    if (!isHost) {
      waitEl.textContent = 'Waiting for opponent to join…';
    }
  }

  function updatePeers(count, { isGuest = false } = {}) {
    if (!inRoom) return;
    const peers = Number(count) || 1;
    peerYou?.classList.add('connected');
    peerOpp?.classList.toggle('connected', peers >= 2);
    if (peers >= 2) {
      waitEl.textContent = 'Rival connected — choose your bey when ready';
      showReadyPopup();
    } else {
      hideReadyPopup();
      if (isGuest) {
        waitEl.textContent = 'Waiting for opponent to join…';
      }
    }
  }

  async function copyText(text, btn, okLabel, failLabel) {
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = okLabel;
      setTimeout(() => { btn.textContent = failLabel; }, 1500);
    } catch {
      btn.textContent = 'Copy failed';
      setTimeout(() => { btn.textContent = failLabel; }, 2000);
    }
  }

  copyBtn?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(linkInput.value);
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy Link'; }, 1500);
    } catch {
      linkInput.select();
      linkInput.focus();
      copyBtn.textContent = 'Press Ctrl+C';
      setTimeout(() => { copyBtn.textContent = 'Copy Link'; }, 2500);
    }
  });

  copyCodeBtn?.addEventListener('click', () => {
    const code = roomCodeEl?.textContent?.trim();
    if (!code || code === '…') return;
    copyText(code, copyCodeBtn, 'Copied!', 'Copy Code');
  });

  joinCodeInput?.addEventListener('input', () => {
    joinCodeInput.value = normalizeRoomCode(joinCodeInput.value);
    joinBtn.disabled = joinCodeInput.value.length < 6;
  });

  joinCodeInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && joinCodeInput.value.length === 6) {
      joinBtn.click();
    }
  });

  continueBtn.addEventListener('click', () => {
    hideReadyPopup();
    onReady?.();
  });

  function showHostPanel(msg) {
    hostMsg = msg;
    const url = joinUrl(msg.roomId);
    linkInput.value = url;
    roomCodeEl.textContent = msg.roomId;
    setPanelVisible(hostPanel, true);
    setStatus('Room created — share the code or link');
    showRoomPanel({ isHost: true });
    hideReadyPopup();
    onRoomJoined?.(msg.roomId);
  }

  async function joinWithCode(raw) {
    const code = normalizeRoomCode(raw);
    if (code.length < 6) {
      setStatus('Enter a 6-character room code');
      return;
    }
    joinBtn.disabled = true;
    createBtn.disabled = true;
    setStatus('Joining room…');
    try {
      await netClient.joinRoom(code);
      showRoomPanel({ isHost: false });
      setStatus('Joined room');
      onRoomJoined?.(code);
    } catch (err) {
      showEntryPanel();
      setStatus(err?.message || 'Could not join room');
    } finally {
      joinBtn.disabled = joinCodeInput.value.length < 6;
      createBtn.disabled = false;
    }
  }

  async function createAsHost() {
    joinBtn.disabled = true;
    createBtn.disabled = true;
    setStatus('Creating room…');
    try {
      const created = await netClient.createRoom();
      showHostPanel(created);
    } catch (err) {
      showEntryPanel();
      const msg = err?.message || 'Could not connect';
      setStatus(`${msg}. Start the game server with: npm run dev:online`);
    } finally {
      joinBtn.disabled = joinCodeInput.value.length < 6;
      createBtn.disabled = false;
    }
  }

  joinBtn.addEventListener('click', () => joinWithCode(joinCodeInput.value));
  createBtn.addEventListener('click', () => createAsHost());

  unsubs.push(netClient.on(MSG.PEER_JOINED, (msg) => {
    updatePeers(msg.peerCount, { isGuest: hostPanel.hidden });
  }));

  unsubs.push(netClient.on(MSG.JOINED, () => {
    setStatus('Joined room');
    showRoomPanel({ isHost: false });
    waitEl.textContent = 'Waiting for opponent to join…';
    peerYou?.classList.add('connected');
    hideReadyPopup();
  }));

  unsubs.push(netClient.on(MSG.ROOM_CREATED, (msg) => {
    showHostPanel(msg);
  }));

  unsubs.push(netClient.on(MSG.ERROR, (msg) => {
    if (!inRoom) setStatus(msg.message || 'Error');
  }));

  async function start({ autoRoom = null, createAsHost: hostNow = false } = {}) {
    joinBtn.disabled = true;
    createBtn.disabled = false;
    showEntryPanel();
    setStatus('Connecting to server…');
    try {
      await netClient.connect();
      if (autoRoom) {
        await joinWithCode(autoRoom);
        return;
      }
      if (hostNow) {
        await createAsHost();
        return;
      }
      joinBtn.disabled = joinCodeInput.value.length < 6;
      setStatus('Join with a code or create a room');
    } catch (err) {
      setStatus(err?.message || 'Could not connect');
    }
  }

  function destroy() {
    for (const off of unsubs) off();
    unsubs.length = 0;
    hideReadyPopup();
  }

  return { start, destroy };
}
