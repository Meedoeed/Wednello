// WEDNELLO — сервер: API, публичные страницы приглашений /i/:slug, загрузки и статика.
// Без внешних зависимостей: node:http + JSON-хранилище (для продакшена замените store на Postgres — см. README).
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createCore, emptyDb } from '../shared/core.js';
import { seedDemo } from '../shared/seed.js';
import { resolveModel, namesPlain, formatDateLong, uid } from '../shared/model.js';
import { getTemplate } from '../shared/templates.js';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const DATA = process.env.DATA_DIR || path.join(ROOT, 'data');
const UPLOADS = path.join(DATA, 'uploads');
const PORT = +process.env.PORT || 3000;
const DEMO = process.env.DEMO !== '0';
fs.mkdirSync(UPLOADS, { recursive: true });

/* ───────── хранилище ───────── */
const DB_FILE = path.join(DATA, 'db.json');
let data;
try { data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch { data = emptyDb(); }
let saveTimer = 0, saving = Promise.resolve();
const store = {
  data,
  save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saving = saving.then(async () => {
        const tmp = DB_FILE + '.tmp';
        await fsp.writeFile(tmp, JSON.stringify(store.data));
        await fsp.rename(tmp, DB_FILE);
      }).catch(e => console.error('Не удалось сохранить базу', e));
    }, 150);
  },
};
const hashPassword = p => new Promise((res, rej) => {
  const salt = crypto.randomBytes(16).toString('hex');
  crypto.scrypt(p, salt, 32, (e, k) => (e ? rej(e) : res(`scrypt:${salt}:${k.toString('hex')}`)));
});
const verifyPassword = (p, h) => new Promise(res => {
  const [, salt, key] = String(h).split(':');
  if (!salt || !key) return res(false);
  crypto.scrypt(p, salt, 32, (e, k) => res(!e && crypto.timingSafeEqual(k, Buffer.from(key, 'hex'))));
});
const core = createCore({ store, hashPassword, verifyPassword, isDemo: false });
if (DEMO) await seedDemo({ store, core, hashPassword });

/* ───────── утилиты ───────── */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const send = (res, status, body, headers = {}) => { res.writeHead(status, headers); res.end(body); };
const json = (res, status, obj) => send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const safeJson = v => JSON.stringify(v).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, c => '\\u' + c.charCodeAt(0).toString(16));

