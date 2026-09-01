# GeraldOS — OHIF Viewer container for Render (public web service).
#
# The viewer's data source points at the GeraldOS DICOMweb proxy
# (/api/orthanc/dicom-web) via the same-origin runtime config: the browser
# never talks to Orthanc directly, so no CORS configuration is required and
# Orthanc credentials never leave the server.
#
# The image's nginx listens on $PORT (default 80) — on Render the platform
# injects PORT; in Docker Compose the default 80 is mapped to 3001.
# The container injects the runtime configuration over the image default.

FROM ohif/app:latest

# Runtime configuration override — points every DICOMweb call at the GeraldOS
# API base of whatever host serves the viewer (same-origin proxy).
COPY ohif-config/app-config.js /usr/share/nginx/html/app-config.js

EXPOSE 80
