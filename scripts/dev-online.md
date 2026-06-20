# Online multiplayer (local dev)

## Quick start

1. Install dependencies: `npm install`
2. Start server + static site: `npm run dev:online`
3. Open **http://localhost:3000/pc.html** (desktop) or **http://localhost:3000/** (mobile)
4. Select **Online** mode
5. Host: copy the invite link
6. Guest: open the link in another browser/device (use your LAN IP for phone testing, e.g. `http://192.168.x.x:3000/?room=ABC123`)

## Automated tests

```bash
npm test                 # snapshot roundtrip + server tick
npm run test:ws-smoke    # WebSocket room + snapshots
```

## Manual checklist

- [ ] Host creates room; guest joins via link
- [ ] Opponent shows "Locked in" only (not their bey) during pick
- [ ] Both lock → reveal → 3-2-1 countdown → match starts
- [ ] Steering and abilities sync on both screens
- [ ] Special move logo flash visible on both clients
- [ ] Best-of-3 series scoring updates correctly
- [ ] Disconnect shows forfeit / opponent left message

## Troubleshooting

- **WebSocket failed**: ensure `npm run dev:server` is running on port 3001
- **Phone cannot connect**: use PC LAN IP, not `localhost`; allow firewall for ports 3000 and 3001
- **iOS motion**: grant motion permission when prompted; use Calibrate if drift occurs
- **Debug overlay**: add `?debug=1` to the URL for tick/latency stats

## Architecture

- Authoritative server: `server/` runs 60Hz simulation via `js/game/matchFactory.js`
- Clients send inputs; server broadcasts snapshots + events
- **Local dev:** static site on `:3000`, WebSocket on `:3001` (`npm run dev:online`)
- **Production:** one Node process serves the game + WebSockets on the same HTTPS origin (`npm start` with `PORT` set)

## Production deploy (online multiplayer)

The game and WebSocket server run together when the host sets `PORT` (Railway, Fly.io, Render, Docker, etc.).

### Quick test (unified server locally)

```powershell
# PowerShell
$env:PORT = "8080"
npm start
```

Open **http://localhost:8080/** (mobile) or **http://localhost:8080/pc/** (desktop). Online mode uses `ws://localhost:8080` on the same port.

### Railway (recommended)

1. Push repo to GitHub
2. [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Railway sets `PORT` automatically; `npm start` serves static files + WebSockets
4. Add a public domain in Railway settings (HTTPS is automatic)

### Fly.io

```bash
fly launch          # pick app name / region; keep Dockerfile
fly deploy
fly certs add yourdomain.com   # optional custom domain
```

Edit `fly.toml` `app` name before first deploy.

### Docker

```bash
docker build -t beyweb .
docker run -p 8080:8080 -e PORT=8080 beyweb
```

### Health check

`GET /health` → `{ "ok": true, "rooms": <n> }`

### Notes

- HTTPS/WSS is required for iOS motion controls and secure invite links
- Invite links use the page origin (`joinUrl` in `js/net/protocol.js`) — no extra config once the domain is live
- For split static+WS hosting (CDN + separate API), you would need a custom `wsUrl` — the default is same-origin
