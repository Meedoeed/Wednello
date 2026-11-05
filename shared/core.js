// Бизнес-логика и API WEDNELLO. Работает одинаково на Node-сервере и в браузере (демо-режим):
// хранилище передаётся снаружи, пароли хэширует переданная функция.
import { uid, clone, defaultData, normalizeData, slugify, readiness, guestGreeting, presetItems } from './model.js';
import { TEMPLATES, getTemplate, FREE_TEMPLATES } from './templates.js';

export const FEATURES = [
  { key: 'allTemplates', label: 'Все шаблоны', hint: 'Без него публикуются только бесплатные шаблоны' },
  { key: 'music', label: 'Музыка в приглашении' },
  { key: 'removeBadge', label: 'Без отметки «Сделано в WEDNELLO»' },
  { key: 'export', label: 'Выгрузка гостей и ответов в Excel' },
  { key: 'support', label: 'Личный помощник', hint: 'Поможем с текстами и настройкой' },
];
export const LIMITS = [
  { key: 'projects', label: 'Приглашений' },
  { key: 'guests', label: 'Гостей в приглашении' },
];
export const BASIC_TEMPLATES = FREE_TEMPLATES;

/**
 * Тарифы. «Бесплатный» — навсегда, «Премиум» — разовая оплата на durationDays дней
 * (приглашения остаются доступны гостям и после окончания срока).
 */
export const DEFAULT_PLANS = [
  {
    id: 'free', name: 'Бесплатный', price: 0, period: 'навсегда', durationDays: 0, order: 1, highlight: false, active: true,
    description: 'Чтобы попробовать и разослать простое приглашение.',
    limits: { projects: 1, guests: 40 },
    features: { allTemplates: false, music: false, removeBadge: false, export: false, support: false },
  },
  {
    id: 'premium', name: 'Премиум', price: 1490, period: 'разово', durationDays: 365, order: 2, highlight: true, active: true,
    description: 'Всё для свадьбы: анимированные шаблоны, музыка, гости без ограничений.',
    limits: { projects: 5, guests: 1000 },
    features: { allTemplates: true, music: true, removeBadge: true, export: true, support: true },
  },
];
export const FREE_PLAN_ID = 'free';

export class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}
const bad = (m, s = 400, extra) => { throw new HttpError(s, m, extra); };
const now = () => new Date().toISOString();

export const DB_VERSION = 2;
export function emptyDb() {
  return { version: DB_VERSION, plans: clone(DEFAULT_PLANS), workspaces: [], users: [], members: [], sessions: [], projects: [], guests: [], responses: [], payments: [], resets: [] };
}

/** Миграция старой базы на текущую схему (идемпотентно) */
export function migrateDb(d) {
  const base = emptyDb();
  for (const k of Object.keys(base)) if (d[k] === undefined) d[k] = base[k];
  if ((d.version || 1) < 2) {
    // v1: единственный тариф «personal» → новые тарифы; всем существующим — бесплатный
    d.plans = clone(DEFAULT_PLANS);
    for (const w of d.workspaces) if (!d.plans.some(p => p.id === w.planId)) w.planId = FREE_PLAN_ID;
  }
  d.version = DB_VERSION;
  return d;
}

/* ───────── роутер ───────── */
function compile(routes) {
  return routes.map(([method, pattern, handler, opts = {}]) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
    return { method, re, keys, handler, opts };
  });
}

/**
 * hooks (необязательные, задаёт сервер):
 *   sendMail({ to, subject, text, html })          — письма (сброс пароля, новые ответы)
 *   billing.createPayment({ payment, plan, user, ws }) → { providerId, confirmationUrl }
 *   billing.fetchPayment(providerId)                 → { id, status, paid, amount: { value, currency }, metadata }
 *   publicUrl                                        — внешний адрес сайта для ссылок в письмах
 *   adminEmails                                      — e-mail администраторов платформы
 */
