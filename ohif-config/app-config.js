/**
 * OHIF Viewer — GeraldOS configuration
 *
 * All DICOMweb traffic (QIDO-RS / WADO-RS / STOW-RS) flows through the GeraldOS
 * same-origin proxy at /api/orthanc/dicom-web — the browser never talks to
 * Orthanc directly, so no CORS configuration is required and Orthanc
 * credentials never leave the server. Endpoints are read from environment
 * variables server-side (ORTHANC_URL / ORTHANC_USERNAME / ORTHANC_PASSWORD).
 *
 * `extensions`/`modes` must be arrays (the standalone ohif/app bundle carries
 * the actual implementations) — omitting them breaks app boot.
 */
// Resolve the GeraldOS API base at runtime so the viewer works regardless of
// the host it is served from (localhost, Docker compose, or a proxy).
var apiBase = window.location.protocol + '//' + window.location.host;

window.config = {
  routerBasename: '/',
  extensions: [],
  modes: [],
  showStudyList: true,
  defaultDataSourceName: 'dicomweb',
  maxNumberOfWebWorkers: 3,
  showWarningMessageForCrossOrigin: true,
  showCPUFallbackMessage: true,
  showLoadingIndicator: true,
  strictZSpacingForVolumeViewport: true,
  dataSources: [
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: 'dicomweb',
      displaySetName: 'DICOM Web',
      configuration: {
        friendlyName: 'GeraldOS DICOMweb (Orthanc)',
        name: 'Orthanc',
        wadoUriRoot: apiBase + '/api/orthanc/dicom-web',
        qidoRoot: apiBase + '/api/orthanc/dicom-web',
        stowRoot: apiBase + '/api/orthanc/dicom-web',
        wadoRoot: apiBase + '/api/orthanc/dicom-web',
        requestOptions: {
          headers: {
            Accept: 'application/json',
          },
        },
        imageRendering: 'wadors',
        thumbnailRendering: 'wadors',
        enableStudyList: true,
        enableStudyLazyLoad: true,
      },
    },
  ],
};
