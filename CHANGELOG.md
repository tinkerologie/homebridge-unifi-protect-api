# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.5] - 2026-11-25

### Added

- Support Node.js 26. The plugin accepts Node.js `^22.12.0 || ^24 || ^26`, the same range as Homebridge 2.5. CI and the release workflow test on Node.js 22, 24 and 26 (#64).
- Use the Protect 7.4.102 Integration API contract (#65):
  - The generated schemas accept the new `sensor.isMountedIncorrectly` and `nvr.featureFlags` fields.
  - The generated schemas also accept payloads from 7.3.x consoles, which do not send these fields.
  - The schema generator supports the `minProperties` keyword.
- Show the documentation for Intel GPU access in the official Homebridge Docker image. The document tells you how to install FFmpeg and the drivers, and how to examine the encoder.

### Fixed

- Examine each hardware encoder at 720p with a target bitrate before the plugin selects it. If a driver accepts only encoding without a bitrate, the plugin uses the next encoder or software encoding. Live view does not fail.
- Motion, smart-detection, smoke and carbon monoxide sensors are clear when Homebridge starts. Before, a sensor that was active at shutdown stayed "detected" until the next event (#66).
- Snapshots and HomeKit writes do not wait behind slow requests (#67):
  - A snapshot request has a 5-second limit and one retry.
  - A write has a 7-second limit. A failed write shows an error in the Home app before HomeKit stops the request.
  - Two snapshot requests for the same camera share one request to the console.
  - If a snapshot fails, the plugin sends the last snapshot when it is less than 60 seconds old.
  - A request that waits for a retry does not keep its position in the queue.
  - The plugin does not retry a talkback or stream creation request after a timeout, because the console possibly created the session already.
- If a different talkback session is open on the doorbell, the plugin writes one log message: "talkback busy". The plugin does not retry (#65).
- When you drag the chime volume slider from off, the chime goes to the volume that you set. Before, the volume sometimes went to 100% (#68).
- If the console refuses a WebSocket subscription, the plugin closes the connection immediately and connects again without delay. After an API key error, the plugin does not connect again (#69).
- If FFmpeg stops unexpectedly during live view, the plugin tells HomeKit to stop the stream. Before, the Home app showed a frozen image (#70).
- The plugin writes `config.json` to a temporary file and then renames it. A crash during the write does not damage `config.json` (#71).

### Security

- The settings server examines the console address before it sends a request. It refuses an address with a path, query, fragment, credentials or spaces (#72).
- The settings server refuses an API key with control characters. Error messages do not show the API key (#72).
- The settings server gives a clear error when the console sends a response with an incorrect shape. Before, it gave an unclear error (#72).

### Changed

- `npm run lint` fails on all deprecated APIs. It uses the `no-deprecated` rule with type information from typescript-eslint. The audit found no deprecated API calls (#64).
- Update the dependencies: Homebridge 2.5.0 (HAP-NodeJS 2.3.0), `@homebridge/plugin-ui-utils` 2.3.0, `ws` 8.23.0 and the development tools. `@types/node` stays on 22, the lowest supported Node.js version. TypeScript stays on 6.0.3, because typescript-eslint does not support TypeScript 7.
- Add the [November 2026 compatibility audit](docs/compatibility-audit-2026-11.md).
- All documentation follows ASD-STE100 Simplified Technical English.

## [1.0.4] - 2026-10-28

### Fixed

- When a chime is muted, a normal device update or discovery no longer sets it to full volume. Unmute now restores the previous audible level.
- Accessory names are limited to the HomeKit limit of 64 characters. The limit does not split surrogate pairs, and it keeps the package-camera suffix and the current accessory identities.
- Declare the missing `nodemon` development dependency. The current rebuild/restart watch workflow does not change.
- Device-subscription add, remove and bulk-ID frames now request a coalesced inventory refresh. Before, the plugin processed them as scalar updates. The current delayed-removal and shutdown safeguards keep the cached accessories.
- The read-only Protect diagnostic uses the documented RTSPS GET response, including null URLs for streams that do not exist yet. It requests native snapshots and does not force unsupported full HD. It also uses process environment variables when there is no `.env` file.

### Security

- Development tooling only (not in the published package): an npm `override` moves `katex` to 0.18 (GHSA-238p-pmpm-9mq7, low). `katex` gets into the lint setup through `@antfu/eslint-config` → `@eslint/markdown` → `micromark-extension-math`. The latest release of `micromark-extension-math` permits only `^0.16`. `npm audit` now reports no vulnerabilities.

### Changed

- Update the vendored official Protect contract and the generated schemas to 7.3.70. The historical hardware fixtures and the guarded optional-field overrides stay.
- Enforce zero-warning lint and the measured baseline coverage floors. CI sends LCOV to Codecov with project and patch statuses.
- Before CI/release packaging, make sure that the manifest and lockfile versions agree. Declare the HAP transport in the plugin metadata. Prepare version 1.0.4.
- Document the October 2026 Homebridge/Protect audit, the TypeScript 7 compiler verification and the TypeScript 6 ESLint limitation. Correct the development prerequisites and the unavailable Homebridge UI schema-check command.
- The shared tinkerologie PR labeler gives pull requests path labels and a maximum of one type label, `bug` or `enhancement`.
- Dependabot pull requests merge automatically if their largest update is a patch or minor version. The merge occurs when the checks and commit statuses on the head commit are complete and none failed. A pending Codecov check does not stop the merge, but a Codecov failure does. Major updates, and pull requests with open review threads, stay for review.
- Releases now use two jobs. After the lint and tests of the Test job, a read-only Package job installs dependencies, builds and packs the tarball.
- A separate Publish job publishes that tarball with lifecycle scripts disabled, and creates the GitHub release. Only this job has write access and an npm OIDC identity. Thus, dependency install scripts and the build and test code of the project never run with publishing credentials.
- The Publish job installs nothing. It does not upgrade npm. It makes sure that the bundled npm of Node 24 supports trusted publishing.
- The Publish job examines npm again before it publishes. A run can start again after a partial failure. If npm already has the exact tarball of that run, the job does not publish. It still creates the release. Only one publish runs at a time. Thus, if a parallel run finds a different package on npm, it fails and does not publish twice. The tarball is kept for 7 days for these runs.
- Release workflows are hardened: least-privilege job permissions, no expressions in shell scripts, no persisted checkout credentials, and no dependency caches. Scheduled workflows use Australia/Brisbane time. LICENSE now contains the full Apache License 2.0 text.
- After the release hardening, the workflow layout is tidied (no behaviour change). In `release.yml`, the `permissions:` blocks are at the top of their workflow or job again.
- The Tinkerologie-Bot governance report is updated to v1.4.3. An older run can no longer post a stale report after a newer run passed. The workflow formatting is tidied.
- The repository now uses the standard tinkerologie layout (STANDARDS.md in tinkerologie/.github). This includes:
  - Workflows renamed to the standard set (CI, Validate, Release, PR Governance, ...)
  - Each action pinned to a commit SHA
  - Shared Dependabot
  - `.editorconfig`, `.gitattributes` and `CODEOWNERS` files
  - Labels and community files for the full organization
- The Tinkerologie-Bot comment is now a clear "Pull request checklist". Each problem is a numbered heading with plain-English guidance, and its items are listed below the heading. The bot processes the report updates for a pull request one at a time. Thus, an older run can never overwrite a newer one.
- Contribution governance:
  - If automation can find the type of an issue that has no `bug` or `enhancement` label, it adds the label. CodeRabbit can then plan the issue. Automation does not process issues with the labels `question`, `duplicate`, `invalid`, `wontfix`, or `no-type`.
  - Automation adds a label to pull requests that conflict with the default branch, and adds a comment to tell their authors.
  - Automation adds a label to issues and pull requests that have no activity for 14 days, and closes them 30 days later.
  - When a bot such as CodeRabbit edits the description of a human-authored, non-draft PR, PR governance now validates the PR again. Before, it did not do the check and reported a pass.
  - Only maintainers with write access can use `None` instead of a link to an issue.
  - A link to an issue that does not exist now fails the check.
- When a pull request fails PR governance, Tinkerologie-Bot now adds one comment. The comment shows all the problems to correct. The bot updates the comment after the problems are corrected. PR governance runs from the workflow of the default branch (`pull_request_target`). Thus, a pull request cannot change its own check.
- The issue templates now pass the ESLint YAML rules of the repository. Before, these rules made `npm run lint` fail on `main`.

## [1.0.3] - 2026-08-31

### Changed

- Update repository URLs and documentation references to tinkerologie organization.
- The vendored Protect API contract now comes from the **v7.2.105** OpenAPI 3.1 spec
  (was 7.1.87). The runtime API surface did not change, so this is only a schema refresh. It
  removes the `/v1/cameras … did not match the expected schema` warning on consoles
  that already run 7.2.105.
- The test fixtures are captured again from a live 7.2.105 console and redacted (device GUIDs are
  now also hashed). The captured cameras show the current hardware settings. For example, Sidegate
  enabled only person detection, so the tests assert the sensors that the plugin actually built.
- The schema generator (`scripts/gen-zod.mjs`) now supports the `pattern` keyword (used by
  `posTransactionRequest.currency` in 7.2.105). It changes the keyword to a zod `.regex()`.
- The schema generator applies its `OPTIONAL_OVERRIDES` only at top-level components. Thus, a field
  that is required but that real hardware omits (`camera.lcdMessage`) stays optional, and the override
  does not apply to nested objects.
- `scripts/live-check.mjs`, `capture-events.mjs` and the new `capture-fixtures.mjs` now read
  `PROTECT_CERT_SHA256` from `.env` correctly. The key name contains digits, and the previous
  `^([A-Z_]+)=` pattern ignored it without a message.

### Added
- `scripts/capture-fixtures.mjs` — captures the device fixtures again from a live
  console in one step. Thus, after a Protect firmware update, you can refresh `test/fixtures`.
  `capture-events.mjs` already refreshes the event fixtures in the same way.

## [1.0.2] - 2026-08-30

### Fixed
- Motion now triggers on all cameras, not only on the doorbell. Protect 7.2.105 sends classic
  `motion` events only for doorbells. All other cameras send motion only as smart-detect
  events. The plugin sent these events only to the Person/Vehicle/Animal sensors for each type.
  Thus, the Motion sensor of the camera never triggered. HomeKit notifications, automations and HKSV
  use that sensor.
- A smart-detect event now operates the Motion sensor of the camera and its sensors for each type.
  The live event stream verified the problem: it sent `smartDetectZone` frames for Driveway, Garage
  and Backyard, but the Motion sensors stayed off. A smart-detect event with detection types
  that the plugin cannot read still triggers motion. Audio detections continue to operate only their
  smoke/CO sensors.

## [1.0.1] - 2026-08-06

### Security
- Certificate pinning now verifies the console certificate explicitly during the TLS
  handshake. Before, it replaced `checkServerIdentity` with a no-op. The presented leaf
  must be byte-for-byte identical to the trusted certificate. Thus, two
  independent layers enforce the identity: the pinned `ca` chain check, then the explicit compare.
  This resolves the static-analysis findings that identified the override as a disabled validation.
- The behaviour with real hardware did not change. The plugin still accepts the hostname mismatch of a UniFi console.
  For an incorrect certificate, the plugin now shows the
  `ERR_TLS_CERT_PIN_MISMATCH` code. Thus, the UI still reports a certificate error.
- The developer diagnostic scripts (`live-check`, `capture-events`) no longer trust a
  console certificate at the first connection before they send the API key. They require an
  out-of-band `PROTECT_CERT_SHA256` fingerprint. If no fingerprint is configured, they show the
  presented fingerprint, so that you can verify and set it. They also pin each request to the read
  certificate, and they send SNI only for DNS hostnames.

## [1.0.0] - 2026-08-06

### Changed

- Update repository URLs and documentation references to tinkerologie organization.
- TypeScript is pinned to the 6.x line (`^6.0.3`). Homebridge 2.2.1 also builds with this line.
  The npm `latest` tag is now TypeScript 7. Its native compiler is too new for the
  assumption that Homebridge supports it. The caret prevents version 7.

### Added
- Protect floodlights show in HomeKit as a Lightbulb with brightness and a motion
  sensor. On/off sets the force-enable override of the console. Thus, when you change the light in
  HomeKit, its configured motion or schedule mode does not change. Brightness sets one of the
  six LED levels of the hardware.
- The light and its PIR update in real time from the device event stream. A change in the
  Protect app shows in HomeKit.
- Chimes show in HomeKit as a Lightbulb. Its brightness controls the ring volume
  (0-100). Off silences the chime. The volume applies to all doorbells that are paired
  to the chime, and each ring keeps its tone and repeat count. The volume updates in real time
  from the device event stream.
- Motion sensors for all cameras. The live event stream operates them, not polling.
  `GET /v1/events` does not exist in the Integration API. Thus, a query can never correct
  a lost end-frame. Each active event has a failsafe timer that clears it.
- Smart-detection sensors for each camera, one for each detection type that is enabled in Protect: person,
  vehicle, animal and package. A supported type that is off has no
  sensor. If you set a type to off later, the plugin removes only that sensor.
- Smoke and carbon-monoxide sensors for cameras with audio detection enabled. The plugin
  creates them from the `smartAudioDetect` alarms of Protect.
- A Doorbell service on cameras with a speaker. A real `ring` event triggers it.
- A status-LED switch on cameras that have a status LED. The switch shows `ledSettings.isEnabled` and
  writes changes back to Protect. A change to the LED in the Protect app updates HomeKit.
  If a write fails, the switch goes back to its previous state. It does not show a state that the
  console rejected.
- Sensor state uses a reference count. Thus, overlapping events cannot set a sensor to off
  too early. The console sends end-frames again, up to three times with an identical
  value. The plugin ignores the duplicates.
- The plugin selects the live streaming video quality automatically from the HomeKit resolution
  request: 640×360 and below uses the low substream, 1280×720 uses medium, and all
  larger resolutions use high. A quality override for each camera can pin a substream.
- At startup, live view transcoding now probes ffmpeg. It uses Intel Quick Sync (QSV) or
  VAAPI hardware encoding before the bundled software encoder. All Protect streams are
  HEVC, and HomeKit accepts only H.264. On supported hosts, hardware encoding decreases the CPU cost by approximately 27×.
  The plugin logs the selected ffmpeg path and encoder. Thus, a silent fallback to
  software shows in the log.
- The plugin now keeps RTSPS stream URLs in a cache for 5 minutes, for each camera and quality. The first time
  a quality is requested, the plugin creates a stream on demand. Protect reports no URL for a
  quality until the plugin creates a stream in this way. This also prevents ffmpeg from
  receiving a stale, expired URL.
- Live view now operates from start to end. The HomeKit stream request selects the substream and gets the
  RTSPS URL. The plugin transcodes it to H.264 while the viewer watches. When the viewer closes
  the view, the plugin stops the transcode.
- Camera snapshots come directly from the console as JPEG. The plugin does not start ffmpeg for a
  snapshot. Snapshots stay in a cache for two seconds. Thus, the frequent thumbnail polling of the Home app
  gets to the console one time, not one time for each tile. For a failed snapshot, the plugin reports
  only the reason to HomeKit, never the request details.
- The limit on concurrent live views applies to the full host, not to each camera: six with
  hardware encoding, two with software. Thus, five cameras share one limit. Each camera does not
  get its own limit. The plugin refuses a request above the limit and logs the reason.
  This prevents an overload of the machine.
- The package lens shows in HomeKit as a separate camera, with the name "<camera> Package Camera".
  This applies to cameras whose payload reports the lens (`hasPackageCamera`), if the owner enabled
  it in the settings. The plugin bridges it like all other accessories. It is only a camera.
  The package motion sensor stays on the main accessory, so the current automations do not change.
  It advertises a range of 4:3 sizes and no audio. Its snapshots come from
  the package channel, so the tile shows the downward view, not the main lens.
  If you disable the setting, the next discovery removes the camera.
- The package lens transcode scales to the size that HomeKit requests. The plugin adds frames to get
  the frame rate that HomeKit negotiated. Thus, the plugin actually supplies all advertised sizes.
  That path decodes in software and scales before it sends the frame to
  the hardware encoder. On the reference host, scaling on the GPU fails. Software
  decoding of this lens costs almost nothing, because the console sends it at
  2 fps.
- You can now stream the package lens of the Doorbell like all other cameras. It has one stream,
  not a choice of substreams. The console sends it at 1600×1200/2 fps. All other lenses use
  16:9/30 fps. Thus, ffmpeg duplicates frames up to the rate that
  HomeKit negotiated. Without this, HomeKit can think that a real 2 fps feed is a stalled
  stream. This stream never has audio. The lens uses the same microphone as the main camera,
  and a second identical audio source has no value.
- Live view can include audio. The plugin sends audio as a separate stream with the video and transcodes it to
  Opus. HomeKit accepts Opus, and the hardware-capable ffmpeg can encode it. If a build has `libfdk_aac` but not `libopus`,
  the plugin uses AAC-ELD. Audio is **off by default
  and you must enable it for each camera**. In many locations, the law gives more restrictions for audio recording than for video.
  Also, an outdoor camera records people who walk past and who did not give consent. If ffmpeg has
  neither encoder, the plugin tells you one time and streams only video. It does not make a
  stream that HomeKit cannot play.
- Two-way talkback on cameras with a speaker. When you push the microphone button in the live view of the Home
  app, the camera plays your voice. Talkback is **off by default, and you must enable it for each
  camera**. The settings UI shows it only for hardware that reports a
  speaker. **Talkback starts only after a restart**. Homebridge already asks
  for this restart when you save the settings.
- Talkback is independent of the audio setting. When you enable talkback,
  the plugin does not send the microphone of the camera to HomeKit. When you enable audio, talkback stays disabled.
  The plugin sends nothing to the camera until you speak.
- All cameras now show in the Home app as cameras. Live view and snapshots connect
  to HomeKit. The plugin bridges cameras like all other accessories, so a child bridge still holds the full
  console under one pairing. The doorbell keeps the one Doorbell service that the event
  pipeline operates. Live view does not add a second Doorbell service.
- The settings UI now shows the two new per-camera controls. Thus, you do not have to edit `config.json`
  manually for them:
  - A live-view quality selector. Its labels show the real substream
    resolutions (auto, 2688×1512, 1280×720, 640×360).
  - An audio toggle. The UI shows it only for a camera that reports a microphone.
- The label of the audio toggle tells you that **audio starts only after a restart**.
  Homebridge already asks for this restart when you save the settings. When HomeKit publishes a camera,
  HomeKit gets the audio codecs of that camera. HAP cannot change them after that.
  When you disable audio, the change applies immediately to the next live view.
- New settings:
  - `maxStreams` sets the limit on concurrent live views for the full host (default six with
    hardware encoding, two with software).
  - `ffmpegPath` sets a specific ffmpeg binary.
  - Each camera has `quality` (`auto`, `high`, `medium`, `low`; `auto` by default) and
    `audio` (off by default).
- The settings UI now also shows the two host-wide settings: the maximum number of
  concurrent live views and the ffmpeg path. Thus, you do not have to edit `config.json` manually
  for any setting that this plugin supports. If you clear one of these fields, the plugin makes the
  decision. The plugin does not keep a blank value.
- The README tells you how to make hardware transcoding operate:
  - Give `/dev/dri` to the container.
  - Set the render-group permission.
  - Use the VA-API driver package that has the H.264 encode entrypoint.
  - The measured cost without hardware transcoding: 20 s of 2688×1512 costs 1.79 s
    of CPU with VAAPI and 49.1 s with libx264, approximately 27×.
- If a camera has audio enabled, and ffmpeg cannot encode a codec that HomeKit accepts,
  the plugin now tells you in the log at startup. The message gives the name of the binary. Before, the plugin
  streamed without audio and without a message.
- The plugin probes ffmpeg one time at startup, not for each camera. If the plugin finds no usable ffmpeg,
  it tells you and continues. Sensors, the LED switch and the doorbell continue to operate
  without live view. The full platform does not fail to load.
- When Homebridge shuts down, the plugin stops all running transcodes. Without this, a stranded ffmpeg
  keeps a 4 MP HEVC decode open until the host stops.
- The plugin now supervises the ffmpeg processes for live view. It starts them, tracks them, and stops them at
  teardown. Thus, a viewer that disconnects can never leave a transcode that runs without a limit.
  The plugin redacts the failure output of ffmpeg before it logs the output. On an error, ffmpeg shows the command line,
  and the command line contains the auth token of the RTSPS stream.
- New per-camera setting: `packageCamera`, off by default. The settings UI shows it only
  for a camera that has a package lens, as reported by the console. Its label tells you clearly that the
  console sends that lens at 2 fps. When you enable it, the plugin adds a second HomeKit accessory for one
  physical device. The label tells you about the two results before you enable the setting.
- HomeKit Secure Video recording, off by default for each camera. For each camera with recording
  enabled, the plugin runs one continuous ffmpeg: RTSPS in, fragmented MP4 out.
  This ffmpeg fills a 16-fragment prebuffer in memory. Thus, a clip starts *before* the motion that triggered it,
  not after.
- On the real console, recording used 7–9% of one core for each camera (VAAPI H.264 plus
  the native AAC encoder of ffmpeg). Recording uses the 1280×720 medium substream.
  This is approximately half a core for five cameras.
- A clip starts with only the pre-roll that HomeKit negotiated. The prebuffer *holds*
  16 fragments as headroom, because a fragment is longer when a keyframe arrives late.
  Before, the plugin sent all 16 fragments. This put approximately 64 seconds of video at the start of a clip,
  but the advertised `prebufferLength` was 4.
- A test on real hardware verified the problem: the controller accepted the oversized pre-roll and closed the stream in the same second,
  before the first live fragment. With the negotiated pre-roll, recording operates correctly.
- Recording advertises only one resolution, 1280×720. The advertisement and
  the encoder fallback read the same constant. Before, the two values were different. The advertised resolutions
  were limited to 720p. But if HomeKit did not send a configuration before the encoder started, the encoder used
  the 2688×1512 high substream. Thus, a camera recorded four times the pixels that it advertised.
  The recording path has no scale filter. Thus, an advertised size is correct only if a substream supplies exactly that size.
- The plugin logs motion when it triggers, with the name of the camera. Motion triggers all recordings.
  Before, motion got to HomeKit without a log message. If a person walked past a camera and no
  clip was made, the log did not show if motion triggered or if HomeKit ignored it.
  The clear event, and all sensors that are not motion sensors, stay on the debug channel.
- Recording never uses a live-view stream slot. The `maxStreams` limit protects
  interactive viewing, and a recording process is not an interactive viewer. But the two
  use the same GPU.
- Recording uses H.264 with AAC-LC. HomeKit Secure Video does not permit Opus. Live
  view uses Opus on this host. Thus, the two pipelines are different by design.
- The plugin advertises a doorbell push as a recording trigger, together with motion. **At this time, Apple
  HomeHubs are not known to use it:** hap-nodejs documents that HomeHubs never
  enable Doorbell triggers as of iOS 15-16. Hap-nodejs thinks that the gap is on the Apple side. The
  advertisement is correct and costs nothing. Thus, it will operate if Apple enables it.
  But today, only motion starts a clip.
- The settings UI now uses the injected Bootstrap 5 theme of Homebridge. It replaces the
  hand-rolled CSS. It has four tabs: Connection, Defaults, Devices, Help. A
  searchable device list is adjacent to a detail pane. It has real toggle switches, not 13 px
  checkboxes. Settings are in groups, not in one flat grid. Global
  and per-device settings are in different locations. Thus, it is always clear which setting you
  edit. Dark mode comes from the Homebridge theme, not from hardcoded colours.
- Each per-device setting shows if it is inherited or overridden. You can reset an overridden
  setting to the inherited value.
- Saves are debounced by one second. Thus, when you change some toggles quickly, the plugin writes
  `config.json` one time, not one time for each click. Only settings that really require a restart
  tell you so. Not every change shows the restart banner of Homebridge.
- The Defaults tab now contains the per-camera defaults that all devices inherit, together with the
  host-wide settings. These defaults are: the exposure of new devices, the live view quality, and the recording setting.
  The default/overridden badge on each device now refers to values that the
  UI can change. Before, it referred to values that you could change only in `config.json`.
- The Help tab documents:
  - What each setting does
  - Which settings need a restart
  - How the plugin selects hardware transcoding, and what to examine when it uses software
  - That recording does not use a live-view slot, but uses the same GPU as live view
- A new iCloud tier setting (50 GB / 200 GB / 2 TB+, default 200 GB) gives an
  advisory warning. The warning shows when more cameras have recording enabled than the tier permits. The tier permits five on
  200 GB, and one on 50 GB. The warning gives the tier and the two counts. It never blocks the setting.
  The plugin cannot see your subscription. A refused setting based on a guess is worse
  than a warning that you can ignore.

### Fixed
- The plugin now validates the video size and frame rate that a controller negotiates before they
  get to ffmpeg. HAP does not compare the selection of a controller with the resolutions that the
  accessory advertised. Thus, a malformed selection for 0 fps caused `-r 0`, which ffmpeg
  refuses. A very large size caused a scale filter that allocated memory before it
  failed. The plugin now clamps both values into the advertised range. It does not reject them. Thus, the
  viewer gets a slightly different picture, not no picture.
- The plugin no longer drops an ffmpeg process when the kill signal was not delivered. Before, the plugin always
  removed the process from the session map, so nothing could try again. The orphan process
  continued to run, kept a decode open, and kept its slot in the host-wide stream limit until the
  host stopped. Thus, the plugin eventually refused live views because of dead processes. A process that
  is not stopped by its kill signal now stays tracked until it actually stops.
- The package camera did not stream. HomeKit showed "No Response" for all live
  views, and the log showed no reason. The camera advertised one size,
  1600×1200 at 15 fps. HomeKit rejects this for two reasons: each advertised stream must
  supply a minimum of 24 fps, and 1600×1200 is not one of the 4:3 sizes that HomeKit accepts.
- Nothing in the stack validates this, so the refusal had no message. HomeKit did not request
  video, and no request got to the plugin. The camera now advertises a range of accepted 4:3
  sizes at 30 fps, and scales the picture to the size that HomeKit selects.
- If the plugin starts without a usable ffmpeg, it no longer unregisters a package camera that is already in HomeKit.
  Before, the plugin removed it immediately, not after the usual
  confirmation window. Thus, one restart without ffmpeg permanently
  removed the room, scenes and automations of the accessory. The plugin now keeps it without live view,
  the same as the main cameras.
- If you disable the setting, or if the lens really disappears, the plugin still removes the package camera immediately.
- The package camera reports its manufacturer, model and serial number to HomeKit.
  Before, its tile showed placeholder values. Its serial number is different from the serial number of the
  main camera, because the two are separate accessories for one physical device.
- Live view SSRCs are now positive signed 32-bit values. The previous range went up to
  0x100000000, and HomeKit and ffmpeg both reject that value. Thus, some streams did not
  load. This occurred intermittently, and the log showed no reason.
- The plugin now does a trial encode with each hardware encoder before it selects that encoder. If a
  candidate fails, the plugin tries the next candidate, not software. If `ffmpeg -encoders` shows an encoder,
  it only means that the build includes it. It does not mean that the container
  can open `/dev/dri`.
- On the reference console, `/usr/bin/ffmpeg` shows QSV and VAAPI. QSV cannot create its device,
  and VAAPI operates. Thus, the plugin now uses VAAPI there. If the plugin trusted the list,
  all live views would fail. If the plugin went to software after the first failure, a good GPU
  would not be used, and software encoding uses approximately 27× the CPU.
- A live view request during the Homebridge shutdown can no longer start an ffmpeg
  after the shutdown handler ran. Such a process was in no map, and nothing would
  ever have stopped it.
- A shutdown now stops all remaining live views, the event bus and the failsafe timers, even
  if the stop of one camera throws an error.
- If an ffmpeg stops after it starts but before the plugin tracks it, the plugin now reports a
  failed start to HomeKit. Before, the log showed "Live view started".
- If the plugin cannot reserve the local RTP port of a live view, the live view now fails.
  Before, HomeKit waited for a response that never came.
- Concurrent live views of the same camera and quality now share one request to the
  console. Before, each live view created its own RTSPS stream.
- If Homebridge shuts down while discovery reconciles accessories, discovery no longer restarts the WebSocket subscriptions.

- Service removal now requires a device payload that the plugin understands. When schema validation fails,
  the client returns the raw payload. Thus, one renamed firmware field could
  remove all smart-detect sensors, the doorbell and the LED switch from all
  cameras. A payload that the plugin cannot understand now removes nothing.
- During reconciliation, the plugin no longer removes services that other modules created as
  unrecognised services.
- The plugin writes `ConfiguredName` one time, when it creates the service. Thus, a name change in the Home app
  stays after later discovery cycles.
- The documented iCloud limits for HomeKit Secure Video were incorrect. Apple sets the limit by the number of cameras,
  not by storage: 50 GB supports one camera, 200 GB supports five, and 2 TB and above
  have no limit. Footage does not count against the iCloud storage quota. HKSV stays off
  by default, because the 50 GB tier permits only one camera.

### Security
- Before, the SRTP key of each talkback session could get into the log. On a failure, ffmpeg shows its full
  command line. It also shows the bad line of an SDP that it cannot parse.
  The plugin now redacts both outputs before it logs them.
- The plugin redacts the error output of ffmpeg one full token at a time. Thus, the plugin redacts a stream URL
  even when it arrives in two reads of the pipe, with the `rtsps://` scheme separate from the auth token.
  Before, the plugin redacted each read separately, and this cannot find a URL that
  is in two reads.
- When the plugin cannot get a stream URL, it reports a new error that contains only the message.
  Before, the plugin threw the error of the client again. This gave a request context to `util.inspect`. In the past, the API key
  of this codebase leaked through this path.
- The plugin now pins the console certificate. Before, TLS verification was disabled.
  At the first connection, the plugin reads the certificate, keeps it in `config.json`
  as `consoleCert` and logs its SHA-256 fingerprint. The plugin verifies all later REST requests and the two
  WebSocket subscriptions against this certificate.
- The plugin does not do the hostname check, because the console certificate is for the hostname
  of the console, but the plugin connects by IP. The plugin enforces the certificate identity. Thus, a different host on the LAN can no longer
  act as the console and capture the API key.
- If the certificate changes, the plugin does not connect. The log and the
  settings UI show the trusted and the presented fingerprints. They also tell you how to trust the new certificate
  deliberately. The plugin never trusts a certificate again without a message.

### Known limitations
- Recording audio uses the audio setting of the plugin, not the "recording
  audio" toggle of the Home app. The plugin never reads the `RecordingAudioActive` characteristic: hap-nodejs does
  not send its value to a recording delegate. To read it, the plugin needs the `CameraController`
  instance, which the plugin currently discards.
- This has two results. Hap-nodejs sets that
  characteristic to off by default. Thus, a camera with audio enabled records clips *with* sound, but
  the Home app shows recording audio as off. Also, a change in the Home app has
  no effect. Change the setting in the plugin settings.
- A doorbell push does not start a recording in practice, but the plugin advertises it as a
  trigger. Refer to the related entry above: hap-nodejs documents this as a gap on the Apple side.
- The prebuffer runs a continuous ffmpeg for each recording camera, because the Integration API
  has no push channel for video. Plugins that use the private livestream WebSocket of UniFi
  do not have that cost. But that channel requires a UniFi OS login with a username and password. This
  plugin deliberately does not use this login. It uses only an API key. The continuous-ffmpeg model
  is a direct and accepted result of that decision.

## [0.1.0] - 2026-07-31

Foundation release. This release discovers devices and validates the connection. Accessory services
come in a later release.

### Added
- Self-contained UniFi Protect Integration API client. It uses only an API key for authentication.
  It never requests or keeps a UniFi username or password.
- Zod schemas generated from the vendored UniFi Protect 7.1.87 OpenAPI 3.1 specification.
- Real-time device and event WebSocket subscriptions. They reconnect with exponential backoff,
  and do a full REST resync after each reconnect. No polling.
- Homebridge v2 dynamic platform with device discovery and accessory cache reconciliation.
  The plugin bridges all accessories, so a child bridge holds all devices under one pairing.
- Custom configuration UI with live device discovery, connection tests, and settings for each
  device. You do not have to edit `config.json` manually.
- Request throttling with rate-limit backoff. The client obeys `Retry-After`.
- `npm run live-check`, a manual smoke test against real hardware.

### Known limitations
- No recording-mode switch — `recordingSettings` is not in the Integration API.
- No privacy mode or privacy zone control.
- No event thumbnail download.
