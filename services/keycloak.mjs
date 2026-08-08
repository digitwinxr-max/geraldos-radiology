import http from 'http';
import crypto from 'crypto';

const REALM = 'geraldos';
const CLIENT_ID = 'geraldos-frontend';
const PORT = 8180;
const BASE = `http://127.0.0.1:${PORT}`;
const ISSUER = `${BASE}/realms/${REALM}`;

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const privateKeyObj = crypto.createPrivateKey(privateKey);
const pubKeyObj = crypto.createPublicKey(publicKey);
const pubJwk = pubKeyObj.export({ format: 'jwk' });
const keyId = 'geraldos-key-1';

const users = {
  admin: { password: 'admin', name: 'Gerald Holdings Admin', email: 'admin@gerald.co.za', roles: ['administrator','radiologist','radiographer','receptionist','manager'], sub: 'kc-admin-001' },
  radiologist: { password: 'radiologist', name: 'Dr Sarah Mokoena', email: 's.mokoena@gerald.co.za', roles: ['radiologist'], sub: 'kc-radio-002' },
  receptionist: { password: 'receptionist', name: 'Nomsa Dlamini', email: 'n.dlamini@gerald.co.za', roles: ['receptionist'], sub: 'kc-recep-003' },
};

const authCodes = new Map();

function makeJwt(user) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: keyId })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    iss: ISSUER, sub: user.sub, aud: CLIENT_ID, exp: now + 3600, iat: now,
    name: user.name, email: user.email,
    preferred_username: Object.keys(users).find(k => users[k] === user),
    realm_access: { roles: user.roles },
    resource_access: { [CLIENT_ID]: { roles: user.roles } },
  })).toString('base64url');
  const sig = crypto.createSign('RSA-SHA256').update(`${header}.${payload}`).sign(privateKeyObj).toString('base64url');
  return `${header}.${payload}.${sig}`;
}

function readBody(req) {
  return new Promise(r => { let d = ''; req.on('data', c => d += c); req.on('end', () => r(d)); });
}

const discovery = {
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/protocol/openid-connect/auth`,
  token_endpoint: `${ISSUER}/protocol/openid-connect/token`,
  end_session_endpoint: `${ISSUER}/protocol/openid-connect/logout`,
  jwks_uri: `${ISSUER}/protocol/openid-connect/certs`,
  response_types_supported: ['code'],
  subject_types_supported: ['public'],
  id_token_signing_alg_values_supported: ['RS256'],
  realm: REALM,
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, BASE);
  const p = url.pathname;
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (p === `/realms/${REALM}/.well-known/openid-configuration` || p === `/realms/${REALM}`) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(discovery)); return;
  }
  if (p.endsWith('/certs')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ keys: [{ ...pubJwk, use: 'sig', kid: keyId, alg: 'RS256' }] })); return;
  }
  if (p.endsWith('/auth')) {
    const redirect_uri = url.searchParams.get('redirect_uri') || '';
    const state = url.searchParams.get('state') || '';
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!DOCTYPE html><html><head><title>GeraldOS SSO</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#f8fafc;display:flex;align-items:center;justify-content:center;height:100vh}.c{background:#fff;padding:32px;border-radius:12px;box-shadow:0 2px 12px #0001;width:360px}h2{margin-bottom:20px;color:#1e293b;font-size:18px}input,select{width:100%;margin-bottom:12px;padding:10px;border:1px solid #e2e8f0;border-radius:6px;font-size:14px}button{width:100%;background:#2563eb;color:#fff;padding:12px;border:none;border-radius:6px;font-size:15px;cursor:pointer}button:hover{background:#1d4ed8}.s{font-size:11px;color:#94a3b8;margin-top:16px;text-align:center}</style></head>
<body><div class="c"><h2>🏥 GeraldOS · Keycloak SSO</h2><form method="POST">
<input type="hidden" name="redirect_uri" value="${redirect_uri}"/><input type="hidden" name="state" value="${state}"/>
<label style="font-size:13px;color:#475569">User</label>
<select name="username"><option value="admin">admin (Administrator)</option><option value="radiologist">radiologist (Dr Mokoena)</option><option value="receptionist">receptionist (Nomsa)</option></select>
<label style="font-size:13px;color:#475569">Password</label>
<input type="password" name="password" placeholder="same as username"/>
<button type="submit">Sign in via Keycloak</button></form><p class="s">Realm: ${REALM}</p></div></body></html>`);
      return;
    }
    if (req.method === 'POST') {
      const form = new URLSearchParams(await readBody(req));
      const user = users[form.get('username') || ''];
      if (user && user.password === form.get('password')) {
        const code = crypto.randomUUID();
        authCodes.set(code, { user, exp: Date.now() + 120000 });
        res.writeHead(302, { Location: `${form.get('redirect_uri') || redirect_uri}?code=${code}&state=${encodeURIComponent(form.get('state') || state)}` });
        res.end(); return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body><h3>Invalid credentials. Use admin/admin.</h3><a href="javascript:history.back()">Back</a></body></html>');
      return;
    }
  }
  if (p.endsWith('/token')) {
    const form = new URLSearchParams(await readBody(req));
    if (form.get('grant_type') === 'authorization_code') {
      const entry = authCodes.get(form.get('code') || '');
      if (!entry || Date.now() > entry.exp) { res.writeHead(400); res.end('{"error":"invalid_grant"}'); return; }
      authCodes.delete(form.get('code'));
      const token = makeJwt(entry.user);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ access_token: token, id_token: token, token_type: 'Bearer', expires_in: 3600 }));
      return;
    }
    res.writeHead(400); res.end('{"error":"unsupported_grant_type"}'); return;
  }
  if (p.endsWith('/logout')) {
    res.writeHead(302, { Location: url.searchParams.get('post_logout_redirect_uri') || '/' });
    res.end(); return;
  }
  res.writeHead(404); res.end('{"error":"not_found"}');
}).listen(PORT, '127.0.0.1', () => console.log(`[keycloak] :${PORT} realm=${REALM}`));