export function createCore({ store, hashPassword, verifyPassword, isDemo = false, hooks = {} }) {
  const db = () => store.data;
  const save = () => store.save();
  migrateDb(store.data);
  const adminEmails = new Set((hooks.adminEmails || []).map(e => String(e).trim().toLowerCase()).filter(Boolean));
  const publicUrl = (hooks.publicUrl || '').replace(/\/$/, '');
  const mail = msg => Promise.resolve(hooks.sendMail ? hooks.sendMail(msg) : null).catch(e => console.error('Письмо не отправлено:', e.message));

  /* ───────── помощники ───────── */
  const freePlan = () => db().plans.find(p => p.id === FREE_PLAN_ID) || db().plans.find(p => !p.price) || db().plans[0] || DEFAULT_PLANS[0];
  const planOf = ws => {
    const p = db().plans.find(x => x.id === ws?.planId);
    if (!p) return freePlan();
    if (p.price > 0 && ws.planUntil && ws.planUntil < now()) return freePlan(); // срок оплаченного тарифа истёк
    return p;
  };
  const wsOf = id => db().workspaces.find(w => w.id === id);
  const userOf = id => db().users.find(u => u.id === id);
  const isAdmin = u => !!u && (!!u.isPlatformAdmin || adminEmails.has(String(u.email).toLowerCase()));
  const publicUser = u => u && { id: u.id, email: u.email, name: u.name, isPlatformAdmin: isAdmin(u) };
  const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || '') && String(e).length <= 120;
  const pwOk = p => { const s = String(p || ''); if (s.length < 8) bad('Пароль — не короче 8 символов'); if (s.length > 200) bad('Слишком длинный пароль'); };
  const sha256 = async s => {
    const b = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s)));
    return Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join('');
  };
  const pruneSessions = () => { const t = now(); const d = db(); d.sessions = d.sessions.filter(s => !s.expiresAt || s.expiresAt > t); d.resets = (d.resets || []).filter(r => r.expiresAt > t && !r.usedAt); };

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
      planUntil: plan.price > 0 ? a.ws.planUntil || null : null,
      usage: {
        projects: db().projects.filter(p => p.workspaceId === a.ws.id && !p.archived).length,
      },
      notify: { rsvp: a.ws.notify?.rsvp !== false },
      billing: isDemo || !!hooks.billing,
      isDemo,
    };
  }
  const wsOut = w => w && { id: w.id, name: w.name, brand: w.brand || {}, planId: w.planId, createdAt: w.createdAt, contact: w.contact || {} };

  function uniqueSlug(base, exceptId) {
    let s = slugify(base), i = 1, cand = s;
    while (db().projects.some(p => p.slug === cand && p.id !== exceptId)) cand = `${s}-${++i}`;
    return cand;
  }

  function createWorkspace({ name, ownerId, planId = FREE_PLAN_ID }) {
    const ws = { id: uid(), name, planId, planUntil: null, createdAt: now(), brand: { color: '', logo: '', footerText: '', site: '' }, contact: {}, notify: { rsvp: true } };
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
    const valid = items.filter(x => x && String(x.name || '').trim()).length;
    if (count + valid > plan.limits.guests) bad(`На тарифе «${plan.name}» — до ${plan.limits.guests} гостей в приглашении. Перейдите на «Премиум», чтобы добавить больше.`, 402, { limit: 'guests' });
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

  /* ───────── оплата ───────── */
  function paymentOut(p) {
    return { id: p.id, planId: p.planId, planName: db().plans.find(x => x.id === p.planId)?.name || p.planId, amount: p.amount, status: p.status, createdAt: p.createdAt, paidAt: p.paidAt || null };
  }
  /** Активирует тариф по оплаченному платежу. Идемпотентно: повторный вызов ничего не меняет. */
  function activatePayment(pay) {
    if (pay.appliedAt) return false;
    const ws = wsOf(pay.workspaceId); if (!ws) return false;
    const plan = db().plans.find(x => x.id === pay.planId); if (!plan) return false;
    const base = ws.planId === plan.id && ws.planUntil && ws.planUntil > now() ? Date.parse(ws.planUntil) : Date.now();
    ws.planId = plan.id;
    ws.planUntil = plan.durationDays ? new Date(base + plan.durationDays * 864e5).toISOString() : null;
    pay.status = 'succeeded'; pay.paidAt = pay.paidAt || now(); pay.appliedAt = now();
    save();
    return true;
  }
  /** Сверяет платёж с данными платёжной системы (вызывается из вебхука и при возврате пользователя) */
  async function syncPayment(pay) {
    if (!hooks.billing || !pay.providerId || pay.appliedAt) return pay;
    const remote = await hooks.billing.fetchPayment(pay.providerId);
    if (!remote) return pay;
    const amountOk = Math.round(+remote.amount?.value * 100) === Math.round(pay.amount * 100) && (remote.amount?.currency || 'RUB') === 'RUB';
    if (remote.status === 'succeeded' && remote.paid !== false && amountOk) activatePayment(pay);
    else if (remote.status === 'canceled') { pay.status = 'canceled'; pay.cancelReason = remote.cancellation_details?.reason || ''; save(); }
    else if (remote.status === 'succeeded' && !amountOk) { pay.status = 'mismatch'; save(); console.error('Сумма платежа не совпадает', pay.id, remote.amount); }
    return pay;
  }
  async function handleProviderEvent(providerId) {
    const pay = db().payments.find(p => p.providerId === providerId);
    if (!pay) return { ok: false, reason: 'unknown payment' };
    await syncPayment(pay);
    return { ok: true, status: pay.status };
  }

  function wipeWorkspace(ws) {
    const d = db();
    const pids = new Set(d.projects.filter(p => p.workspaceId === ws.id).map(p => p.id));
    d.projects = d.projects.filter(p => !pids.has(p.id));
    d.guests = d.guests.filter(g => !pids.has(g.projectId));
    d.responses = d.responses.filter(r => !pids.has(r.projectId));
    d.sessions = d.sessions.filter(s => s.workspaceId !== ws.id && !pids.has(s.projectId));
    d.members = d.members.filter(m => m.workspaceId !== ws.id);
    d.workspaces = d.workspaces.filter(w => w.id !== ws.id);
    return pids;
  }

  /* ───────── маршруты ───────── */
  const routes = compile([
    /* авторизация */
    ['POST', '/auth/register', async ctx => {
      const { password, name, consent } = ctx.body || {};
      const email = String(ctx.body?.email || '').trim();
      if (!emailOk(email)) bad('Укажите корректный e-mail');
      pwOk(password);
      if (!consent && !isDemo) bad('Нужно согласие с условиями и политикой конфиденциальности');
      if (db().users.some(u => u.email.toLowerCase() === email.toLowerCase())) bad('Такой e-mail уже зарегистрирован. Войдите или восстановите пароль.');
      const user = { id: uid(), email, name: String(name || '').trim().slice(0, 80) || email.split('@')[0], passwordHash: await hashPassword(password), createdAt: now(), consentAt: now() };
      db().users.push(user);
      const ws = createWorkspace({ name: user.name, ownerId: user.id });
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
      pruneSessions();
      user.lastLoginAt = now();
      const token = newSession({ kind: 'user', userId: user.id, workspaceId: m.workspaceId });
      save();
      return { token, me: meOut({ user, ws: wsOf(m.workspaceId), role: m.role }) };
    }],
    ['POST', '/auth/couple', async ctx => {
      const t = String(ctx.body?.token || '');
      const p = t.length >= 16 && db().projects.find(x => x.coupleToken === t);
      if (!p) bad('Ссылка для совместного редактирования устарела. Попросите партнёра прислать новую.', 404);
      const ws = wsOf(p.workspaceId);
      const token = newSession({ kind: 'couple', projectId: p.id, workspaceId: ws.id });
      save();
      return { token, me: meOut({ ws, role: 'couple', project: p }) };
    }],
    ['POST', '/auth/forgot', async ctx => {
      const email = String(ctx.body?.email || '').trim().toLowerCase();
      if (!emailOk(email)) bad('Укажите корректный e-mail');
      const user = db().users.find(u => u.email.toLowerCase() === email);
      if (user) {
        pruneSessions();
        const recent = db().resets.filter(r => r.userId === user.id && Date.parse(r.createdAt) > Date.now() - 60_000);
        if (!recent.length) {
          const token = uid(32);
          db().resets.push({ id: uid(), userId: user.id, hash: await sha256(token), createdAt: now(), expiresAt: new Date(Date.now() + 3600e3).toISOString() });
          save();
          const link = `${publicUrl}/#reset-${token}`;
          mail({
            to: user.email, subject: 'Восстановление пароля WEDNELLO',
            text: `Здравствуйте!\n\nЧтобы задать новый пароль, откройте ссылку (действует 1 час):\n${link}\n\nЕсли вы не запрашивали восстановление, просто проигнорируйте это письмо.\n\nWEDNELLO`,
            html: `<p>Здравствуйте!</p><p>Чтобы задать новый пароль, нажмите на кнопку. Ссылка действует 1 час.</p><p><a href="${link}" style="display:inline-block;padding:12px 22px;background:#2b2724;color:#faf7f2;border-radius:999px;text-decoration:none">Задать новый пароль</a></p><p style="color:#777">Если вы не запрашивали восстановление, просто проигнорируйте это письмо.</p>`,
          });
          if (isDemo || !hooks.sendMail) return { ok: true, devLink: link };
        }
      }
      return { ok: true };
    }],
    ['POST', '/auth/reset', async ctx => {
      const { token, password } = ctx.body || {};
      pwOk(password);
      const hash = await sha256(token || '');
      const r = db().resets.find(x => x.hash === hash && !x.usedAt && x.expiresAt > now());
      if (!r) bad('Ссылка устарела или уже использована. Запросите восстановление ещё раз.', 400);
      const user = userOf(r.userId) || bad('Пользователь не найден', 404);
      user.passwordHash = await hashPassword(password);
      r.usedAt = now();
      const d = db(); d.sessions = d.sessions.filter(s => s.userId !== user.id);
      const m = d.members.find(x => x.userId === user.id) || bad('У пользователя нет кабинета', 403);
      const tk = newSession({ kind: 'user', userId: user.id, workspaceId: m.workspaceId });
      save();
      return { token: tk, me: meOut({ user, ws: wsOf(m.workspaceId), role: m.role }) };
    }],
    ['POST', '/auth/password', async ctx => {
      const a = auth(ctx);
      const { current, password } = ctx.body || {};
      if (!(await verifyPassword(current || '', a.user.passwordHash))) bad('Текущий пароль указан неверно', 400);
      pwOk(password);
      a.user.passwordHash = await hashPassword(password);
      const d = db(); d.sessions = d.sessions.filter(s => s.userId !== a.user.id || s.token === ctx.token);
      save(); return { ok: true };
    }],
    ['DELETE', '/account', async ctx => {
      const a = auth(ctx);
      if (!(await verifyPassword(ctx.body?.password || '', a.user.passwordHash))) bad('Пароль указан неверно', 400);
      if (a.role === 'owner') wipeWorkspace(a.ws);
      const d = db();
      d.members = d.members.filter(m => m.userId !== a.user.id);
      d.sessions = d.sessions.filter(s => s.userId !== a.user.id);
      d.resets = d.resets.filter(r => r.userId !== a.user.id);
      d.users = d.users.filter(u => u.id !== a.user.id);
      // платежи храним для бухгалтерии, но без персональных данных
      d.payments.forEach(p => { if (p.userId === a.user.id) { p.userId = null; p.email = ''; } });
      save(); return { ok: true };
    }],
    ['POST', '/auth/logout', async ctx => {
      const d = db(); d.sessions = d.sessions.filter(s => s.token !== ctx.token); save(); return { ok: true };
    }],
    ['GET', '/auth/me', async ctx => meOut(auth(ctx, { allowCouple: true }))],

    /* студия */
    ['PATCH', '/workspace', async ctx => {
      const a = auth(ctx);
      const { name, brand, contact, notify } = ctx.body || {};
      if (name !== undefined) { a.ws.name = String(name).slice(0, 80) || a.ws.name; if (a.user) a.user.name = a.ws.name; }
      if (notify) a.ws.notify = { ...a.ws.notify, rsvp: notify.rsvp !== false };
      if (brand) a.ws.brand = { ...a.ws.brand, ...brand };
      if (contact) a.ws.contact = { ...a.ws.contact, ...contact };
      save(); return meOut(a);
    }],
    /* оплата */
    ['GET', '/billing', async ctx => {
      const a = auth(ctx);
      return {
        plans: db().plans.filter(p => p.active !== false).sort((x, y) => x.order - y.order),
        current: planOf(a.ws).id, planUntil: a.ws.planUntil || null, enabled: isDemo || !!hooks.billing,
        payments: db().payments.filter(p => p.workspaceId === a.ws.id).sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1)).map(paymentOut),
      };
    }],
    ['POST', '/billing/checkout', async ctx => {
      const a = auth(ctx);
      if (a.role !== 'owner') bad('Оплачивает владелец аккаунта', 403);
      const plan = db().plans.find(p => p.id === ctx.body?.planId && p.active !== false && p.price > 0) || bad('Тариф не найден', 404);
      const pay = { id: uid(), workspaceId: a.ws.id, userId: a.user.id, email: a.user.email, planId: plan.id, amount: plan.price, status: 'pending', provider: isDemo ? 'demo' : 'yookassa', providerId: null, createdAt: now() };
      if (isDemo) {
        db().payments.push(pay); activatePayment(pay);
        return { payment: paymentOut(pay), confirmationUrl: null, demo: true, me: meOut(a) };
      }
      if (!hooks.billing) bad('Оплата ещё не подключена. Напишите нам — поможем.', 503);
      const r = await hooks.billing.createPayment({ payment: pay, plan, user: a.user, ws: a.ws });
      pay.providerId = r.providerId; pay.status = r.status || 'pending';
      db().payments.push(pay); save();
      return { payment: paymentOut(pay), confirmationUrl: r.confirmationUrl };
    }],
    ['POST', '/billing/payments/:id/sync', async ctx => {
      const a = auth(ctx);
      const pay = db().payments.find(p => p.id === ctx.params.id && p.workspaceId === a.ws.id) || bad('Платёж не найден', 404);
      await syncPayment(pay);
      return { payment: paymentOut(pay), me: meOut(a) };
    }],
    /* администрирование платформы */
    ['GET', '/admin/stats', async ctx => {
      const a = auth(ctx);
      if (!isAdmin(a.user)) bad('Раздел для администратора сервиса', 403);
      const d = db(), t = Date.now(), day = 864e5;
      const since = n => x => Date.parse(x.createdAt) > t - n * day;
      const paid = d.payments.filter(p => p.status === 'succeeded');
      const sum = list => list.reduce((s, p) => s + (+p.amount || 0), 0);
      const daily = Array.from({ length: 30 }, (_, i) => {
        const from = new Date(t - (29 - i) * day).toISOString().slice(0, 10);
        return {
          date: from,
          signups: d.users.filter(u => u.createdAt.slice(0, 10) === from).length,
          revenue: sum(paid.filter(p => (p.paidAt || p.createdAt).slice(0, 10) === from)),
        };
      });
      return {
        users: { total: d.users.length, week: d.users.filter(since(7)).length, month: d.users.filter(since(30)).length },
        projects: { total: d.projects.length, published: d.projects.filter(p => p.status === 'published').length },
        guests: d.guests.length, responses: d.responses.length,
        paying: d.workspaces.filter(w => planOf(w).price > 0).length,
        revenue: { total: sum(paid), month: sum(paid.filter(p => Date.parse(p.paidAt || p.createdAt) > t - 30 * day)) },
        conversion: d.users.length ? Math.round((new Set(paid.map(p => p.workspaceId)).size / d.users.length) * 1000) / 10 : 0,
        templates: Object.fromEntries(TEMPLATES.map(x => [x.name, d.projects.filter(p => p.templateId === x.id).length])),
        daily,
        recentPayments: d.payments.slice().sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1)).slice(0, 20).map(p => ({ ...paymentOut(p), email: p.email })),
        recentUsers: d.users.slice().sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1)).slice(0, 20).map(u => {
          const m = d.members.find(x => x.userId === u.id); const w = m && wsOf(m.workspaceId);
          return { email: u.email, name: u.name, createdAt: u.createdAt, plan: w ? planOf(w).name : '—', projects: w ? d.projects.filter(p => p.workspaceId === w.id).length : 0 };
        }),
      };
    }],
    /* тарифы */
    ['GET', '/plans', async () => db().plans.slice().sort((a, b) => a.order - b.order)],
    ['PUT', '/plans', async ctx => {
      const a = auth(ctx);
      if (!isAdmin(a.user)) bad('Тарифы редактирует администратор сервиса', 403);
      const list = Array.isArray(ctx.body) ? ctx.body : bad('Ожидается список тарифов');
      if (!list.length) bad('Нужен хотя бы один тариф');
      const ids = new Set();
      const plans = list.map((p, i) => {
        const id = slugify(p.id || p.name || 'plan-' + i);
        if (ids.has(id)) bad(`Повторяется код тарифа «${id}»`); ids.add(id);
        return {
          id, name: String(p.name || 'Тариф').slice(0, 40), description: String(p.description || '').slice(0, 200),
          price: Math.max(0, Math.round(+p.price || 0)), period: p.period || 'разово', durationDays: Math.max(0, Math.round(+p.durationDays || 0)), order: i + 1,
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
      if (b.templateId && b.templateId !== p.templateId) p.templateId = getTemplate(b.templateId).id;
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
      if (a.role === 'couple' && p.settings?.couplePublish === false) bad('Публикует владелец аккаунта', 403);
      if (p.archived) bad('Приглашение в архиве. Верните его из архива, чтобы опубликовать.', 409);
      if (!templateAllowed(a.ws, p.templateId)) bad(`Шаблон «${getTemplate(p.templateId).name}» входит в тариф «Премиум». Оплатите его или выберите бесплатный шаблон.`, 402, { limit: 'template' });
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
    ['POST', '/projects/:id/couple-link', async ctx => {
      const a = auth(ctx);
      const p = projectFor(a, ctx.params.id);
      if (ctx.body?.reset || !p.coupleToken) {
        p.coupleToken = uid(24);
        const d = db(); d.sessions = d.sessions.filter(s => !(s.kind === 'couple' && s.projectId === p.id));
        save();
      }
      return { token: p.coupleToken };
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
      if (ctx.body?.website) return { ok: true }; // ловушка для ботов: поле скрыто от людей
      const b = normalizeResponse(ctx.body);
      const name = String(b.name || '').trim().slice(0, 120);
      if (!name) bad('Укажите имя');
      if (db().responses.filter(x => x.projectId === p.id).length >= 3000) bad('Приём ответов временно ограничен', 429);
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
      save();
      const ws = wsOf(p.workspaceId);
      if (ws && ws.notify?.rsvp !== false && hooks.sendMail) {
        const owners = d.members.filter(m => m.workspaceId === ws.id).map(m => userOf(m.userId)).filter(Boolean);
        const st = projectStats(p);
        const line = r.attending ? `придёт${r.guests > 1 ? ` (${r.guests} чел.)` : ''}` : 'не сможет прийти';
        const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        for (const u of owners) mail({
          to: u.email, subject: `${r.name} ${line} — ${p.title}`,
          text: `${r.name} ${line}.${r.food ? `\nПитание: ${r.food}` : ''}${r.wish ? `\nПожелание: ${r.wish}` : ''}\n\nВсего ответили ${st.responses}, придут ${st.people} чел.\nВсе ответы: ${publicUrl}/#responses-${p.id}\n\nОтключить уведомления можно в настройках аккаунта.`,
          html: `<p><b>${esc(r.name)}</b> ${line}.</p>${r.food ? `<p>Питание: ${esc(r.food)}</p>` : ''}${r.wish ? `<blockquote style="margin:0;padding:8px 14px;border-left:3px solid #c9a979;color:#555"><i>${esc(r.wish)}</i></blockquote>` : ''}<p>Всего ответили ${st.responses}, придут ${st.people} чел.</p><p><a href="${publicUrl}/#responses-${p.id}">Открыть все ответы</a></p><p style="color:#999;font-size:12px">Отключить уведомления можно в настройках аккаунта.</p>`,
        });
      }
      return { ok: true };
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

  return { handle, createWorkspace, createProject, addGuests, planOf, wsOf, brandFor, uniqueSlug, handleProviderEvent, activatePayment };
}

export { TEMPLATES };
