# GeraldOS — Orthanc PACS container for Render (private service).
# Same configuration as the compose topology, parameterised via env so the
# same image serves both. DICOM data persists on the attached disk
# (/var/lib/orthanc/db).

FROM orthancteam/orthanc:latest

ENV ORTHANC__STORAGE_DIRECTORY=/var/lib/orthanc/db \
    ORTHANC__INDEX_DIRECTORY=/var/lib/orthanc/db \
    ORTHANC__HTTP_PORT=8042 \
    ORTHANC__DICOM_PORT=4242 \
    ORTHANC__DICOM_WEB__ENABLE=true \
    ORTHANC__DICOM_WEB__ROOT=/dicom-web/ \
    ORTHANC__DICOM_WEB__ENABLE_WADO=true \
    ORTHANC__DICOM_WEB__WADO_ROOT=/wado \
    ORTHANC__AUTHENTICATION_ENABLED=true \
    ORTHANC__PLUGINS=["/usr/share/orthanc/plugins/libOrthancDicomWeb.so"] \
    ORTHANC__REGISTERED_USERS='{"orthanc":"orthanc_secure_pass"}' \
    ORTHANC__REMOTE_ACCESS_ALLOWED=true

EXPOSE 8042 4242
