# GeraldOS — Orthanc PACS container for Render (PRIVATE service).
# Same configuration as the compose topology, parameterised via env so the
# same image serves both. DICOM data persists on the attached disk
# (/var/lib/orthanc/db).
#
# SECURITY: no credential is baked into this image. `RegisteredUsers` must be
# supplied at runtime (render.yaml → ORTHANC__REGISTERED_USERS, or .env under
# compose). With AuthenticationEnabled=true and no registered users, Orthanc
# rejects every HTTP request — the deployment fails CLOSED rather than coming
# up with a password that is public in git. GeraldOS reports that as "Orthanc
# unreachable" on the Settings page instead of silently serving weakly
# protected clinical images.

# Pinned, not `latest`. Verified against the Docker Hub API on 2026-09-03:
# `orthancteam/orthanc:latest` and `:26.8.2` share the manifest digest
# sha256:9758c8702a89abece99fcfe6d5571d5eaae59587e8e1ce36b9aafc8d4f24457b,
# so this pin is byte-identical to what `latest` resolved to at the time of
# writing — reproducibility with no behaviour change. Without it, a rebuild
# months from now could silently pull a different Orthanc (and a different
# DICOMweb plugin) under an unchanged commit.
#
# Use the plain tag, NOT `-full`: `-full` bundles extra plugins (WSI, ...) that
# this deployment deliberately does not load. Roll forward by changing the tag
# and re-running the integration suite (docs/INTEGRATION_TESTS.md).
FROM orthancteam/orthanc:26.8.2

# RemoteAccessAllowed MUST stay true: inside a container "remote" is any other
# host, including the GeraldOS service on Render's private network. Setting it
# false would restrict Orthanc's HTTP server to the container's own loopback and
# make the PACS unreachable from the application.
#
# Plugins are pinned to the DICOMweb plugin only. The image's default loads
# every plugin in /usr/share/orthanc/plugins (Orthanc Explorer 2, the bundled
# OHIF viewer, ...); those would expose a second, GeraldOS-unauthorised route
# to clinical images on the private network.
#
# The quotes in ORTHANC__PLUGINS are backslash-escaped on purpose: Dockerfile
# ENV values are parsed shell-style, so a bare ["..."] would have its quotes
# stripped and hand Orthanc invalid JSON. render.yaml and docker-compose.yml
# also set this variable from properly quoted YAML, so the value that reaches
# the deployed service is unambiguous either way.
ENV ORTHANC__STORAGE_DIRECTORY=/var/lib/orthanc/db \
    ORTHANC__INDEX_DIRECTORY=/var/lib/orthanc/db \
    ORTHANC__HTTP_PORT=8042 \
    ORTHANC__DICOM_PORT=4242 \
    ORTHANC__DICOM_WEB__ENABLE=true \
    ORTHANC__DICOM_WEB__ROOT=/dicom-web/ \
    ORTHANC__DICOM_WEB__ENABLE_WADO=true \
    ORTHANC__DICOM_WEB__WADO_ROOT=/wado \
    ORTHANC__AUTHENTICATION_ENABLED=true \
    ORTHANC__PLUGINS=[\"/usr/share/orthanc/plugins/libOrthancDicomWeb.so"] \
    ORTHANC__REMOTE_ACCESS_ALLOWED=true

EXPOSE 8042 4242
