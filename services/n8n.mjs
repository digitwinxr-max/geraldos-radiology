import http from 'http';

const workflows = new Map();
const executions = [];

function readBody(req) {
  return new Promise(r => { let d = ''; req.on('data', c => d += c); req.on('end', () => { try { r(JSON.parse(d)); } catch { r({}); } }); });
}

// Pre-seed some n8n workflows
const seeds = [
  { id: 'wf-patient-arrived', name: 'patient-arrived', description: 'Triggers when a patient checks in at reception', active: true },
  { id: 'wf-equipment-service', name: 'equipment-service', description: 'Dispatches service request to equipment vendor', active: true },
  { id: 'wf-supplier-reorder', name: 'supplier-reorder', description: 'Auto-reorder trigger for low inventory items', active: true },
  { id: 'wf-tat-escalation', name: 'tat-escalation', description: 'Escalation when study TAT exceeds threshold', active: true },
  { id: 'wf-report-signed', name: 'report-signed', description: 'Notification when radiology report is signed', active: true },
];
seeds.forEach(w => workflows.set(w.id, { ...w, createdAt: new Date().toISOString() }));

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  res.setHeader('Content-Type', 'application/json');

  if (p === '/healthz') { res.writeHead(200); res.end(JSON.stringify({ status: 'ok', version: '1.76.2' })); return; }
  if (p === '/api/v1/workflows' && req.method === 'GET') {
    res.writeHead(200); res.end(JSON.stringify({ data: [...workflows.values()], nextCursor: null })); return;
  }
  if (p.startsWith('/webhook/') && req.method === 'POST') {
    const name = p.replace('/webhook/', '').split('?')[0];
    const body = await readBody(req);
    const exec = { id: `exec-${Date.now()}`, workflow: name, data: body, executedAt: new Date().toISOString(), status: 'success' };
    executions.push(exec);
    console.log(`[n8n] webhook: ${name}`);
    res.writeHead(200); res.end(JSON.stringify({ success: true, executionId: exec.id, workflow: name })); return;
  }
  if (p === '/api/v1/executions' && req.method === 'GET') {
    res.writeHead(200); res.end(JSON.stringify({ data: executions.slice(-20), nextCursor: null })); return;
  }
  res.writeHead(404); res.end('{"error":"not_found"}');
}).listen(5678, '127.0.0.1', () => console.log('[n8n] :5678'));
