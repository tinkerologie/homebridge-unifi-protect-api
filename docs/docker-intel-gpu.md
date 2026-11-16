# Intel GPU encoding in Docker

This guide covers the official `homebridge/homebridge` image on a Linux host
with an Intel GPU. The Ubuntu 24.04-based image was tested with Intel UHD 630
graphics. Other GPUs and container distributions may need different drivers.

The commands below assume the Compose service and container are both named
`homebridge`. Use your existing names if they differ.

## Give the container access to the GPU

On the Docker host, check for the render device:

```sh
ls -l /dev/dri/renderD128
```

If the device is missing, check the host's GPU driver before changing Docker.
Add this mapping to your existing Homebridge service in the Compose file:

```yaml
services:
  homebridge:
    devices:
      - /dev/dri/renderD128:/dev/dri/renderD128
```

Keep the service's existing image, environment, network settings, and data-volume
mount. If your Intel render device has a different host path, change the left side
of the mapping. The plugin expects `/dev/dri/renderD128` inside the container.

If Homebridge runs as a non-root user, that user also needs access to the device.
Find its group ID with `stat -c '%g' /dev/dri/renderD128` on the host, using your
actual host render-device path if it differs, and add that
numeric ID to the service's `group_add` list. Use the group ID from your host;
it varies between systems.

## Install FFmpeg and the Intel driver

The container needs an FFmpeg build with Intel hardware support and a compatible
VAAPI driver. On the Ubuntu-based official image, use `ffmpeg`,
`intel-media-va-driver-non-free`, and `vainfo` from Ubuntu's repositories.

The full-feature Intel driver supports bitrate-controlled encoding on the tested
GPU. The minimal `intel-media-va-driver` package accepted a bitrate-free trial but
rejected live encoding with a target bitrate. In the package name, “non-free”
refers to licensing; it does not require a paid service. Intel documents the
[two driver builds](https://github.com/intel/media-driver#media-driver-build-types).

To retain the installation after container replacement, append the following to
`/homebridge/startup.sh` in your existing persistent Homebridge volume. Keep any
commands already in that file. The official image runs this hook as root on each
container start; see its [startup script documentation](https://github.com/homebridge/docker-homebridge#-custom-startup-script).

```sh
if ! dpkg-query -W -f='${Status}\n' ffmpeg intel-media-va-driver-non-free vainfo 2>/dev/null | awk '
    /install ok installed/ { installed++ }
    END { exit installed == 3 ? 0 : 1 }
'; then
    apt-get update &&
        DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
            ffmpeg intel-media-va-driver-non-free vainfo
fi
```

Recreate the service from the directory containing your Compose file:

```sh
docker compose up -d --force-recreate homebridge
```

Homebridge will be unavailable while the container restarts. The first package
installation can take a few minutes and needs access to Ubuntu's repositories.
Check `docker logs homebridge` for installation errors if startup does not finish.

## Check encoding and restart the plugin

Check that the driver can open the device:

```sh
docker exec homebridge vainfo --display drm --device /dev/dri/renderD128
```

The output should identify the Intel driver and list H.264 encoding support.
Then test encoding with a target bitrate:

```sh
docker exec homebridge /usr/bin/ffmpeg -hide_banner \
    -f lavfi -i nullsrc=s=1280x720:r=30:d=0.1 \
    -vaapi_device /dev/dri/renderD128 -vf format=nv12,hwupload \
    -c:v h264_vaapi -b:v 600k -f null -
```

This command uses generated frames and should finish with exit code 0. If it
fails, resolve the reported device, permission, or encoder error before expecting
the plugin to select hardware encoding. An error mentioning
`supported modes: CQP` means the driver cannot provide the requested bitrate
control; check that the full-feature driver is installed.

Set the plugin's **ffmpeg path** to `/usr/bin/ffmpeg`, save, and restart Homebridge
or the plugin's child bridge. The startup log should report `hardware encoding
(h264_qsv)` or `hardware encoding (h264_vaapi)`. A `software encoding (libx264)`
message means no hardware candidate passed the probe; check the device mapping,
permissions, driver installation, and FFmpeg path. The plugin tries QSV, then
VAAPI, and keeps software encoding as a fallback.

Finally, open a camera in Apple Home and check that video continues playing.
The synthetic test confirms encoder availability; it does not test the camera
connection or HomeKit playback. Existing camera pairings can be retained.
