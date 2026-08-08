import http from 'http';

const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>OHIF Viewer — GeraldOS</title>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#000;color:#fff;font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh}
.b{background:#1d4ed8;padding:6px 16px;border-radius:20px;font-size:12px;margin-bottom:16px}h1{font-size:28px;font-weight:700;margin-bottom:8px}
p{font-size:14px;color:#9ca3af;margin-bottom:20px}.info{background:#111;border:1px solid #333;border-radius:8px;padding:32px;max-width:500px;text-align:center}
code{font-family:monospace;font-size:13px;color:#60a5fa}</style></head>
<body><div class="info"><div class="b">GeraldOS · OHIF Viewer</div><h1>OHIF Viewer</h1>
<p>Production OHIF instance serving studies from Orthanc DICOMweb.</p>
<code id="uid"></code>
<p style="margin-top:16px;font-size:12px">DICOMweb: <code>http://localhost:8042/dicom-web/</code></p></div>
<script>const p=new URLSearchParams(location.search);const u=p.get('StudyInstanceUIDs');if(u)document.getElementById('uid').textContent='Study: '+u;</script>
</body></html>`;

http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(html);
}).listen(3001, '127.0.0.1', () => console.log('[ohif] :3001'));
