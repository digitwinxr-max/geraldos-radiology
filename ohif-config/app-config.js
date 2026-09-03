/**
 * OHIF Viewer — GeraldOS configuration
 *
 * Topology (single origin):
 *
 *   browser ──► geraldos.example/           Next.js app (auth, worklist, UI)
 *           ──► geraldos.example/viewer/    OHIF, reverse-proxied by Next.js
 *           ──► geraldos.example/api/orthanc/dicom-web/   DICOMweb pass-through
 *           ──► (server-side only) Orthanc on the private network
 *
 * The viewer is served from the SAME origin as the app, so the GeraldOS session
 * cookie (SameSite=Lax) is sent on every DICOMweb request automatically: no
 * CORS, no `SameSite=None`, no cross-site cookies, and Orthanc credentials
 * never leave the server. This is not cosmetic — on Render's free hostnames
 * (`*.onrender.com`, which is on the Public Suffix List) a viewer on its own
 * subdomain would be cross-SITE with the app and could never be authenticated.
 *
 * All DICOMweb traffic (QIDO-RS / WADO-RS / STOW-RS / WADO-URI) flows through
 * the GeraldOS proxy. Endpoints are read from environment variables
 * server-side (ORTHANC_URL / ORTHANC_USERNAME / ORTHANC_PASSWORD).
 *
 * `extensions`/`modes` must be arrays (the standalone ohif/app bundle carries
 * the actual implementations) — omitting them breaks app boot.
 */

// Same-origin by construction; resolved at runtime so one image works in
// docker-compose, in CI and on Render without rebuilding.
var apiBase = window.location.origin;

window.config = {
  // Must match OHIF_MOUNT_PREFIX in src/lib/integrations/index.ts and the
  // rewrites in next.config.ts. This is the "simple" sub-path setup from
  // https://docs.ohif.org/deployment/custom-url-access: the client router is
  // rooted at /viewer while the bundle keeps loading its assets from the origin
  // root, which GeraldOS also proxies.
  routerBasename: '/viewer',
  extensions: [],
  modes: [],
  showStudyList: true,
  defaultDataSourceName: 'dicomweb',
  maxNumberOfWebWorkers: 3,
  // The viewer shares the app's origin, so cross-origin warnings would only be
  // noise; keep them off and let GeraldOS authorise every DICOMweb call.
  showWarningMessageForCrossOrigin: false,
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
        wadoUriRoot: apiBase + '/api/orthanc/wado-uri',
        qidoRoot: apiBase + '/api/orthanc/dicom-web',
        stowRoot: apiBase + '/api/orthanc/dicom-web',
        wadoRoot: apiBase + '/api/orthanc/dicom-web',
        requestOptions: {
          // Same-origin requests carry the GeraldOS session cookie, which is
          // what authorises access to clinical data.
          withCredentials: false,
          headers: {
            Accept: 'application/json',
          },
        },
        imageRendering: 'wadouri',
        thumbnailRendering: 'wadouri',
        enableStudyList: true,
        enableStudyLazyLoad: true,
      },
    },
  ],
};
