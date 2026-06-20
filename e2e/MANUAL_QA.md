# Online Next-Round Manual QA Checklist

Run `npm run dev:online`, open two browsers (or one normal + one incognito).

## Between-round flow

- [ ] Round ends → gameover shows "Next Round (0/2)" — no 3-2-1 countdown yet
- [ ] One player clicks → button disabled, status shows "Waiting for opponent (1/2)" — still no countdown
- [ ] Second player clicks → countdown 3-2-1-Let It Rip → gameover hides, HUD visible, tops moving
- [ ] Repeat for round 2 of a best-of-3

## Input safety

- [ ] Pressing Space/Enter on gameover does not advance ready count without clicking the button
- [ ] Only intentional "Next Round" button click registers ready

## Edge cases

- [ ] Tab backgrounded during countdown → round still starts when returning
- [ ] Draw round → same ready gate applies
- [ ] Series end → "Rematch" flow still works
- [ ] Opponent disconnect during ready-wait → clear messaging, no phantom countdown

## Platforms

- [ ] PC (`pc.html`) keyboard flow
- [ ] Mobile (`index.html`) touch flow on gameover button

## Automated coverage (last run)

- `npm test` — all Node integration tests pass (includes `test:next-round`)
- `npm run test:e2e` — Playwright: 4/4 passed (client gating, recovery, Space blocked, shared-match flow)

## Manual sign-off

Use the checklists above in two real browsers after `npm run dev:online` before release.
