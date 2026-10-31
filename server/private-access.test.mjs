import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { once } from 'node:events';
import { WebSocket, WebSocketServer } from 'ws';
import { createPrivateAccess } from './private-access.mjs';

test('private access fails closed for missing or insecure production configuration', () => {
  assert.throws(() => createPrivateAccess({}));
  assert.throws(() => createPrivateAccess({ HARNESS_ACCESS_PASSWORD: 'x'.repeat(32), HARNESS_PUBLIC_ORIGIN: 'http://example.com' }));
  assert.throws(() => createPrivateAccess({ HARNESS_ACCESS_PASSWORD: 'x'.repeat(32), HARNESS_PUBLIC_ORIGIN: 'https://example.com/path' }));
});

test('real HTTP and WebSocket requests enforce private access, origins, cookie integrity and expiry', async () => {
  let now = 1000000;
  const origin = 'https://harness.example.com';
  const password = 'fixture-password-for-security-tests-1234567890';
  const gate = createPrivateAccess({ HARNESS_ACCESS_PASSWORD: password, HARNESS_PUBLIC_ORIGIN: origin }, () => now);
  const server = createServer((req, res) => { if (!gate.http(req, res)) return; res.end(JSON.stringify({ authorizationForwarded: !!req.headers.authorization })); });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024, perMessageDeflate: false });
  server.on('upgrade', (req, socket, head) => { if (gate.upgrade(req, socket)) wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req)); });
  wss.on('connection', ws => { ws.on('error', () => {}); ws.on('message', data => ws.send(data)); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = server.address().port;
  const http = (path, method = 'GET', headers = {}) => new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method, headers }, res => { let body = ''; res.on('data', x => body += x); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body })); }); req.on('error', reject); req.end();
  });
  const basic = 'Basic ' + Buffer.from('operator:' + password).toString('base64');
  const rejectedWS = headers => new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://127.0.0.1:' + port + '/parties/main/test', { headers });
    ws.on('unexpected-response', (_req, res) => { res.resume(); ws.terminate(); resolve(res.statusCode); });
    ws.on('error', () => {}); ws.on('open', () => { ws.terminate(); reject(new Error('Unauthorized WebSocket accepted')); });
  });
  try {
    assert.equal((await http('/')).status, 401);
    assert.equal((await http('/health')).status, 200);
    assert.equal((await http('/health', 'POST')).status, 401);
    const login = await http('/', 'GET', { Authorization: basic });
    assert.equal(login.status, 200); assert.equal(JSON.parse(login.body).authorizationForwarded, false);
    const setCookie = login.headers['set-cookie'][0];
    assert.match(setCookie, /Secure; HttpOnly; SameSite=Strict/);
    const cookie = setCookie.split(';')[0];
    assert.equal((await http('/form', 'GET', { Cookie: cookie })).status, 200);
    assert.equal((await http('/form', 'POST', { Cookie: cookie, Origin: 'https://evil.example' })).status, 403);
    assert.equal((await http('/form', 'GET', { Cookie: cookie, 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    assert.equal((await http('/', 'GET', { Cookie: cookie + 'x' })).status, 401);
    assert.equal(await rejectedWS({ Cookie: cookie }), 401);
    assert.equal(await rejectedWS({ Cookie: cookie, Origin: 'https://evil.example' }), 401);
    assert.equal(await rejectedWS({ Origin: origin }), 401);
    const ws = new WebSocket('ws://127.0.0.1:' + port + '/parties/main/test', { headers: { Cookie: cookie, Origin: origin } });
    await once(ws, 'open'); ws.send('hello'); assert.equal(String((await once(ws, 'message'))[0]), 'hello');
    ws.send(Buffer.alloc(1024 * 1024 + 1)); assert.equal((await once(ws, 'close'))[0], 1009);
    now += 8 * 60 * 60 + 1;
    assert.equal((await http('/', 'GET', { Cookie: cookie })).status, 401);
    assert.equal(await rejectedWS({ Cookie: cookie, Origin: origin }), 401);
  } finally { wss.close(); await new Promise(resolve => server.close(resolve)); }
});
