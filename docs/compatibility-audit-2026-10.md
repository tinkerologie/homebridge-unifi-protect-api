# Homebridge and UniFi Protect compatibility audit

Audit date: 28 October 2026. This plugin targets Homebridge 2 on Node.js 22 and
24. The supported TypeScript 6 toolchain remains in place. TypeScript 7.0.2
successfully typechecks the source and tests in an isolated installation, but a
direct dependency replacement would break the compiler API used by ESLint.

## Homebridge development practices

The audit checked the [Homebridge developer guidance](https://developers.homebridge.io/),
[official plugin template](https://github.com/homebridge/homebridge-plugin-template),
[Homebridge 2 migration guide](https://github.com/homebridge/homebridge/wiki/Updating-To-Homebridge-v2.0),
and [plugin verification requirements](https://github.com/homebridge/plugins).

The plugin uses public imports from `homebridge`, an ESM entry point, dynamic
platform registration, stable device-derived UUIDs, and cached accessory
restoration through `configureAccessory`. Discovery starts after
`didFinishLaunching`; shutdown stops event subscriptions, retry timers, trackers,
streaming sessions and recording encoders. Characteristics use `onSet` and
`HapStatusError`; `C` in accessory builders means `api.hap.Characteristic`.
TLS trust and authentication remain scoped to the configured console.

Inspection of resolved TypeScript call signatures found no calls tagged
`@deprecated` in `src`. The removed Homebridge 2 APIs and direct private
Homebridge/HAP imports were not found. The locked Homebridge 2.4.0 / HAP 2.2.2
APIs used for camera controllers, streaming, recording and programmable switch
events are supported. These results concern this plugin's code, rather than
every transitive dependency.

`supports-hap` declares the implemented transport. Technical compliance alone
does not establish official Homebridge verification, which includes publication,
maintenance and distinct-functionality criteria. The verification page's older
Node examples should be read alongside the current
[Node support policy](https://github.com/homebridge/homebridge/wiki/How-To-Update-Node.js).
Homebridge 2.4.0 accepts Node 26 too; this patch retains the existing 22/24
support contract and CI matrix.

## TypeScript 7 compatibility

[Microsoft released TypeScript 7.0 on 8 July 2026](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/).
Version 7.0.2 is stable. Homebridge executes the emitted JavaScript and does not
load the compiler at runtime. An isolated `typescript@7.0.2` installation passed
`tsc --noEmit -p tsconfig.test.json` for this repository.

[typescript-eslint supports TypeScript `>=4.8.4 <6.1.0`](https://typescript-eslint.io/users/dependency-versions/).
TypeScript 7.0 does not supply the programmatic compiler API used by this tooling.
Microsoft documents a dual-compiler alias setup, but this patch retains
TypeScript 6.0.3, also used by the official Homebridge template. Adopting the
dual-compiler setup would need separate clean-install, build, lint and test
verification; a simple `typescript: ^7` bump is unsuitable.

## UniFi Protect Integration API

The current [Protect documentation](https://developer.ui.com/protect/) serves
v7.3.70. The official [7.3.70 OpenAPI document](https://developer.ui.com/protect/v7.3.70/openapi.json)
was retrieved and compared directly with the vendored 7.2.105 contract. The
paths and operations are identical, and the new document contains no
`deprecated: true` annotations. It adds four fob/link-station schemas and changes
related device models; the camera, light, sensor, chime, snapshot, RTSPS and
talkback contracts used here are unchanged.

The vendored artifact comes from the [official Ubiquiti CDN](https://apidoc-cdn.ui.com/protect/v7.3.70/integration.json),
retrieved 28 October 2026. Its SHA-256 is
`331993bfead2c2ccf9b85e1b857392ad4c0149144073aadef4f22ea8d7566891`.
The vendored JSON is normalized to the repository's two-space indentation; its
SHA-256 is `e52486c5df15b20bb519b876858187e228212549f1b8741275c0d3198822e68b`.
The artifact's `info.version` is `0.0.0`; 7.3.70 identifies the Protect version
in the source URL. The documentation download and CDN contract differ only in
their `servers` metadata. Schema generation retains all three hardware-proven
optional overrides (`ringSettings.ringtoneId`, `camera.lcdMessage` and
`nvrArmMode.armProfileId`), which the new spec still marks required. It now fails
if an override is unused or no longer relaxes a required field.

The client uses `X-API-KEY` under `/proxy/protect/integration/v1`. Device and event
subscriptions use the documented local WebSocket endpoints; no private Protect
API fallback is used. See the official
[device subscription](https://developer.ui.com/protect/v7.3.70/get-v1subscribedevices),
[event subscription](https://developer.ui.com/protect/v7.3.70/get-v1subscribeevents),
[RTSPS GET](https://developer.ui.com/protect/v7.3.70/get-v1camerasidrtsps-stream)
and [talkback session](https://developer.ui.com/protect/v7.3.70/post-v1camerasidtalkback-session)
contracts.

Scalar `update` frames retain the delta-merge path. `add`, `remove` and bulk-ID
frames request the existing coalesced discovery. Removal still requires a
successful inventory and a later discovery after the confirmation window;
the event payload alone cannot remove an accessory. Unknown operations are
ignored. The diagnostic RTSPS GET accepts null qualities for streams that have
not been created and never creates them itself.
Snapshots use the runtime's native request: live 7.3.70 cameras returned HTTP 400
when the diagnostic forced full HD despite a working native snapshot endpoint.

Chimes retain the last audible volume across a muted device update or discovery
instead of returning to full volume. Accessory names are bounded to HAP's 64
UTF-16-code-unit limit without splitting surrogate pairs; package names reserve
space for their distinguishing suffix. UUIDs, serial numbers, service subtypes
and existing short names are unchanged.

Read-only validation confirmed Protect 7.3.70 with five cameras and one chime.
The redacted fixtures retain their original 7.2.105 provenance; newer live
validation does not turn historical captures into 7.3.70 fixtures.

## Verification gates and remaining scope

Lint includes formatting, source/test type checking and zero allowed warnings.
Vitest coverage floors come from the clean-main baseline: 96.42% statements,
91.68% branches, 92.67% functions and 96.66% lines. CI uploads LCOV to Codecov;
its project status permits no drop, and patch coverage targets 100%. A version
guard checks both lockfile root versions against the manifest before release.

Viewer discovery in the custom UI and a smart-detection selection UI are
additional features, rather than deprecated-API fixes. Failed ffmpeg probes stay
cached until a restart, consistent with the existing fixed-binary assumption.
The camera code infers doorbells from `hasSpeaker`; Ubiquiti documents that flag
as talkback capability and also sells non-doorbell cameras with speakers.
Reliable classification needs a separate compatibility change; this patch does
not guess model-name rules that could remove existing services or change pairing
identity.
