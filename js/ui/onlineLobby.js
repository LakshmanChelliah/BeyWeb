import { joinUrl, MSG } from '../net/protocol.js';

/**
 * Online lobby: create room, copy link, wait for opponent.
 */
export function createOnlineLobby({ root, netClient, onReady }) {
  let hostMsg = null;

  root.innerHTML = `
    <div class="online-lobby">
      <div class="online-lobby-header">
        <h2 class="online-lobby-title">Online Battle</h2>
        <p class="online-lobby-status" id="online-status">Connecting…</p>
      </div>

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
        <p class="online-room-code">Room code: <strong id="online-room-code"></strong></p>
      </div>

      <p class="online-wait-hint" id="online-wait" aria-live="polite">Waiting for opponent…</p>

      <button type="button" class="online-continue-btn" id="online-continue" disabled>
        Choose Your Bey
      </button>
    </div>
  `;

  const statusEl = root.querySelector('#online-status');
  const hostPanel = root.querySelector('#online-host-panel');
  const linkInput = root.querySelector('#online-link');
  const copyBtn = root.querySelector('#online-copy');
  const roomCodeEl = root.querySelector('#online-room-code');
  const waitEl = root.querySelector('#online-wait');
  const continueBtn = root.querySelector('#online-continue');
  const peerYou = root.querySelector('#peer-you');
  const peerOpp = root.querySelector('#peer-opp');

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function updatePeers(count, { isGuest = false } = {}) {
    peerYou?.classList.add('connected');
    peerOpp?.classList.toggle('connected', count >= 2);
    if (count >= 2) {
      waitEl.textContent = 'Both connected — tap Choose Your Bey when ready';
      continueBtn.disabled = false;
    } else if (isGuest) {
      waitEl.textContent = 'Waiting for opponent to join…';
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

  continueBtn.addEventListener('click', () => onReady?.());

  function showHostPanel(msg) {
    hostMsg = msg;
    const url = joinUrl(msg.roomId);
    linkInput.value = url;
    roomCodeEl.textContent = msg.roomId;
    hostPanel.hidden = false;
    setStatus('Room created — share the link below');
    peerYou?.classList.add('connected');
  }

  netClient.on(MSG.PEER_JOINED, (msg) => {
    updatePeers(msg.peerCount ?? 2, { isGuest: hostPanel.hidden });
  });

  netClient.on(MSG.JOINED, () => {
    setStatus('Joined room');
    hostPanel.hidden = true;
    waitEl.textContent = 'Waiting for opponent to join…';
    peerYou?.classList.add('connected');
  });

  netClient.on(MSG.ROOM_CREATED, (msg) => {
    showHostPanel(msg);
  });

  netClient.on(MSG.ERROR, (msg) => {
    setStatus(msg.message || 'Error');
  });

  async function start(isGuest) {
    setStatus('Connecting to server…');
    try {
      if (isGuest) {
        const room = new URLSearchParams(location.search).get('room');
        if (!room) throw new Error('No room code in link');
        await netClient.joinRoom(room);
      } else {
        hostPanel.hidden = false;
        linkInput.value = '';
        roomCodeEl.textContent = '…';
        setStatus('Creating room…');
        const created = await netClient.createRoom();
        showHostPanel(created);
      }
    } catch (err) {
      hostPanel.hidden = isGuest;
      const msg = err?.message || 'Could not connect';
      if (!isGuest) {
        setStatus(`${msg}. Start the game server with: npm run dev:online`);
      } else {
        setStatus(msg);
      }
    }
  }

  return { start };
}
