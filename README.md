# Homebridge UniFi Protect

<!-- BADGES:START -->
[![npm](https://img.shields.io/npm/v/homebridge-unifi-protect-api/latest?label=latest)](https://www.npmjs.com/package/homebridge-unifi-protect-api)
[![GitHub release](https://img.shields.io/github/v/release/tinkerologie/homebridge-unifi-protect-api.svg)](https://github.com/tinkerologie/homebridge-unifi-protect-api/releases)
[![npm](https://img.shields.io/npm/dt/homebridge-unifi-protect-api)](https://www.npmjs.com/package/homebridge-unifi-protect-api)
[![License](https://img.shields.io/github/license/tinkerologie/homebridge-unifi-protect-api)](./LICENSE)
<!-- BADGES:END -->

Use this plugin to show UniFi Protect cameras in Apple Home. The plugin uses the official Ubiquiti Integration API.

## Features

- Live video and snapshots
- HomeKit Secure Video with pre-motion recording
- Motion, smart detection, smoke, carbon monoxide, and doorbell sensors
- Control of the camera status LED
- Live view and snapshots for the package camera
- Optional camera audio and two-way talkback
- Protect floodlights as a dimmable light with a motion sensor
- Chime volume control as a HomeKit light

## Requirements

- Homebridge 2
- Node.js 22.12 or later, 24, or 26
- UniFi Protect with the Integration API enabled
- ffmpeg

Live API checks passed with UniFi Protect 7.3.74. The redacted test fixtures
come from Protect 7.2.105. The generated schemas use the official 7.4.102 OpenAPI contract.
For more than one camera, use hardware video encoding.
For Intel GPUs on Linux, refer to [Docker GPU setup](docs/docker-intel-gpu.md).

## Compatibility

The [November 2026 compatibility audit](docs/compatibility-audit-2026-11.md) covers
Homebridge 2.5, Node 26, the Protect 7.4.102 API contract, deprecated APIs and
TypeScript 7. It updates the [October 2026 audit](docs/compatibility-audit-2026-10.md).
The plugin keeps TypeScript 6 because ESLint uses the TypeScript 6 compiler API.
Homebridge runs the compiled JavaScript.

## Installation

1. In the Homebridge UI, search for **Homebridge UniFi Protect**.
2. Install the plugin.
3. In UniFi Site Manager, go to **Integrations** and create an API key.
4. In the plugin settings, enter the console address and the API key.
5. Select **Test Connection**.
6. Save the settings.
7. Restart Homebridge (or the child bridge of the plugin).

## Configuration

Use **Defaults** for shared settings. Use **Devices** for the options of one camera.
The device list shows after a successful connection test.

The plugin keeps the console certificate after the first connection. If the certificate changes,
the plugin does not connect until you trust the new certificate.

## HomeKit Secure Video

HKSV is disabled by default. Enable it for each camera, or enable it in the shared default.
A camera setting overrides the shared default. HKSV requires a supported iCloud+ plan
and an Apple home hub (HomePod or Apple TV). To record from more than one camera,
use hardware video encoding.

## Troubleshooting

- **Connection or certificate error:** Make sure that the console address and the API key are correct.
  Trust a changed certificate only if you know why it changed.
- **Camera does not respond:** Make sure that ffmpeg is installed. Then restart Homebridge (or the child bridge of the plugin).
- **High CPU usage:** Enable hardware video encoding, or decrease the number of live views at the same time.
- **HKSV clips are missing:** Make sure that HKSV is enabled for the camera.
  Make sure that your Apple home hub is configured and that your iCloud+ plan supports HKSV.
- **The device list is empty:** Select **Test Connection** first.

## Known limitations

At this time, the official Integration API does not supply recording-mode control, privacy zones,
or event thumbnails.

## Support

[Report a problem or request a feature](https://github.com/tinkerologie/homebridge-unifi-protect-api/issues).

## License

[Apache 2.0](LICENSE)