function readBody(req, limit = 16 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(Object.assign(new Error('Файл слишком большой'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// простое ограничение частоты для публичных ответов
const hits = new Map();
function rateLimited(ip, key, max = 20, windowMs = 60_000) {
  const k = ip + key, now = Date.now();
  const arr = (hits.get(k) || []).filter(t => now - t < windowMs);
  arr.push(now); hits.set(k, arr);
  return arr.length > max;
}

async function serveFile(res, file, cache = 'no-cache') {
  try {
    const st = await fsp.stat(file);
    if (!st.isFile()) throw new Error();
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': cache });
    fs.createReadStream(file).pipe(res);
    return true;
  } catch { return false; }
}

/* ───────── публичная страница приглашения ───────── */
const tplCache = new Map();
async function renderInvite(req, res, slug, query) {
  const r = await core.handle({ method: 'GET', path: '/public/invite/' + slug, query });
  if (r.status !== 200) {
    return send(res, 404, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Приглашение не найдено</title><body style="font:16px system-ui;display:grid;place-items:center;min-height:90vh;color:#444;text-align:center"><div><h1 style="font-weight:400">Приглашение недоступно</h1><p>${esc(r.data.error)}</p></div>`, { 'Content-Type': 'text/html; charset=utf-8' });
  }
  const inv = r.data;
  const t = getTemplate(inv.templateId);
  let html = tplCache.get(t.folder);
  if (!html || process.env.NODE_ENV !== 'production') { html = await fsp.readFile(path.join(DIST, 'templates', t.folder, 'index.html'), 'utf8'); tplCache.set(t.folder, html); }
  const asset = s => (s && s.startsWith('@demo/') ? '../_demo/' + s.slice(6) : s || '');
  const model = resolveModel({ templateId: inv.templateId, data: inv.data }, { asset, brand: inv.brand, guest: inv.guest });
  const boot = { model, mode: 'public', id: inv.id, rsvpEndpoint: `/api/public/rsvp/${encodeURIComponent(slug)}${query.g ? '?g=' + encodeURIComponent(query.g) : ''}` };
  const origin = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;
  const photo = inv.data.photos?.find(p => p.src)?.src;
  const image = photo ? (photo.startsWith('@demo/') ? `${origin}/templates/_demo/${photo.slice(6)}` : photo.startsWith('/') ? origin + photo : photo) : `${origin}/templates/_covers/${t.id}.jpg`;
  const title = `${namesPlain(inv.data.couple)} — приглашение на свадьбу`;
  const desc = `${model.guest ? model.guest.greeting + ' ' : ''}${formatDateLong(inv.data.event.date)}. Ждём вас!`;
  const head = `<base href="/templates/${t.folder}/">
<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(image)}"><meta name="twitter:card" content="summary_large_image">
<meta name="robots" content="noindex">`;
  const out = html
    .replace(/<head>/i, '<head>\n' + head)
    .replace(/<title>[^<]*<\/title>/i, `<title>${esc(title)}</title>`)
    .replace('<script src="../_runtime/runtime.js"></script>', `<script>window.VZ_BOOT=${safeJson(boot)}</script>\n<script src="../_runtime/runtime.js"></script>`);
  send(res, 200, out, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
}

/* ───────── загрузки ───────── */
async function handleUpload(req, res, token) {
  const me = await core.handle({ method: 'GET', path: '/auth/me', token });
  if (me.status !== 200) return json(res, 401, { error: 'Войдите в аккаунт' });
  const body = JSON.parse(await readBody(req) || '{}');
  const m = /^data:((image|audio)\/([a-z0-9.+-]+));base64,([a-z0-9+/=]+)$/i.exec(body.dataUrl || '');
  if (!m) return json(res, 400, { error: 'Поддерживаются изображения и аудио' });
  const ext = { jpeg: 'jpg', jpg: 'jpg', png: 'png', webp: 'webp', gif: 'gif', mpeg: 'mp3', mp3: 'mp3', mp4: 'm4a', aac: 'm4a', ogg: 'ogg', 'x-m4a': 'm4a' }[m[3].toLowerCase()];
  if (!ext) return json(res, 400, { error: 'Этот формат не поддерживается' });
  const name = `${Date.now().toString(36)}-${uid(10)}.${ext}`;
  await fsp.writeFile(path.join(UPLOADS, name), Buffer.from(m[4], 'base64'));
  json(res, 200, { url: '/uploads/' + name });
}

/* ───────── сервер ───────── */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = decodeURIComponent(url.pathname);
  const query = Object.fromEntries(url.searchParams);
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  try {
    if (p === '/api/health') return json(res, 200, { ok: true, app: 'wednello', demo: DEMO });
    if (p.startsWith('/api/')) {
      const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || null;
      if (p === '/api/uploads' && req.method === 'POST') return await handleUpload(req, res, token);
      if (p.startsWith('/api/public/rsvp/') && rateLimited(ip, 'rsvp', 15)) return json(res, 429, { error: 'Слишком много ответов подряд. Попробуйте через минуту.' });
      if (p.startsWith('/api/auth/') && req.method === 'POST' && rateLimited(ip, 'auth', 30)) return json(res, 429, { error: 'Слишком много попыток. Подождите минуту.' });
      const raw = ['POST', 'PATCH', 'PUT'].includes(req.method) ? await readBody(req, 2 * 1024 * 1024) : '';
      let body;
      try { body = raw ? JSON.parse(raw) : undefined; } catch { return json(res, 400, { error: 'Некорректный JSON' }); }
      const r = await core.handle({ method: req.method, path: p, query, body, token });
      if (p.startsWith('/api/public/rsvp/')) res.setHeader('Access-Control-Allow-Origin', '*');
      return json(res, r.status, r.data);
    }
    if (req.method === 'OPTIONS') return send(res, 204, '', { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST' });
    const inv = /^\/i\/([a-z0-9-]+)\/?$/.exec(p);
    if (inv) return await renderInvite(req, res, inv[1], query);
    if (p.startsWith('/uploads/')) {
      const f = path.join(UPLOADS, path.basename(p));
      if (await serveFile(res, f, 'public, max-age=31536000, immutable')) return;
      return send(res, 404, 'Not found');
    }
    const file = path.normalize(path.join(DIST, p));
    if (file.startsWith(DIST) && p !== '/' && await serveFile(res, file, p.startsWith('/templates/') ? 'public, max-age=3600' : 'no-cache')) return;
    if (!path.extname(p)) return await serveFile(res, path.join(DIST, 'index.html'));
    send(res, 404, 'Not found');
  } catch (e) {
    console.error(e);
    if (!res.headersSent) json(res, e.status || 500, { error: e.status ? e.message : 'Внутренняя ошибка сервера' });
  }
});
server.listen(PORT, () => console.log(`WEDNELLO запущен: http://localhost:${PORT}${DEMO ? '  (демо-вход: demo@wednello.ru / demo123)' : ''}`));
