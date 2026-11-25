# Intel GPU encoding in Docker

This guide is for the official `homebridge/homebridge` image on a Linux host
with an Intel GPU. We tested the image, which is based on Ubuntu 24.04, with Intel UHD 630
graphics. Other GPUs and container distributions can need different drivers.

In the commands that follow, the name of the Compose service and of the container is
`homebridge`. If your names are different, use your names.

## Give the container access to the GPU

On the Docker host, make sure that the render device exists:

```sh
ls -l /dev/dri/renderD128
```

If the device is missing, examine the GPU driver of the host before you change Docker.
In the Compose file, add this mapping to your Homebridge service:

```yaml
services:
  homebridge:
    devices:
      - /dev/dri/renderD128:/dev/dri/renderD128
```

Do not change the image, environment, network settings, or data-volume mount of the service.
If your Intel render device has a different path on the host, change the left side
of the mapping. Inside the container, the plugin uses `/dev/dri/renderD128`.

If Homebridge runs as a non-root user, that user must also have access to the device.
To give access, do these steps:

1. On the host, run `stat -c '%g' /dev/dri/renderD128` to get the group ID of the device.
   If the path of your render device on the host is different, use your path.
2. Add that numeric ID to the `group_add` list of the service.

Use the group ID from your host. The group ID is different on different systems.

## Install FFmpeg and the Intel driver

The container must have an FFmpeg build with Intel hardware support and a compatible
VAAPI driver. On the official image, which is based on Ubuntu, use `ffmpeg`,
`intel-media-va-driver-non-free`, and `vainfo` from the Ubuntu repositories.

On the tested GPU, the full-feature Intel driver supports encoding with bitrate control.
The minimal `intel-media-va-driver` package accepted a trial without a bitrate. But it
rejected live encoding with a target bitrate. In the package name, “non-free”
refers to the license. It does not require a paid service. Intel documents the
[two driver builds](https://github.com/intel/media-driver#media-driver-build-types).

To keep the installation when you replace the container, add the text that follows to the end of
`/homebridge/startup.sh` in your persistent Homebridge volume. Do not remove the
commands that are already in that file. The official image runs this hook as root each time
the container starts. Refer to its [startup script documentation](https://github.com/homebridge/docker-homebridge#-custom-startup-script).

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

In the directory that contains your Compose file, create the service again:

```sh
docker compose up -d --force-recreate homebridge
```

Homebridge is not available while the container restarts. The first package
installation can take some minutes. It must have access to the Ubuntu repositories.
If the startup does not finish, look for installation errors in `docker logs homebridge`.

## Check encoding and restart the plugin

Make sure that the driver can open the device:

```sh
docker exec homebridge vainfo --display drm --device /dev/dri/renderD128
```

The output shows the Intel driver and H.264 encoding support.
Then do a test of the encoding with a target bitrate:

```sh
docker exec homebridge /usr/bin/ffmpeg -hide_banner \
    -f lavfi -i nullsrc=s=1280x720:r=30:d=0.1 \
    -vaapi_device /dev/dri/renderD128 -vf format=nv12,hwupload \
    -c:v h264_vaapi -b:v 600k -f null -
```

This command uses generated frames. It must finish with exit code 0. If the command
fails, the plugin cannot select hardware encoding. Correct the device, permission, or encoder
error that the command shows. An error that contains
`supported modes: CQP` means that the driver cannot supply the requested bitrate
control. In this case, make sure that the full-feature driver is installed.

Then do these steps:

1. In the plugin settings, set **ffmpeg path** to `/usr/bin/ffmpeg`.
2. Save the settings.
3. Restart Homebridge or the child bridge of the plugin.

The startup log shows `hardware encoding
(h264_qsv)` or `hardware encoding (h264_vaapi)`. The message `software encoding (libx264)`
means that no hardware encoder passed the probe. In this case, examine the device mapping,
permissions, driver installation, and FFmpeg path. The plugin tries QSV first, then
VAAPI. If both fail, it uses software encoding.

Finally, open a camera in Apple Home and make sure that the video continues to play.
The synthetic test confirms that the encoder is available. It does not test the camera
connection or HomeKit playback. You can keep the current camera pairings.
