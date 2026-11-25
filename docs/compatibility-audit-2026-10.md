# Homebridge and UniFi Protect compatibility audit

> Superseded in part by the [November 2026 audit](compatibility-audit-2026-11.md)
> (Homebridge 2.5, Node 26, Protect 7.4.102).

Audit date: 28 October 2026. This plugin is for Homebridge 2 on Node.js 22 and
24. The plugin keeps the supported TypeScript 6 toolchain. In an isolated installation,
TypeScript 7.0.2 typechecks the source and tests without errors. But a
direct replacement of the dependency would break the compiler API that ESLint uses.

## Homebridge development practices

The audit checked the [Homebridge developer guidance](https://developers.homebridge.io/),
[official plugin template](https://github.com/homebridge/homebridge-plugin-template),
[Homebridge 2 migration guide](https://github.com/homebridge/homebridge/wiki/Updating-To-Homebridge-v2.0),
and [plugin verification requirements](https://github.com/homebridge/plugins).

The plugin uses public imports from `homebridge`, an ESM entry point, dynamic
platform registration, and stable UUIDs from the device data. It restores cached
accessories through `configureAccessory`. Discovery starts after
`didFinishLaunching`. Shutdown stops event subscriptions, retry timers, trackers,
streaming sessions and recording encoders. Characteristics use `onSet` and
`HapStatusError`. In accessory builders, `C` means `api.hap.Characteristic`.
TLS trust and authentication apply only to the configured console.

The audit examined the resolved TypeScript call signatures. It found no calls with the tag
`@deprecated` in `src`. The audit did not find the removed Homebridge 2 APIs or direct private
Homebridge/HAP imports. The plugin uses the locked Homebridge 2.4.0 / HAP 2.2.2
APIs for camera controllers, streaming, recording and programmable switch
events. These APIs have support. These results apply to the code of this plugin, not to
all transitive dependencies.

`supports-hap` declares the implemented transport. Technical compliance alone
does not give official Homebridge verification. Verification also has publication,
maintenance and distinct-functionality criteria. The verification page has older
Node examples. Read them together with the current
[Node support policy](https://github.com/homebridge/homebridge/wiki/How-To-Update-Node.js).
Homebridge 2.4.0 also accepts Node 26. This patch keeps the current 22/24
support contract and CI matrix.

## TypeScript 7 compatibility

[Microsoft released TypeScript 7.0 on 8 July 2026](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/).
Version 7.0.2 is stable. Homebridge runs the emitted JavaScript. It does not
load the compiler at runtime. For this repository, an isolated `typescript@7.0.2` installation passed
`tsc --noEmit -p tsconfig.test.json`.

[typescript-eslint supports TypeScript `>=4.8.4 <6.1.0`](https://typescript-eslint.io/users/dependency-versions/).
TypeScript 7.0 does not supply the programmatic compiler API that this tooling uses.
Microsoft documents a dual-compiler alias setup. But this patch keeps
TypeScript 6.0.3. The official Homebridge template also uses TypeScript 6.0.3. The
dual-compiler setup would need separate verification of the clean install, build, lint and tests.
A simple `typescript: ^7` bump is not satisfactory.

## UniFi Protect Integration API

The current [Protect documentation](https://developer.ui.com/protect/) is for
v7.3.70. The audit downloaded the official [7.3.70 OpenAPI document](https://developer.ui.com/protect/v7.3.70/openapi.json).
It compared the document directly with the vendored 7.2.105 contract. The
paths and operations are identical. The new document contains no
`deprecated: true` annotations. It adds four fob/link-station schemas and changes
related device models. The camera, light, sensor, chime, snapshot, RTSPS and
talkback contracts that the plugin uses did not change.

The vendored artifact comes from the [official Ubiquiti CDN](https://apidoc-cdn.ui.com/protect/v7.3.70/integration.json).
The audit downloaded it on 28 October 2026. Its SHA-256 is
`331993bfead2c2ccf9b85e1b857392ad4c0149144073aadef4f22ea8d7566891`.
The vendored JSON uses the two-space indentation of the repository. Its
SHA-256 is `e52486c5df15b20bb519b876858187e228212549f1b8741275c0d3198822e68b`.
The `info.version` of the artifact is `0.0.0`. The source URL contains 7.3.70, which is the Protect version.
The only difference between the documentation download and the CDN contract is
their `servers` metadata. Schema generation keeps all three optional overrides that hardware tests
proved (`ringSettings.ringtoneId`, `camera.lcdMessage` and
`nvrArmMode.armProfileId`). The new spec still marks these fields required. Schema generation now fails
if an override is not used, or if it does not make a required field optional.

The client uses `X-API-KEY` under `/proxy/protect/integration/v1`. Device and event
subscriptions use the documented local WebSocket endpoints. The plugin does not use a private Protect
API as a fallback. Refer to the official
[device subscription](https://developer.ui.com/protect/v7.3.70/get-v1subscribedevices),
[event subscription](https://developer.ui.com/protect/v7.3.70/get-v1subscribeevents),
[RTSPS GET](https://developer.ui.com/protect/v7.3.70/get-v1camerasidrtsps-stream)
and [talkback session](https://developer.ui.com/protect/v7.3.70/post-v1camerasidtalkback-session)
contracts.

Scalar `update` frames keep the delta-merge path. `add`, `remove` and bulk-ID
frames request the current coalesced discovery. To remove an accessory, the plugin still needs a
successful inventory and a later discovery after the confirmation window.
The event payload alone cannot remove an accessory. The plugin ignores unknown operations.
The diagnostic RTSPS GET accepts null qualities for streams that do not exist yet.
It never creates these streams.
Snapshots use the native request of the runtime. When the diagnostic forced full HD, live 7.3.70 cameras returned HTTP 400.
The native snapshot endpoint operated correctly on these cameras.

After a muted device update or discovery, chimes keep the last audible volume.
They do not go back to full volume. The plugin limits accessory names to the HAP limit of 64
UTF-16 code units, and it does not split surrogate pairs. Package names keep
space for their distinguishing suffix. UUIDs, serial numbers, service subtypes
and current short names did not change.

Read-only validation confirmed Protect 7.3.70 with five cameras and one chime.
The redacted fixtures keep their original 7.2.105 source. A newer live
validation does not change historical captures into 7.3.70 fixtures.

## Verification gates and remaining scope

Lint includes formatting, source/test type checking and zero permitted warnings.
The Vitest coverage floors come from the clean-main baseline: 96.42% statements,
91.68% branches, 92.67% functions and 96.66% lines. CI sends LCOV to Codecov.
The Codecov project status permits no decrease. The patch coverage target is 100%. Before a release, a version
guard compares the two lockfile root versions with the manifest.

Viewer discovery in the custom UI and a UI to select smart detections are
new features. They are not fixes for deprecated APIs. The plugin keeps failed ffmpeg probes in its
cache until a restart. This agrees with the current assumption that the binary does not change.
The camera code uses `hasSpeaker` to identify doorbells. Ubiquiti documents that flag
as talkback capability. Ubiquiti also sells cameras with speakers that are not doorbells.
A reliable classification needs a separate compatibility change. This patch does
not guess model-name rules, because such rules could remove current services or change the pairing
identity.
