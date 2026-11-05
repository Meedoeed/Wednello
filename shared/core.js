// Бизнес-логика и API WEDNELLO. Работает одинаково на Node-сервере и в браузере (демо-режим):
// хранилище передаётся снаружи, пароли хэширует переданная функция.
import { uid, clone, defaultData, normalizeData, slugify, readiness, guestGreeting, presetItems } from './model.js';
import { TEMPLATES, getTemplate } from './templates.js';

export const FEATURES = [
  { key: 'allTemplates', label: 'Все шаблоны', hint: 'Без него доступны «Ivory Letter» и «Кинопремьера»' },
  { key: 'music', label: 'Музыка в приглашении' },
  { key: 'removeBadge', label: 'Без отметки «Сделано в WEDNELLO»' },
  { key: 'export', label: 'Выгрузка гостей и ответов в Excel' },
  { key: 'support', label: 'Личный помощник', hint: 'Поможем с текстами и настройкой' },
];
export const LIMITS = [
  { key: 'projects', label: 'Приглашений' },
  { key: 'guests', label: 'Гостей в приглашении' },
];
export const BASIC_TEMPLATES = ['ivory', 'cinema'];

export const DEFAULT_PLANS = [
  {
    id: 'personal', name: 'Личный', price: 0, period: 'мес', order: 1, highlight: true, active: true,
    description: 'Аккаунт пары: все шаблоны и функции. Оплата будет подключена позже.',
    limits: { projects: 10, guests: 500, team: 2 },
    features: { allTemplates: true, music: true, couplePortal: true, whiteLabel: false, removeBadge: false, export: true },
  },
];

export class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}
const bad = (m, s = 400, extra) => { throw new HttpError(s, m, extra); };
const now = () => new Date().toISOString();

export function emptyDb() {
  return { version: 1, plans: clone(DEFAULT_PLANS), workspaces: [], users: [], members: [], sessions: [], projects: [], guests: [], responses: [] };
}

/* ───────── роутер ───────── */
function compile(routes) {
  return routes.map(([method, pattern, handler, opts = {}]) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
    return { method, re, keys, handler, opts };
  });
}

