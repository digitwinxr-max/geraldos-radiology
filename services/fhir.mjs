import http from 'http';

const fhirVersion = "4.0.1";
const resources = { Patient: [], ImagingStudy: [], Coverage: [], DiagnosticReport: [], ServiceRequest: [] };
let idSeq = 1000;

function readBody(req) {
  return new Promise(r => { let d = ''; req.on('data', c => d += c); req.on('end', () => { try { r(JSON.parse(d)); } catch { r({}); } }); });
}

const cap = {
  resourceType: "CapabilityStatement", status: "active", fhirVersion,
  format: ["application/fhir+json"],
  rest: [{ mode: "server", resource: Object.keys(resources).map(t => ({ type: t, interaction: [{ code: "read" }, { code: "search-type" }, { code: "create" }] })) }]
};

[
  { id: 'pat-1', resourceType: 'Patient', name: [{ given: ['Sipho'], family: 'Mthembu' }], gender: 'male', birthDate: '1985-03-12', identifier: [{ system: 'urn:gerald:mrn', value: 'GH-100001' }] },
  { id: 'pat-2', resourceType: 'Patient', name: [{ given: ['Zanele'], family: 'Khumalo' }], gender: 'female', birthDate: '1992-07-25', identifier: [{ system: 'urn:gerald:mrn', value: 'GH-100002' }] },
  { id: 'pat-3', resourceType: 'Patient', name: [{ given: ['Johan'], family: 'Pretorius' }], gender: 'male', birthDate: '1978-11-03', identifier: [{ system: 'urn:gerald:mrn', value: 'GH-100003' }] },
].forEach(p => resources.Patient.push({ ...p, meta: { versionId: '1', lastUpdated: new Date().toISOString() } }));

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('Content-Type', 'application/fhir+json');
  const path = url.pathname.replace('/fhir', '').replace(/^\//, '');

  if (!path || path === 'metadata') { res.writeHead(200); res.end(JSON.stringify(cap)); return; }

  const [rt, rid] = path.split('/');
  if (!resources[rt]) {
    res.writeHead(404); res.end(JSON.stringify({ resourceType: 'OperationOutcome', issue: [{ severity: 'error', diagnostics: `Unknown: ${rt}` }] }));
    return;
  }
  if (req.method === 'GET') {
    if (rid) {
      const r = resources[rt].find(x => x.id === rid);
      if (!r) { res.writeHead(404); res.end('{"resourceType":"OperationOutcome"}'); return; }
      res.writeHead(200); res.end(JSON.stringify(r)); return;
    }
    const count = parseInt(url.searchParams.get('_count') || '50');
    res.writeHead(200);
    res.end(JSON.stringify({ resourceType: 'Bundle', type: 'searchset', total: resources[rt].length, entry: resources[rt].slice(0, count).map(r => ({ resource: r })) }));
    return;
  }
  if (req.method === 'POST') {
    const body = await readBody(req);
    const id = String(++idSeq);
    const resource = { ...body, id, meta: { versionId: '1', lastUpdated: new Date().toISOString() } };
    resources[rt].push(resource);
    res.writeHead(201); res.end(JSON.stringify(resource)); return;
  }
  res.writeHead(405); res.end('{}');
}).listen(8090, '127.0.0.1', () => console.log('[fhir] :8090 FHIR R4'));
