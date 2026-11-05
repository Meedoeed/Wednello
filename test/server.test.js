import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 3999 + Math.floor(Math.random() * 500);
const base = `http://127.0.0.1:${PORT}`;
let proc, dir;

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-'));
  proc = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(PORT), DATA_DIR: dir, DEMO: '1', NODE_ENV: 'test', PUBLIC_URL: base }, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(base + '/api/health')).ok) return; } catch {} await new Promise(r => setTimeout(r, 100)); }
  throw new Error('сервер не запустился');
});
after(() => { proc.kill('SIGTERM'); });

test('главная, SEO и юридические страницы', async () => {
  const html = await (await fetch(base + '/')).text();
  assert.match(html, /window\.WN_CONFIG=/);
  assert.match(html, /rel="canonical"/);
  for (const p of ['/legal/terms', '/legal/privacy', '/legal/contacts', '/robots.txt', '/sitemap.xml']) assert.equal((await fetch(base + p)).status, 200, p);
});

test('gzip и заголовки безопасности', async () => {
  const r = await fetch(base + '/assets/app.js', { headers: { 'Accept-Encoding': 'gzip' } });
  assert.equal(r.headers.get('content-encoding'), 'gzip');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
});

test('публичная страница приглашения отдаётся с данными', async () => {
  const r = await fetch(base + '/i/anna-i-mikhail');
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.match(html, /window\.VZ_BOOT=/);
  assert.match(html, /og:title/);
  assert.equal((await fetch(base + '/i/no-such-invite')).status, 404);
});

test('загрузка: проверка формата по содержимому', async () => {
  const login = await (await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'demo@wednello.ru', password: 'demo123' }) })).json();
  const up = body => fetch(base + '/api/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + login.token }, body: JSON.stringify(body) });
  const fake = 'data:image/png;base64,' + Buffer.from('<svg onload=alert(1)>…………').toString('base64');
  assert.equal((await up({ dataUrl: fake })).status, 400);
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const ok = await up({ dataUrl: png });
  assert.equal(ok.status, 200);
  const { url } = await ok.json();
  assert.equal((await fetch(base + url)).status, 200);
});

test('ограничение частоты попыток входа', async () => {
  let last;
  for (let i = 0; i < 25; i++) last = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"email":"x@y.ru","password":"bad"}' });
  assert.equal(last.status, 429);
});