export function createCore({ store, hashPassword, verifyPassword, isDemo = false, publicBase = '' }) {
  const db = () => store.data;
  const save = () => store.save();

  /* ───────── помощники ───────── */
  const planOf = ws => db().plans.find(p => p.id === ws?.planId) || db().plans[0] || DEFAULT_PLANS[0];
  const wsOf = id => db().workspaces.find(w => w.id === id);
  const userOf = id => db().users.find(u => u.id === id);
  const publicUser = u => u && { id: u.id, email: u.email, name: u.name, isPlatformAdmin: !!u.isPlatformAdmin };

  function session(token) {
    if (!token) return null;
    const s = db().sessions.find(x => x.token === token);
    if (!s) return null;
    if (s.expiresAt && s.expiresAt < now()) return null;
    return s;
  }
  function auth(ctx, { allowCouple = false } = {}) {
    const s = session(ctx.token);
    if (!s) bad('Войдите в аккаунт', 401);
    if (s.kind === 'couple') {
      if (!allowCouple) bad('Недостаточно прав', 403);
      const p = db().projects.find(x => x.id === s.projectId);
      if (!p) bad('Приглашение не найдено', 404);
      return { s, role: 'couple', ws: wsOf(p.workspaceId), project: p };
    }
    const user = userOf(s.userId);
    if (!user) bad('Войдите в аккаунт', 401);
    const member = db().members.find(m => m.userId === user.id && m.workspaceId === s.workspaceId);
    if (!member) bad('Нет доступа', 403);
    return { s, user, role: member.role, ws: wsOf(s.workspaceId) };
  }
  function projectFor(a, id) {
    const p = db().projects.find(x => x.id === id);
    if (!p) bad('Приглашение не найдено', 404);
    if (a.role === 'couple' ? a.project.id !== p.id : p.workspaceId !== a.ws.id) bad('Нет доступа к приглашению', 403);
    return p;
  }
  function newSession(fields) {
    const s = { token: uid(32), createdAt: now(), expiresAt: new Date(Date.now() + 1000 * 3600 * 24 * 60).toISOString(), ...fields };
    db().sessions.push(s);
    return s.token;
  }
  function templateAllowed(ws, templateId) {
    const plan = planOf(ws);
    return plan.features.allTemplates || BASIC_TEMPLATES.includes(templateId);
  }
  function brandFor(ws) {
    const plan = planOf(ws);
    if (!plan.features.removeBadge) return { text: 'Создано в WEDNELLO', url: '' };
    return null;
  }

  function projectStats(p) {
    const guests = db().guests.filter(g => g.projectId === p.id);
    const resp = db().responses.filter(r => r.projectId === p.id && !r.test);
    const yes = resp.filter(r => r.attending), no = resp.filter(r => !r.attending);
    return {
      guests: guests.length,
      seats: guests.reduce((s, g) => s + (+g.seats || 1), 0),
      opened: guests.filter(g => g.openedAt).length,
      sent: guests.filter(g => g.invitedAt).length,
      responses: resp.length,
      yes: yes.length, no: no.length,
      people: yes.reduce((s, r) => s + (+r.guests || 1), 0),
      pending: guests.filter(g => !resp.some(r => r.guestId === g.id)).length,
      lastResponseAt: resp.map(r => r.createdAt).sort().pop() || null,
    };
  }
  function projectOut(p, { full = false } = {}) {
    const out = {
      id: p.id, title: p.title, templateId: p.templateId, status: p.status, slug: p.slug,
      client: p.client || {}, createdAt: p.createdAt, updatedAt: p.updatedAt, publishedAt: p.publishedAt || null,
      dirty: p.status === 'published' && p.publishedRev !== p.rev,
      readyForReview: p.readyForReview || null, archived: !!p.archived,
      couple: { a: p.data?.couple?.a, b: p.data?.couple?.b }, date: p.data?.event?.date,
      cover: p.data?.photos?.find(x => x.src)?.src || null,
      stats: projectStats(p),
      readiness: readiness(p).filter(x => x.ok).length + '/' + readiness(p).length,
    };
    if (full) { out.data = p.data; out.coupleToken = p.coupleToken; out.rev = p.rev; out.settings = p.settings || {}; }
    return out;
  }
  function meOut(a) {
    const plan = planOf(a.ws);
    return {
      user: a.role === 'couple' ? null : publicUser(a.user),
      role: a.role,
      projectId: a.role === 'couple' ? a.project.id : null,
      workspace: wsOut(a.ws),
      plan,
      usage: {
        projects: db().projects.filter(p => p.workspaceId === a.ws.id && !p.archived).length,
      },
      isDemo,
    };
  }
  const wsOut = w => w && { id: w.id, name: w.name, brand: w.brand || {}, planId: w.planId, createdAt: w.createdAt, contact: w.contact || {} };

  function uniqueSlug(base, exceptId) {
    let s = slugify(base), i = 1, cand = s;
    while (db().projects.some(p => p.slug === cand && p.id !== exceptId)) cand = `${s}-${++i}`;
    return cand;
  }

  function createWorkspace({ name, ownerId, planId = 'free' }) {
    const ws = { id: uid(), name, planId, createdAt: now(), brand: { color: '', logo: '', footerText: '', site: '' }, contact: {} };
    db().workspaces.push(ws);
    db().members.push({ workspaceId: ws.id, userId: ownerId, role: 'owner', createdAt: now() });
    return ws;
  }
  function createProject(ws, { title, templateId, client, data }) {
    templateId = getTemplate(templateId).id;
    const p = {
      id: uid(), workspaceId: ws.id, title: title || 'Новое приглашение', templateId,
      data: normalizeData(data || defaultData(templateId), templateId),
      status: 'draft', slug: '', rev: 1, publishedRev: 0, client: client || {},
      coupleToken: uid(20), createdAt: now(), updatedAt: now(), settings: { couplePublish: true },
    };
    db().projects.push(p);
    return p;
  }
  function addGuests(p, items, ws) {
    const plan = planOf(ws);
    const count = db().guests.filter(g => g.projectId === p.id).length;
    if (count + items.length > plan.limits.guests) bad(`На тарифе «${plan.name}» — до ${plan.limits.guests} гостей в приглашении`, 402, { limit: 'guests' });
    const out = items.filter(x => x && String(x.name || '').trim()).map(x => ({
      id: uid(), projectId: p.id, token: uid(10),
      name: String(x.name).trim().slice(0, 120), salutation: x.salutation || 'Дорогие', custom: x.custom || '',
      seats: Math.max(1, Math.min(10, +x.seats || 1)), group: String(x.group || '').slice(0, 60),
      side: x.side || '', phone: x.phone || '', email: x.email || '', note: x.note || '',
      invitedAt: null, openedAt: null, opens: 0, createdAt: now(),
    }));
    db().guests.push(...out);
    return out;
  }
  function guestOut(g) {
    const r = db().responses.filter(x => x.guestId === g.id && !x.test).sort((a, b) => a.createdAt < b.createdAt ? 1 : -1)[0];
    return { ...g, greeting: guestGreeting(g), response: r ? { attending: r.attending, guests: r.guests, createdAt: r.createdAt } : null };
  }
  function normalizeResponse(body) {
    // формат Ivory: { invitationId, submittedAt, answers: { name, attending, guests, food, note, q_* } }
    if (body && body.answers && 'attending' in body.answers && !('attending' in body)) {
      const a = body.answers;
      const extra = {};
      for (const [k, v] of Object.entries(a)) if (k.startsWith('q_') && v) extra[k] = String(v);
      return { name: a.name, attending: a.attending === 'yes', guests: a.attending === 'yes' ? +(a.guests || 1) : 0, food: a.food || '', wish: a.note || '', answers: extra };
    }
    return body || {};
  }

  /* ───────── маршруты ───────── */
  const routes = compile([
    /* авторизация */
    ['POST', '/auth/register', async ctx => {
      const { email, password, name, studio } = ctx.body || {};
      if (!/^\S+@\S+\.\S+$/.test(email || '')) bad('Укажите корректный e-mail');
      if (String(password || '').length < 6) bad('Пароль — не короче 6 символов');
      if (db().users.some(u => u.email.toLowerCase() === email.toLowerCase())) bad('Такой e-mail уже зарегистрирован');
      const user = { id: uid(), email: email.trim(), name: (name || '').trim() || email.split('@')[0], passwordHash: await hashPassword(password), createdAt: now() };
      db().users.push(user);
      const ws = createWorkspace({ name: user.name, ownerId: user.id, planId: 'free' });
      const token = newSession({ kind: 'user', userId: user.id, workspaceId: ws.id });
      save();
      return { token, me: meOut({ user, ws, role: 'owner' }) };
    }],
    ['POST', '/auth/login', async ctx => {
      const { email, password } = ctx.body || {};
      const user = db().users.find(u => u.email.toLowerCase() === String(email || '').toLowerCase());
      if (!user || !(await verifyPassword(password || '', user.passwordHash))) bad('Неверный e-mail или пароль', 401);
      const m = db().members.find(x => x.userId === user.id);
      if (!m) bad('У пользователя нет студии', 403);
      const token = newSession({ kind: 'user', userId: user.id, workspaceId: m.workspaceId });
      save();
      return { token, me: meOut({ user, ws: wsOf(m.workspaceId), role: m.role }) };
    }],
    ['POST', '/auth/logout', async ctx => {
      const d = db(); d.sessions = d.sessions.filter(s => s.token !== ctx.token); save(); return { ok: true };
    }],
    ['GET', '/auth/me', async ctx => meOut(auth(ctx, { allowCouple: true }))],

    /* студия */
    ['PATCH', '/workspace', async ctx => {
      const a = auth(ctx);
      const { name, brand, contact } = ctx.body || {};
      if (name !== undefined) { a.ws.name = String(name).slice(0, 80) || a.ws.name; if (a.user) a.user.name = a.ws.name; }
      if (brand) a.ws.brand = { ...a.ws.brand, ...brand };
      if (contact) a.ws.contact = { ...a.ws.contact, ...contact };
      save(); return meOut(a);
    }],
    ['POST', '/workspace/plan', async ctx => {
      const a = auth(ctx);
            const plan = db().plans.find(p => p.id === ctx.body?.planId && p.active !== false);
      if (!plan) bad('Тариф не найден', 404);
      const used = db().projects.filter(p => p.workspaceId === a.ws.id && !p.archived).length;
      if (used > plan.limits.projects) bad(`Сейчас активно ${used} приглашений, а в тарифе «${plan.name}» — ${plan.limits.projects}. Отправьте лишние в архив.`, 409);
      a.ws.planId = plan.id; save(); return meOut(a);
    }],
    /* тарифы */
    ['GET', '/plans', async () => db().plans.slice().sort((a, b) => a.order - b.order)],
    ['PUT', '/plans', async ctx => {
      const a = auth(ctx);
      if (!a.user.isPlatformAdmin) bad('Тарифы редактирует администратор сервиса', 403);
      const list = Array.isArray(ctx.body) ? ctx.body : bad('Ожидается список тарифов');
      if (!list.length) bad('Нужен хотя бы один тариф');
      const ids = new Set();
      const plans = list.map((p, i) => {
        const id = slugify(p.id || p.name || 'plan-' + i);
        if (ids.has(id)) bad(`Повторяется код тарифа «${id}»`); ids.add(id);
        return {
          id, name: String(p.name || 'Тариф').slice(0, 40), description: String(p.description || '').slice(0, 200),
          price: Math.max(0, Math.round(+p.price || 0)), period: p.period || 'мес', order: i + 1,
          highlight: !!p.highlight, active: p.active !== false,
          limits: Object.fromEntries(LIMITS.map(l => [l.key, Math.max(0, Math.round(+p.limits?.[l.key] || 0))])),
          features: Object.fromEntries(FEATURES.map(f => [f.key, !!p.features?.[f.key]])),
        };
      });
      for (const w of db().workspaces) if (!plans.some(p => p.id === w.planId)) w.planId = plans[0].id;
      db().plans = plans; save(); return plans;
    }],

    /* приглашения */
    ['GET', '/projects', async ctx => {
      const a = auth(ctx);
      return db().projects.filter(p => p.workspaceId === a.ws.id).sort((x, y) => (x.updatedAt < y.updatedAt ? 1 : -1)).map(p => projectOut(p));
    }],
    ['POST', '/projects', async ctx => {
      const a = auth(ctx);
      const plan = planOf(a.ws);
      const used = db().projects.filter(p => p.workspaceId === a.ws.id && !p.archived).length;
      if (used >= plan.limits.projects) bad(`На тарифе «${plan.name}» — до ${plan.limits.projects} активных приглашений. Перейдите на тариф выше или удалите черновик.`, 402, { limit: 'projects' });
      const { templateId, title, client, couple, date, preset, city } = ctx.body || {};
      if (!templateAllowed(a.ws, templateId)) bad('Шаблон доступен на тарифе выше', 402, { limit: 'template' });
      const data = defaultData(templateId);
      if (couple?.a) data.couple.a = couple.a;
      if (couple?.b) data.couple.b = couple.b;
      if (date) data.event.date = date;
      if (city) data.event.city = String(city).slice(0, 60);
      if (preset) data.program = presetItems(preset);
      const p = createProject(a.ws, { title: title || [data.couple.a, data.couple.b].filter(Boolean).join(' и '), templateId, client, data });
      save(); return projectOut(p, { full: true });
    }],
    ['GET', '/projects/:id', async ctx => {
      const a = auth(ctx, { allowCouple: true });
      return projectOut(projectFor(a, ctx.params.id), { full: true });
    }],
    ['PATCH', '/projects/:id', async ctx => {
      const a = auth(ctx, { allowCouple: true });
      const p = projectFor(a, ctx.params.id);
      const b = ctx.body || {};
      if (b.baseRev && b.baseRev !== p.rev && !b.force) bad('Приглашение изменили в другой вкладке. Обновите страницу.', 409, { rev: p.rev });
      if (b.templateId && b.templateId !== p.templateId) {
        if (!templateAllowed(a.ws, b.templateId)) bad('Шаблон доступен на тарифе выше', 402, { limit: 'template' });
        p.templateId = getTemplate(b.templateId).id;
      }
      if (b.title !== undefined) p.title = String(b.title).slice(0, 120);
      if (b.client && a.role !== 'couple') p.client = { ...p.client, ...b.client };
      if (b.settings && a.role !== 'couple') p.settings = { ...p.settings, ...b.settings };
      if (b.data) p.data = normalizeData(b.data, p.templateId);
      if (b.archived !== undefined && a.role !== 'couple') {
        if (!b.archived && p.archived) {
          const plan = planOf(a.ws); const used = db().projects.filter(x => x.workspaceId === a.ws.id && !x.archived).length;
          if (used >= plan.limits.projects) bad(`Лимит тарифа «${plan.name}»: ${plan.limits.projects} активных приглашений`, 402);
        }
        p.archived = !!b.archived;
      }
      if (b.readyForReview !== undefined) p.readyForReview = b.readyForReview ? now() : null;
      p.rev += 1; p.updatedAt = now();
      save(); return projectOut(p, { full: true });
    }],
    ['DELETE', '/projects/:id', async ctx => {
      const a = auth(ctx);
      const p = projectFor(a, ctx.params.id);
      const d = db();
      d.projects = d.projects.filter(x => x.id !== p.id);
      d.guests = d.guests.filter(g => g.projectId !== p.id);
      d.responses = d.responses.filter(r => r.projectId !== p.id);
      d.sessions = d.sessions.filter(s => s.projectId !== p.id);
      save(); return { ok: true };
    }],
    ['POST', '/projects/:id/duplicate', async ctx => {
      const a = auth(ctx);
      const src = projectFor(a, ctx.params.id);
      const plan = planOf(a.ws);
      const used = db().projects.filter(p => p.workspaceId === a.ws.id && !p.archived).length;
      if (used >= plan.limits.projects) bad(`Лимит тарифа «${plan.name}»: ${plan.limits.projects} активных приглашений`, 402, { limit: 'projects' });
      const p = createProject(a.ws, { title: src.title + ' (копия)', templateId: src.templateId, client: clone(src.client), data: clone(src.data) });
      save(); return projectOut(p, { full: true });
    }],
    ['POST', '/projects/:id/publish', async ctx => {
      const a = auth(ctx, { allowCouple: true });
      const p = projectFor(a, ctx.params.id);
            const want = ctx.body?.slug ? slugify(ctx.body.slug) : (p.slug || [p.data.couple.a, p.data.couple.b].filter(Boolean).join('-i-') || p.title);
      if (db().projects.some(x => x.slug === want && x.id !== p.id) && ctx.body?.slug) bad('Этот адрес уже занят — попробуйте другой');
      p.slug = uniqueSlug(want, p.id);
      p.published = { templateId: p.templateId, data: clone(p.data) };
      p.status = 'published'; p.publishedRev = p.rev; p.publishedAt = now(); p.readyForReview = null;
      save(); return projectOut(p, { full: true });
    }],
    ['POST', '/projects/:id/unpublish', async ctx => {
      const a = auth(ctx);
      const p = projectFor(a, ctx.params.id);
      p.status = 'draft'; save(); return projectOut(p, { full: true });
    }],
    /* гости */
    ['GET', '/projects/:id/guests', async ctx => {
      const a = auth(ctx, { allowCouple: true });
      const p = projectFor(a, ctx.params.id);
      return db().guests.filter(g => g.projectId === p.id).map(guestOut);
    }],
    ['POST', '/projects/:id/guests', async ctx => {
      const a = auth(ctx, { allowCouple: true });
      const p = projectFor(a, ctx.params.id);
      const items = Array.isArray(ctx.body?.items) ? ctx.body.items : [ctx.body];
      const out = addGuests(p, items, a.ws);
      save(); return out.map(guestOut);
    }],
    ['PATCH', '/guests/:id', async ctx => {
      const a = auth(ctx, { allowCouple: true });
      const g = db().guests.find(x => x.id === ctx.params.id) || bad('Гость не найден', 404);
      projectFor(a, g.projectId);
      const b = ctx.body || {};
      for (const k of ['name', 'salutation', 'custom', 'group', 'side', 'phone', 'email', 'note']) if (b[k] !== undefined) g[k] = String(b[k]).slice(0, 200);
      if (b.seats !== undefined) g.seats = Math.max(1, Math.min(10, +b.seats || 1));
      if (b.invited !== undefined) g.invitedAt = b.invited ? now() : null;
      save(); return guestOut(g);
    }],
    ['DELETE', '/guests/:id', async ctx => {
      const a = auth(ctx, { allowCouple: true });
      const g = db().guests.find(x => x.id === ctx.params.id) || bad('Гость не найден', 404);
      projectFor(a, g.projectId);
      const d = db(); d.guests = d.guests.filter(x => x.id !== g.id);
      d.responses.forEach(r => { if (r.guestId === g.id) r.guestId = null; });
      save(); return { ok: true };
    }],

    /* ответы */
    ['GET', '/projects/:id/responses', async ctx => {
      const a = auth(ctx, { allowCouple: true });
      const p = projectFor(a, ctx.params.id);
      return db().responses.filter(r => r.projectId === p.id).sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1))
        .map(r => ({ ...r, guestName: r.guestId ? db().guests.find(g => g.id === r.guestId)?.name : null }));
    }],
    ['DELETE', '/responses/:id', async ctx => {
      const a = auth(ctx, { allowCouple: true });
      const r = db().responses.find(x => x.id === ctx.params.id) || bad('Ответ не найден', 404);
      projectFor(a, r.projectId);
      db().responses = db().responses.filter(x => x.id !== r.id); save(); return { ok: true };
    }],
    ['GET', '/activity', async ctx => {
      const a = auth(ctx);
      const ids = new Set(db().projects.filter(p => p.workspaceId === a.ws.id).map(p => p.id));
      return db().responses.filter(r => ids.has(r.projectId) && !r.test).sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1)).slice(0, 12)
        .map(r => ({ ...r, projectTitle: db().projects.find(p => p.id === r.projectId)?.title }));
    }],

    /* загрузки (демо-режим: файл приходит как data URL; сервер обрабатывает /uploads сам) */
    ['POST', '/uploads', async ctx => {
      auth(ctx, { allowCouple: true });
      const url = ctx.body?.dataUrl;
      if (!/^data:(image|audio)\//.test(url || '')) bad('Поддерживаются изображения и аудио');
      return { url };
    }],

    /* публичная часть */
    ['GET', '/public/invite/:slug', async ctx => {
      const p = db().projects.find(x => x.slug === ctx.params.slug && x.status === 'published' && !x.archived);
      if (!p) bad('Приглашение не найдено или снято с публикации', 404);
      const ws = wsOf(p.workspaceId);
      const plan = planOf(ws);
      let guest = null;
      if (ctx.query.g) {
        guest = db().guests.find(g => g.projectId === p.id && g.token === ctx.query.g) || null;
        if (guest && !ctx.query.peek) { guest.opens = (guest.opens || 0) + 1; guest.openedAt = guest.openedAt || now(); save(); }
      }
      const data = clone(p.published?.data || p.data);
      if (!plan.features.music) data.music = { ...data.music, enabled: false };
      return {
        id: p.id, slug: p.slug, templateId: p.published?.templateId || p.templateId, data,
        brand: brandFor(ws), guest: guest && { name: guest.name, salutation: guest.salutation, custom: guest.custom, seats: guest.seats },
      };
    }],
    ['POST', '/public/rsvp/:slug', async ctx => {
      const p = db().projects.find(x => x.slug === ctx.params.slug && x.status === 'published' && !x.archived);
      if (!p) bad('Приглашение не найдено', 404);
      const b = normalizeResponse(ctx.body);
      const name = String(b.name || '').trim().slice(0, 120);
      if (!name) bad('Укажите имя');
      const guest = ctx.query.g ? db().guests.find(g => g.projectId === p.id && g.token === ctx.query.g) : null;
      const answers = {};
      for (const [k, v] of Object.entries(b.answers || {}).slice(0, 20)) answers[String(k).slice(0, 120)] = String(v).slice(0, 500);
      const r = {
        id: uid(), projectId: p.id, guestId: guest?.id || null, name, attending: !!b.attending,
        guests: b.attending ? Math.max(1, Math.min(10, +b.guests || 1)) : 0,
        food: String(b.food || '').slice(0, 300), wish: String(b.wish || '').slice(0, 2000), answers, createdAt: now(),
      };
      const d = db();
      if (guest) d.responses = d.responses.filter(x => x.guestId !== guest.id);
      d.responses.push(r);
      save(); return { ok: true };
    }],
  ]);

  async function handle({ method, path, query = {}, body, token }) {
    const clean = path.replace(/^\/api/, '').split('?')[0];
    for (const r of routes) {
      if (r.method !== method) continue;
      const m = r.re.exec(clean);
      if (!m) continue;
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      try {
        const data = await r.handler({ params, query, body, token });
        return { status: 200, data };
      } catch (e) {
        if (e instanceof HttpError) return { status: e.status, data: { error: e.message, ...(e.extra || {}) } };
        console.error(e);
        return { status: 500, data: { error: 'Внутренняя ошибка сервера' } };
      }
    }
    return { status: 404, data: { error: 'Не найдено' } };
  }

  return { handle, createWorkspace, createProject, addGuests, planOf, wsOf, brandFor, uniqueSlug };
}

export { TEMPLATES };
