import http from 'http';

const index = [
  { sopInstanceUID: '1.2.3.4.5.6', studyDate: '20250804', patientName: 'MTHEMBU^SIPHO', patientID: 'GH-100001', modality: 'CT', studyDescription: 'CT Brain' },
  { sopInstanceUID: '1.2.3.4.5.7', studyDate: '20250804', patientName: 'KHUMALO^ZANELE', patientID: 'GH-100002', modality: 'MRI', studyDescription: 'MRI Knee' },
  { sopInstanceUID: '1.2.3.4.5.8', studyDate: '20250804', patientName: 'PRETORIUS^JOHAN', patientID: 'GH-100003', modality: 'CT', studyDescription: 'CT Chest' },
  { sopInstanceUID: '1.2.3.4.5.9', studyDate: '20250804', patientName: 'NAIDOO^DAVID', patientID: 'GH-100005', modality: 'MRI', studyDescription: 'MRI Lumbar Spine' },
];

function search(q) {
  if (!q || q === '*' || q.includes('*')) return index;
  const lc = q.toLowerCase();
  return index.filter(s => Object.values(s).some(v => String(v).toLowerCase().includes(lc)));
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('Content-Type', 'application/json');
  if (url.pathname === '/search') {
    const q = url.searchParams.get('query') || '*';
    const results = search(q);
    res.writeHead(200); res.end(JSON.stringify({ results, numResults: results.length, query: q, elapsedTime: 2 }));
    return;
  }
  if (url.pathname === '/' || url.pathname === '') {
    res.writeHead(200); res.end(JSON.stringify({ version: '3.4.1', service: 'dicoogle' })); return;
  }
  res.writeHead(404); res.end('{"error":"not_found"}');
}).listen(8095, '127.0.0.1', () => console.log('[dicoogle] :8095'));
