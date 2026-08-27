# Fork TODO

Personal-fork addition (not upstream). Backlog pulled from upstream's open issues/PRs at
[jkingsman/Remote-Terminal-for-MeshCore](https://github.com/jkingsman/Remote-Terminal-for-MeshCore),
reviewed 2026-08-26, to decide what's worth fixing/implementing in this fork.

**Context:** upstream development is paused ([#343](https://github.com/jkingsman/Remote-Terminal-for-MeshCore/issues/343))
— the maintainer started a new job on 7/27 with OSS contribution restrictions and expects to resume
"in a few weeks" (a month ago as of this writing). PRs we open upstream will likely sit unreviewed for
a while; that doesn't block fixing things here for our own use.

## P1 — Quick wins (small, low-risk, do first)

- [x] **[#349](https://github.com/jkingsman/Remote-Terminal-for-MeshCore/issues/349) / [PR #350](https://github.com/jkingsman/Remote-Terminal-for-MeshCore/pull/350)** — Repeater CLI input auto-capitalizes on mobile (`Get radio` fails, `get radio` works). PR #350 already has the exact one-line fix (`autoCapitalize="none"` in `RepeaterConsolePane.tsx`) — apply directly, no need to deal with the PR branch.
- [x] **[#348](https://github.com/jkingsman/Remote-Terminal-for-MeshCore/issues/348)** — README has no update/upgrade instructions; user was confused that reinstalling from scratch overwrites the old DB. Docs-only fix.
- [x] **[#326](https://github.com/jkingsman/Remote-Terminal-for-MeshCore/issues/326)** — RPT login warning banner doesn't clear after a later authenticated action succeeds, even though success implicitly proves the login worked.
- [x] **[#312](https://github.com/jkingsman/Remote-Terminal-for-MeshCore/issues/312)** — Repeater console: up/down-arrow command history + a link to the official CLI docs. Maintainer explicitly signed off on exactly this scope (declined an inline command reference).
- [x] **[PR #324](https://github.com/jkingsman/Remote-Terminal-for-MeshCore/pull/324)** (dependabot) — `ws` 8.19.0 → 8.21.1 (frontend). Routine patch bump, safe to pull in.
- [x] **[PR #336](https://github.com/jkingsman/Remote-Terminal-for-MeshCore/pull/336)** (dependabot) — `pydantic-settings` 2.12.0 → 2.14.2. Routine minor bump, safe to pull in.

## P2 — Real bugs

- [x] **[#345](https://github.com/jkingsman/Remote-Terminal-for-MeshCore/issues/345)** — Trace timeout returns HTTP 408, which causes endless auto-retry with no way to cancel. Should return 422 instead — same fix pattern already used elsewhere in a prior PR (#237).
- [ ] **[#351](https://github.com/jkingsman/Remote-Terminal-for-MeshCore/issues/351)** — BLE reconnect crash on Ubuntu: `[org.bluez.Error.NotPermitted] Notify acquired` in `radio.py:620`. Needs a BLE device to reproduce/debug properly.
- [ ] **[#301](https://github.com/jkingsman/Remote-Terminal-for-MeshCore/issues/301)** — Room servers: path-based login always fails (only flood works), and the 10s login timeout is too short for multi-hop rooms. Maintainer confirmed rooms are "severely untested" — expect more issues once poked at.

## P3 — Medium features

- [ ] **[#273](https://github.com/jkingsman/Remote-Terminal-for-MeshCore/issues/273)** — Manual resend button for DMs that never got acked (auto-resend already tries 3x + flood; this covers the residual failure case). Read the full thread first — maintainer is torn on keeping both auto- and manual-resend vs. going fully manual.
- [ ] **[#331](https://github.com/jkingsman/Remote-Terminal-for-MeshCore/issues/331)** — Auto-delete contacts unseen for N days (favorites exempt). Maintainer likes the idea but flagged open questions: purge contacts you've actually DMed? keep historical telemetry after deletion?
- [ ] **[#346](https://github.com/jkingsman/Remote-Terminal-for-MeshCore/issues/346)** — Redirect/refresh the frontend on 401/403 from the API or WebSocket, for reverse-proxy auth setups.
- [ ] **[#347](https://github.com/jkingsman/Remote-Terminal-for-MeshCore/issues/347)** — Parse the Android app's `<pubkey:type:name>` contact-share format in messages and offer a prefilled "add contact" flow.
- [ ] **[#354](https://github.com/jkingsman/Remote-Terminal-for-MeshCore/issues/354)** — Support MeshCore Open's message-reaction format (builds on existing rich-payload support from #291).
- [x] **[#325](https://github.com/jkingsman/Remote-Terminal-for-MeshCore/issues/325)** (partial) — Repeater-info fetches should be a serialized background queue; switching tabs mid-fetch currently breaks the spinner state, and concurrent requests grey each other out. Fixed the "grey each other out" half: per-pane refresh buttons no longer disable on unrelated panes' loading state (backend's radio_operation lock already serializes the actual fetches). Did **not** fix fetches surviving navigation away as a true background job — jkingsman confirmed that's an architecture limitation he's not actioning near-term, so it stays open upstream.
- [ ] **[#329](https://github.com/jkingsman/Remote-Terminal-for-MeshCore/issues/329)** — Collapsible left sidebar to reclaim screen space (reporter sketched a nav hierarchy in the thread — worth reading before implementing).

## P4 — Needs a real review before deciding, not a rubber-stamp

- [ ] **[PR #342](https://github.com/jkingsman/Remote-Terminal-for-MeshCore/pull/342)** — MQTT community neighbor reporting. Best-quality of the non-trivial PRs: well-scoped (new `community_neighbors.py` fanout module + `mqtt_base`/`mqtt_community` changes), has its own dedicated tests, all 9 CI checks green. AI-authored (disclosed by the author). jkingsman's only pushback was process (no issue discussion first) and wanting more design context — not a rejection. Read the diff properly before merging; good candidate if we want this feature.
- [ ] **[PR #352](https://github.com/jkingsman/Remote-Terminal-for-MeshCore/pull/352)** — Titled "SMS integration" but actually **210 files, +37,519 lines**: introduces a whole new parallel bot subsystem (`app/bots/library/code/`) with dozens of built-in bots (weather, earthquake/MOWAS alerts, satpass, solar, dice, jokes, HAMCALL, etc.) plus the VoIP.ms/Twilio SMS bridge. Several bundled bots are internet-API-backed and some look cron/schedule-driven — directly conflicts with upstream's own `CONTRIBUTING.md` rules ("no internet-to-mesh bridging," "no automated/interval radio traffic"). Zero CI runs, zero human review, "UNSTABLE" merge state. Don't adopt without a serious security/design review; only worth it if we specifically want SMS bridging badly enough to fund that review ourselves.
- [ ] **[PR #353](https://github.com/jkingsman/Remote-Terminal-for-MeshCore/pull/353)** — "HAMCALL lookup bot." Despite the PR body claiming to be self-contained, it's a single file that only works on top of #352's new bot-library engine — **can't be cherry-picked independently**. Tie this to the #352 decision, don't treat it separately.
- [ ] **[PR #355](https://github.com/jkingsman/Remote-Terminal-for-MeshCore/pull/355)** — Message compression + signature-verification codec (34 files, new DB migrations, touches the send/receive pipeline). The **author's own PR title says "not qualified at all"**, ported from example Dart code. Unaudited signature-verification code with self-disclaimed low confidence is a real risk — zero CI, no visible tests, zero review. Don't adopt as-is.

## Not actionable / reference only

- **[#343](https://github.com/jkingsman/Remote-Terminal-for-MeshCore/issues/343)** — the dev-pause announcement itself (context above).
- **[#344](https://github.com/jkingsman/Remote-Terminal-for-MeshCore/issues/344)** — "Bot question" (announce new repeaters to #bot channel) — a how-to support question, not a code change.
- **[#275](https://github.com/jkingsman/Remote-Terminal-for-MeshCore/issues/275)** — Plugin architecture. Maintainer explicitly wants to design/own this himself; a fork PR here would likely conflict with his eventual direction. Skip.
- **[#292](https://github.com/jkingsman/Remote-Terminal-for-MeshCore/issues/292)** — pyMC/TCP zero-hop-only. Thread resolved itself; traced to pyMC/openHop firmware conformance, not an RT bug. No action needed.
