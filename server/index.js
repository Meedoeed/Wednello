// WEDNELLO — сервер: API, публичные страницы приглашений /i/:slug, оплата, загрузки и статика.
// Без внешних зависимостей: node:http + JSON-хранилище с атомарной записью и ежедневными копиями.
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { config, configWarnings } from './config.js';
import { createMailer } from './mailer.js';
import { createYooKassa } from './yookassa.js';
import { legalPage } from './legal.js';
import { createCore, emptyDb } from '../shared/core.js';
import { seedDemo } from '../shared/seed.js';
import { resolveModel, namesPlain, formatDateLong, uid } from '../shared/model.js';
import { getTemplate } from '../shared/templates.js';

const DIST = config.distDir;
const DATA = config.dataDir;
const UPLOADS = path.join(DATA, 'uploads');
const BACKUPS = path.join(DATA, 'backups');
fs.mkdirSync(UPLOADS, { recursive: true });
fs.mkdirSync(BACKUPS, { recursive: true });
if (!fs.existsSync(path.join(DIST, 'index.html'))) { console.error('Нет сборки интерфейса: выполните «npm run build».'); process.exit(1); }

/* ───────── хранилище ───────── */
const DB_FILE = path.join(DATA, 'db.json');
function loadDb() {
  if (!fs.existsSync(DB_FILE)) return emptyDb();
  const raw = fs.readFileSync(DB_FILE, 'utf8');
  if (!raw.trim()) return emptyDb();
  try { return JSON.parse(raw); } catch (e) {
    // не затираем повреждённую базу: останавливаемся, чтобы её можно было восстановить из data/backups
    console.error(`База ${DB_FILE} повреждена (${e.message}). Восстановите её из ${BACKUPS} и перезапустите сервер.`);
    process.exit(1);
  }
}
let saveTimer = 0, saving = Promise.resolve(), dirty = false;
const store = {
  data: loadDb(),
  save() {
    dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 150);
  },
};
function flush() {
  if (!dirty) return saving;
  dirty = false;
  const json = JSON.stringify(store.data);
  saving = saving.then(async () => {
    const tmp = DB_FILE + '.tmp';
    const fh = await fsp.open(tmp, 'w');
    try { await fh.writeFile(json); await fh.sync(); } finally { await fh.close(); }
    await fsp.rename(tmp, DB_FILE);
  }).catch(e => { dirty = true; console.error('Не удалось сохранить базу', e); });
  return saving;
}
function flushSync() {
  clearTimeout(saveTimer);
  if (!dirty) return;
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(store.data));
  fs.renameSync(tmp, DB_FILE);
  dirty = false;
}
async function backup() {
  try {
    await flush();
    if (!fs.existsSync(DB_FILE)) return;
    const name = `db-${new Date().toISOString().slice(0, 10)}.json`;
    await fsp.copyFile(DB_FILE, path.join(BACKUPS, name));
    const files = (await fsp.readdir(BACKUPS)).filter(f => /^db-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    for (const f of files.slice(0, Math.max(0, files.length - config.backupsKeep))) await fsp.unlink(path.join(BACKUPS, f));
  } catch (e) { console.error('Резервная копия не создана', e); }
}

const hashPassword = p => new Promise((res, rej) => {
  const salt = crypto.randomBytes(16).toString('hex');
  crypto.scrypt(p, salt, 32, (e, k) => (e ? rej(e) : res(`scrypt:${salt}:${k.toString('hex')}`)));
});
const verifyPassword = (p, h) => new Promise(res => {
  const [kind, salt, key] = String(h).split(':');
  if (kind !== 'scrypt' || !salt || !key) return res(false);
  crypto.scrypt(p, salt, 32, (e, k) => res(!e && k.length === key.length / 2 && crypto.timingSafeEqual(k, Buffer.from(key, 'hex'))));
});

const sendMail = createMailer(config.smtp);
const billing = createYooKassa(config.yookassa, { publicUrl: config.publicUrl });
const core = createCore({
  store, hashPassword, verifyPassword, isDemo: false,
  hooks: {
    publicUrl: config.publicUrl, adminEmails: config.adminEmails, billing,
    sendMail: sendMail || (config.production ? null : msg => console.log(`[письмо → ${msg.to}] ${msg.subject}\n${msg.text}\n`)),
  },
});
store.save();
if (config.demo) await seedDemo({ store, core, hashPassword });

/* ───────── утилиты ───────── */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8' };
const COMPRESSIBLE = /^(text\/|application\/(json|xml|javascript)|image\/svg)/;
const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  ...(config.publicUrl.startsWith('https://') ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' } : {}),
};
function send(req, res, status, body, headers = {}) {
  const h = { ...SECURITY, ...headers };
  let buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body ?? ''));
  if (buf.length > 1024 && COMPRESSIBLE.test(h['Content-Type'] || '') && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    buf = zlib.gzipSync(buf, { level: 6 }); h['Content-Encoding'] = 'gzip'; h.Vary = 'Accept-Encoding';
  }
  h['Content-Length'] = buf.length;
  res.writeHead(status, h);
  res.end(req.method === 'HEAD' ? undefined : buf);
}
const json = (req, res, status, obj) => send(req, res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
const html = (req, res, status, body, cache = 'no-cache') => send(req, res, status, body, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': cache });
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const safeJson = v => JSON.stringify(v).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, c => '\\u' + c.charCodeAt(0).toString(16));

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(Object.assign(new Error('Слишком большой запрос'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/* ограничение частоты запросов */
const hits = new Map();
function rateLimited(ip, key, max, windowMs = 60_000) {
  const k = ip + '|' + key, t = Date.now();
  const arr = (hits.get(k) || []).filter(x => t - x < windowMs);
  arr.push(t); hits.set(k, arr);
  return arr.length > max;
}
setInterval(() => { const t = Date.now(); for (const [k, v] of hits) if (!v.length || t - v[v.length - 1] > 3600e3) hits.delete(k); }, 600e3).unref();

/* статика: ETag + gzip в памяти */
const gzCache = new Map();
async function serveFile(req, res, file, cache = 'no-cache') {
  let st;
  try { st = await fsp.stat(file); } catch { return false; }
  if (!st.isFile()) return false;
  const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const etag = `W/"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
  const h = { ...SECURITY, 'Content-Type': type, 'Cache-Control': cache, ETag: etag, 'Last-Modified': st.mtime.toUTCString() };
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, h); res.end(); return true; }
  if (COMPRESSIBLE.test(type) && st.size > 1024 && st.size < 8e6 && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    let c = gzCache.get(file);
    if (!c || c.etag !== etag) { c = { etag, buf: zlib.gzipSync(await fsp.readFile(file), { level: 9 }) }; gzCache.set(file, c); }
    res.writeHead(200, { ...h, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding', 'Content-Length': c.buf.length });
    res.end(req.method === 'HEAD' ? undefined : c.buf);
    return true;
  }
  // аудио: поддержка Range, иначе Safari не играет трек
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range && type.startsWith('audio/')) {
    const start = range[1] ? +range[1] : Math.max(0, st.size - +range[2]);
    const end = range[1] && range[2] ? Math.min(+range[2], st.size - 1) : st.size - 1;
    if (start >= st.size || start > end) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); res.end(); return true; }
    res.writeHead(206, { ...h, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
    fs.createReadStream(file, { start, end }).pipe(res);
    return true;
  }
  res.writeHead(200, { ...h, 'Content-Length': st.size, ...(type.startsWith('audio/') ? { 'Accept-Ranges': 'bytes' } : {}) });
  if (req.method === 'HEAD') res.end(); else fs.createReadStream(file).pipe(res);
  return true;
}

/* ───────── оболочка приложения ───────── */
const metrika = config.metrikaId ? `<script>(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r){return;}}k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})(window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");ym(${config.metrikaId},"init",{clickmap:true,trackLinks:true,accurateTrackBounce:true,webvisor:true});</script><noscript><div><img src="https://mc.yandex.ru/watch/${config.metrikaId}" style="position:absolute;left:-9999px" alt=""></div></noscript>` : '';
const clientConfig = () => ({
  billing: !!billing, metrika: config.metrikaId || null,
  support: { email: config.legal.email, telegram: config.legal.telegram },
  plans: store.data.plans.filter(p => p.active !== false).sort((a, b) => a.order - b.order),
});
let shellCache = null;
async function renderShell() {
  if (!shellCache || !config.production) {
    const raw = await fsp.readFile(path.join(DIST, 'index.html'), 'utf8');
    const u = config.publicUrl;
    shellCache = raw
      .replace('<!--HEAD-->', `<link rel="canonical" href="${esc(u)}/">
<meta property="og:url" content="${esc(u)}/"><meta property="og:image" content="${esc(u)}/img/og.jpg">
${metrika}`);
  }
  return shellCache.replace('<!--CONFIG-->', `<script>window.WN_CONFIG=${safeJson(clientConfig())}</script>`);
}

/* ───────── публичная страница приглашения ───────── */
const tplCache = new Map();
async function renderInvite(req, res, slug, query) {
  const r = await core.handle({ method: 'GET', path: '/public/invite/' + slug, query });
  if (r.status !== 200) {
    return html(req, res, 404, `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Приглашение не найдено</title><body style="margin:0;font:16px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;background:#faf7f2;color:#2b2724;display:grid;place-items:center;min-height:100vh;text-align:center;padding:24px"><div><p style="letter-spacing:.3em;font-size:12px;color:#a8875a">WEDNELLO</p><h1 style="font:500 34px/1.2 Georgia,serif;margin:.2em 0">Приглашение недоступно</h1><p style="color:#6f675f">${esc(r.data.error)}</p><p style="color:#6f675f">Уточните ссылку у пары, которая вас пригласила.</p></div>`);
  }
  const inv = r.data;
  const t = getTemplate(inv.templateId);
  let page = tplCache.get(t.folder);
  if (!page || !config.production) { page = await fsp.readFile(path.join(DIST, 'templates', t.folder, 'index.html'), 'utf8'); tplCache.set(t.folder, page); }
  const asset = s => (s && s.startsWith('@demo/') ? '../_demo/' + s.slice(6) : s || '');
  const model = resolveModel({ templateId: inv.templateId, data: inv.data }, { asset, brand: inv.brand, guest: inv.guest });
  const boot = { model, mode: 'public', id: inv.id, rsvpEndpoint: `/api/public/rsvp/${encodeURIComponent(slug)}${query.g ? '?g=' + encodeURIComponent(query.g) : ''}` };
  const origin = config.publicUrl;
  const photo = inv.data.photos?.find(p => p.src)?.src;
  const image = photo ? (photo.startsWith('@demo/') ? `${origin}/templates/_demo/${photo.slice(6)}` : photo.startsWith('/') ? origin + photo : photo) : `${origin}/templates/_covers/${t.id}.jpg`;
  const title = `${namesPlain(inv.data.couple)} — приглашение на свадьбу`;
  const desc = `${model.guest ? model.guest.greeting + ' ' : ''}${formatDateLong(inv.data.event.date)}. Ждём вас!`;
  const head = `<base href="/templates/${t.folder}/">
<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(image)}"><meta property="og:url" content="${esc(origin)}/i/${esc(slug)}"><meta name="twitter:card" content="summary_large_image">
<meta name="description" content="${esc(desc)}"><meta name="robots" content="noindex,nofollow"><link rel="icon" href="/favicon.svg" type="image/svg+xml">`;
  const out = page
    .replace(/<head>/i, '<head>\n' + head)
    .replace(/<title>[^<]*<\/title>/i, `<title>${esc(title)}</title>`)
    .replace('<script src="../_runtime/runtime.js"></script>', `<script>window.VZ_BOOT=${safeJson(boot)}</script>\n<script src="../_runtime/runtime.js"></script>`);
  send(req, res, 200, out, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
}

/* ───────── загрузки ───────── */
const SIGNATURES = [
  ['jpg', b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ['png', b => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  ['webp', b => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP'],
  ['gif', b => b.toString('latin1', 0, 4) === 'GIF8'],
  ['mp3', b => b.toString('latin1', 0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)],
  ['m4a', b => b.toString('latin1', 4, 8) === 'ftyp'],
  ['ogg', b => b.toString('latin1', 0, 4) === 'OggS'],
];
async function handleUpload(req, res, token) {
  const me = await core.handle({ method: 'GET', path: '/auth/me', token });
  if (me.status !== 200) return json(req, res, 401, { error: 'Войдите в аккаунт' });
  let body;
  try { body = JSON.parse(await readBody(req, 18 * 1024 * 1024) || '{}'); } catch (e) { if (e.status) throw e; return json(req, res, 400, { error: 'Некорректный запрос' }); }
  const m = /^data:((image|audio)\/[a-z0-9.+-]+);base64,([a-z0-9+/=]+)$/i.exec(body.dataUrl || '');
  if (!m) return json(req, res, 400, { error: 'Поддерживаются изображения (JPG, PNG, WebP) и аудио (MP3, M4A, OGG)' });
  const buf = Buffer.from(m[3], 'base64');
  const kind = SIGNATURES.find(([, test]) => buf.length > 12 && test(buf));
  if (!kind || (m[2] === 'image') !== ['jpg', 'png', 'webp', 'gif'].includes(kind[0])) return json(req, res, 400, { error: 'Файл повреждён или этот формат не поддерживается' });
  const name = `${Date.now().toString(36)}-${uid(12)}.${kind[0]}`;
  await fsp.writeFile(path.join(UPLOADS, name), buf);
  json(req, res, 200, { url: '/uploads/' + name });
}

/* ───────── вебхук ЮKassa ───────── */
async function handleYooKassa(req, res) {
  if (!billing) return json(req, res, 404, { error: 'Оплата не подключена' });
  let body;
  try { body = JSON.parse(await readBody(req, 256 * 1024)); } catch { return json(req, res, 400, { error: 'bad json' }); }
  const id = body?.object?.id;
  if (!id || !/^payment\./.test(body.event || '')) return json(req, res, 200, { ok: true, ignored: true });
  try {
    const r = await core.handleProviderEvent(id);
    console.log(`ЮKassa: ${body.event} ${id} → ${r.status || r.reason}`);
    return json(req, res, 200, { ok: true });
  } catch (e) {
    console.error('ЮKassa: не удалось обработать уведомление', e);
    return json(req, res, 500, { error: 'retry' }); // ЮKassa повторит уведомление
  }
}

/* ───────── SEO ───────── */
const robots = () => `User-agent: *\nAllow: /\nDisallow: /i/\nDisallow: /api/\nDisallow: /uploads/\nDisallow: /templates/\n\nSitemap: ${config.publicUrl}/sitemap.xml\n`;
const sitemap = () => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${['/', '/legal/terms', '/legal/privacy', '/legal/contacts'].map((p, i) => `  <url><loc>${config.publicUrl}${p}</loc><changefreq>${i ? 'yearly' : 'weekly'}</changefreq><priority>${i ? '0.3' : '1.0'}</priority></url>`).join('\n')}\n</urlset>\n`;

/* ───────── сервер ───────── */
const clientIp = req => (config.trustProxy && req.headers['x-forwarded-for']?.split(',')[0].trim()) || req.socket.remoteAddress || '';

const server = http.createServer(async (req, res) => {
  let p;
  const url = new URL(req.url, 'http://x');
  try { p = decodeURIComponent(url.pathname); } catch { return send(req, res, 400, 'Bad request'); }
  const query = Object.fromEntries(url.searchParams);
  const ip = clientIp(req);
  try {
    if (p === '/api/health') return json(req, res, 200, { ok: true, app: 'wednello', demo: config.demo, uptime: Math.round(process.uptime()) });
    if (p.startsWith('/api/')) {
      if (rateLimited(ip, 'api', 600)) return json(req, res, 429, { error: 'Слишком много запросов. Подождите минуту.' });
      const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || null;
      if (p === '/api/billing/yookassa' && req.method === 'POST') return await handleYooKassa(req, res);
      if (p === '/api/uploads' && req.method === 'POST') {
        if (rateLimited(ip, 'upload', 40)) return json(req, res, 429, { error: 'Слишком много загрузок подряд. Подождите минуту.' });
        return await handleUpload(req, res, token);
      }
      if (p.startsWith('/api/public/rsvp/')) {
        if (req.method === 'OPTIONS') return send(req, res, 204, '', { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST' });
        if (rateLimited(ip, 'rsvp', 15)) return json(req, res, 429, { error: 'Слишком много ответов подряд. Попробуйте через минуту.' });
        res.setHeader('Access-Control-Allow-Origin', '*');
      }
      if (p.startsWith('/api/auth/') && req.method === 'POST' && rateLimited(ip, 'auth', 20)) return json(req, res, 429, { error: 'Слишком много попыток. Подождите минуту.' });
      if (p === '/api/auth/forgot' && rateLimited(ip, 'forgot', 5, 3600e3)) return json(req, res, 429, { error: 'Слишком много запросов на восстановление. Попробуйте через час.' });
      const raw = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method) ? await readBody(req, 4 * 1024 * 1024) : '';
      let body;
      try { body = raw ? JSON.parse(raw) : undefined; } catch { return json(req, res, 400, { error: 'Некорректный JSON' }); }
      const r = await core.handle({ method: req.method, path: p, query, body, token });
      return json(req, res, r.status, r.data);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(req, res, 405, 'Method not allowed', { Allow: 'GET, HEAD' });
    const inv = /^\/i\/([a-z0-9-]+)\/?$/.exec(p);
    if (inv) return await renderInvite(req, res, inv[1], query);
    if (p.startsWith('/uploads/')) {
      const f = path.join(UPLOADS, path.basename(p));
      if (await serveFile(req, res, f, 'public, max-age=31536000, immutable')) return;
      return send(req, res, 404, 'Not found');
    }
    const legal = /^\/legal\/(terms|privacy|contacts)\/?$/.exec(p);
    if (legal) return html(req, res, 200, legalPage(legal[1], { legal: config.legal, publicUrl: config.publicUrl, plans: store.data.plans, metrika }), 'public, max-age=600');
    if (p === '/robots.txt') return send(req, res, 200, robots(), { 'Content-Type': TYPES['.txt'], 'Cache-Control': 'public, max-age=3600' });
    if (p === '/sitemap.xml') return send(req, res, 200, sitemap(), { 'Content-Type': TYPES['.xml'], 'Cache-Control': 'public, max-age=3600' });
    if (p === '/' || p === '/index.html') return html(req, res, 200, await renderShell());
    const file = path.normalize(path.join(DIST, p));
    if (file.startsWith(DIST + path.sep)) {
      const cache = p.startsWith('/templates/') || p.startsWith('/img/') || p.startsWith('/fonts/') ? 'public, max-age=86400' : 'no-cache';
      if (await serveFile(req, res, file, cache)) return;
    }
    if (!path.extname(p)) return html(req, res, 200, await renderShell());
    send(req, res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' });
  } catch (e) {
    if (!e.status || e.status >= 500) console.error(req.method, p, e);
    if (!res.headersSent) json(req, res, e.status || 500, { error: e.status ? e.message : 'Внутренняя ошибка сервера' });
    else res.destroy();
  }
});
server.requestTimeout = 60_000;
server.headersTimeout = 20_000;
server.keepAliveTimeout = 65_000;

server.listen(config.port, config.host, () => {
  console.log(`WEDNELLO запущен: ${config.publicUrl} (порт ${config.port}, данные: ${DATA})${config.demo ? '  · демо-вход: demo@wednello.ru / demo123' : ''}`);
  console.log(`Почта: ${sendMail ? 'SMTP ' + config.smtp.host : 'не настроена'} · Оплата: ${billing ? 'ЮKassa' : 'не настроена'} · Метрика: ${config.metrikaId || 'нет'}`);
  for (const w of configWarnings()) console.warn('⚠ ' + w);
});

/* резервные копии: при старте и раз в сутки */
setTimeout(backup, 5_000).unref();
setInterval(backup, 24 * 3600e3).unref();

/* корректное завершение: дописываем базу на диск */
let stopping = false;
function shutdown(sig) {
  if (stopping) return; stopping = true;
  console.log(`${sig}: останавливаемся…`);
  server.close();
  try { flushSync(); } catch (e) { console.error('Не удалось сохранить базу при остановке', e); }
  setTimeout(() => process.exit(0), 300).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', e => console.error('unhandledRejection', e));
