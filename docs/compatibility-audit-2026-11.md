# Homebridge and UniFi Protect compatibility audit (November 2026)

Audit date: 25 November 2026. This audit updates the
[October 2026 audit](compatibility-audit-2026-10.md). The findings of the October audit
stay correct, except where this document gives different findings. Each finding has a tracking issue
(#64 to #73), and version 1.0.5 ships all of them.

## Homebridge 2.5 and Node.js 26

[Homebridge 2.5.0](https://github.com/homebridge/homebridge/releases/tag/v2.5.0)
(1 November 2026) ships
[HAP-NodeJS 2.3.0](https://github.com/homebridge/HAP-NodeJS/releases/tag/v2.3.0).
It declares Node `^22.12.0 || ^24 || ^26`. The
[Node support policy](https://github.com/homebridge/homebridge/wiki/How-To-Update-Node.js)
shows that Node 26 has support from October 2026 to April 2029. The official Docker
image contains Node 26. Since 1 November 2026, the Verified Plugins criteria require that
plugins operate on Node 22, 24 and 26.

The plugin now declares the same Node range as Homebridge. CI and the release
workflow do tests on 22.x, 24.x and 26.x. `@types/node` stays on the lowest
supported major version (22). Thus, the compiler rejects each Node API that is not in Node 22.

HAP-NodeJS 2.3 is now an ES module. A direct import of its `dist/lib` paths does not
attach the Service and Characteristic definitions now. The plugin imports
only the public `homebridge` entry point. Thus, this change has no effect on the plugin. Release 2.3 adds
no new camera or RecordingManagement deprecations. Its camera fixes reject
malformed SetupEndpoints writes and invalid prepared-stream responses. They also correct
some crashes in the HKSV datastream.

## Deprecated API enforcement

`npm run lint` now runs typescript-eslint's `no-deprecated` rule, with type
information, over `src` and `test`. If the types of a Homebridge, HAP-NodeJS, Node or
library call mark it `@deprecated`, the build fails. The audit found
no such calls. It found no legacy code paths or migration shims to remove.

## UniFi Protect Integration API 7.4.102

[developer.ui.com](https://developer.ui.com/protect/v7.4.102/gettingstarted)
publishes Protect 7.4.102. The
[CDN contract](https://apidoc-cdn.ui.com/protect/v7.4.102/integration.json) was
retrieved on 25 November 2026:

- The raw download's SHA-256 is
  `96d28fadfe9e0ce3ca954f2295ca2c4994660864bb12f4ba33e0672fcfc58f36`.
- The repository normalizes the file to two-space indentation, as
  `spec/protect-7.4.102.openapi.json`. That file's SHA-256 is
  `627f545cd8b553f0ce48f14ae077d63bf6d02aacf6d1e7b26a42339ff8f552c9`.

The 7.3.74 contract (the live console's version) is byte-identical to 7.3.70.

Compared with 7.3.70, version 7.4.102 removes nothing and marks nothing
deprecated. The camera, light, chime, snapshot, RTSPS and subscription
operations that the plugin uses are unchanged. The changes that affect the
plugin are:

- **Talkback.** `POST /v1/cameras/{id}/talkback-session` documents `409` when
  another talkback session is already in progress. The plugin reports this as
  "talkback busy" and does not retry.
- **New required fields.** `sensor.isMountedIncorrectly` and `nvr.featureFlags`
  are new, and the spec marks them required. Consoles on 7.3.x do not send them,
  so schema generation makes them optional. Without that, every sensor and NVR
  payload from a console that has not upgraded would fail validation.
- **minProperties.** The generator now supports `minProperties`, which the
  external arm-profile schemas use. The generator still refuses to run on any
  JSON Schema keyword it does not support.

7.4.102 also adds endpoints the plugin does not use yet:

- External Alarm Manager arm profiles (`/v1/external/arm-profiles` and its arm
  and disarm actions)
- `POST /v1/speakers/{id}/stop-siren`
- A combined `GET /v1/subscribe/updates` WebSocket

The two current subscription sockets are not deprecated. The new endpoints are
possible enhancements for a later release. They are not in this release.

## Robustness fixes

The code audit found no high-severity defects. It found these medium- and
low-severity defects:

| Issue | Fix |
| --- | --- |
| #66 | Tracker-owned sensors reset to clear on startup instead of restoring a cached "detected" value. |
| #67 | Snapshots and HomeKit writes get short request budgets. In-flight snapshots are shared, and the last snapshot is served if a new one fails. Non-idempotent POSTs are not retried after a timeout. |
| #68 | Chime On and Brightness writes are coalesced into one volume update. |
| #69 | A refused WebSocket upgrade is aborted immediately, so the reconnect logic runs promptly. |
| #70 | An unexpected live-view ffmpeg exit stops the HomeKit streaming session. |
| #71 | `config.json` is written atomically, through a temporary file and a rename. |
| #72 | The settings UI server validates the console host and the shape of list responses. |

## TypeScript 7

The latest typescript-eslint release, 8.74.0, still requires
`typescript >=4.8.4 <6.1.0`. TypeScript 7 support is tracked in
[typescript-eslint#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940).
The plugin stays on TypeScript 6.0.3. The official Homebridge plugin
template also uses TypeScript 6.0.3.

## Live verification

The checks ran against Homebridge 2.5.0 (HAP 2.3.0, Node 26.13.1, official
Docker image with VAAPI) and Protect 7.3.74, with five cameras and one chime.
`npm run live-check` passed every read-only check: meta, cameras, NVRs, chimes,
lights, sensors, liveviews, snapshot, RTSPS, and both WebSocket subscriptions.
