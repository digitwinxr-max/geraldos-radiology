# GeraldOS — OHIF Viewer container.
#
# Render: PRIVATE service (type: pserv, no public URL). The Next.js app
# reverse-proxies it at /viewer, so the browser only ever talks to the
# GeraldOS origin. Docker Compose: reachable as `http://ohif:80` on the
# compose network and likewise proxied by the app — nothing has to publish it.
#
# Why same-origin matters: the viewer's DICOMweb calls go to
# /api/orthanc/dicom-web on whatever origin serves the page, and those calls
# are authorised by the GeraldOS session cookie (SameSite=Lax). A viewer on its
# own hostname would be cross-site with the app on Render — `onrender.com` is
# on the Public Suffix List — so the cookie would never be sent and clinical
# data would be unreachable (or the cookie policy would have to be weakened to
# compensate). Serving it from the app's origin needs no CORS and no relaxation.
#
# The image's nginx listens on $PORT (default 80): Render injects PORT and
# render.yaml pins it; compose maps the default 80 to host 3001.
#
# Only the runtime configuration is overridden here. `routerBasename: '/viewer'`
# in app-config.js is the documented "simple" sub-path setup — the client router
# is rooted at /viewer while the bundle keeps requesting its assets from the
# origin root, which the app also proxies. That avoids rebuilding the upstream
# image with a different PUBLIC_URL (a build-time argument that cannot be
# changed at runtime).

# Pinned, not `latest`. Verified against the Docker Hub API on 2026-09-03:
# `ohif/app:latest` and `:v3.12.13` share the manifest digest
# sha256:1d3ae671d1ebaff832aa8e37d148b03b3f636353e3d0e39f42745c51ced43109,
# so this pin is byte-identical to what `latest` resolved to at the time of
# writing. `latest` tracks stable releases (`latest-beta` is a separate tag),
# but pinning keeps the viewer from changing underneath an unchanged commit —
# which matters here because the sub-path mount depends on the bundle
# requesting its assets from the origin root.
FROM ohif/app:v3.12.13

# Runtime configuration override — points every DICOMweb call at the GeraldOS
# API base of whatever host serves the viewer (same-origin proxy).
COPY ohif-config/app-config.js /usr/share/nginx/html/app-config.js

EXPOSE 80
