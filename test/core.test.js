import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCore, emptyDb, migrateDb } from '../shared/core.js';

function setup(hooks = {}) {
  const store = { data: emptyDb(), save() {} };
  const core = createCore({ store, hashPassword: async p => 'h:' + p, verifyPassword: async (p, h) => h === 'h:' + p, hooks: { publicUrl: 'https://w.test', ...hooks } });
  const call = (method, path, body, token, query = {}) => core.handle({ method, path, body, token, query });
  return { store, core, call };
}
async function register(call, email = 'a@b.ru') {
  const r = await call('POST', '/auth/register', { email, password: 'password1', name: 'Аня', consent: true });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data.token;
}

test('регистрация: согласие, длина пароля, дубликаты', async () => {
  const { call } = setup();
  assert.equal((await call('POST', '/auth/register', { email: 'x@y.ru', password: 'password1' })).status, 400);
  assert.equal((await call('POST', '/auth/register', { email: 'x@y.ru', password: 'short', consent: true })).status, 400);
  await register(call, 'x@y.ru');
  assert.equal((await call('POST', '/auth/register', { email: 'X@y.ru', password: 'password1', consent: true })).status, 400);
  const me = await call('POST', '/auth/login', { email: 'x@y.ru', password: 'password1' });
  assert.equal(me.data.me.plan.id, 'free');
});

test('премиум-шаблон: черновик можно, публикация — только с тарифом', async () => {
  const { call } = setup();
  const t = await register(call);
  const p = (await call('POST', '/projects', { templateId: 'midnight', couple: { a: 'А', b: 'Б' } }, t)).data;
  const pub = await call('POST', `/projects/${p.id}/publish`, {}, t);
  assert.equal(pub.status, 402);
  assert.equal(pub.data.limit, 'template');
  await call('PATCH', '/projects/' + p.id, { templateId: 'garden' }, t);
  assert.equal((await call('POST', `/projects/${p.id}/publish`, {}, t)).status, 200);
});

test('лимит гостей на бесплатном тарифе', async () => {
  const { call } = setup();
  const t = await register(call);
  const p = (await call('POST', '/projects', { templateId: 'ivory' }, t)).data;
  const items = Array.from({ length: 41 }, (_, i) => ({ name: 'Гость ' + i }));
  assert.equal((await call('POST', `/projects/${p.id}/guests`, { items }, t)).status, 402);
  assert.equal((await call('POST', `/projects/${p.id}/guests`, { items: items.slice(0, 40) }, t)).status, 200);
});

test('оплата: создание, вебхук, идемпотентность, проверка суммы', async () => {
  const remote = new Map();
  const billing = {
    async createPayment({ payment }) { const id = 'yk-' + payment.id.padEnd(12, 'x'); remote.set(id, { id, status: 'pending', paid: false, amount: { value: String(payment.amount) + '.00', currency: 'RUB' } }); return { providerId: id, confirmationUrl: 'https://pay.test/' + id }; },
    async fetchPayment(id) { return remote.get(id); },
  };
  const { call, core, store } = setup({ billing });
  const t = await register(call);
  const r = await call('POST', '/billing/checkout', { planId: 'premium' }, t);
  assert.equal(r.status, 200);
  assert.match(r.data.confirmationUrl, /^https:\/\/pay\.test\//);
  const pay = store.data.payments[0];
  // пока не оплачен — тариф не меняется
  await core.handleProviderEvent(pay.providerId);
  assert.equal((await call('GET', '/auth/me', undefined, t)).data.plan.id, 'free');
  // подмена суммы не активирует тариф
  remote.get(pay.providerId).status = 'succeeded'; remote.get(pay.providerId).paid = true; remote.get(pay.providerId).amount.value = '1.00';
  await core.handleProviderEvent(pay.providerId);
  assert.equal(pay.status, 'mismatch');
  assert.equal((await call('GET', '/auth/me', undefined, t)).data.plan.id, 'free');
  // корректная оплата
  pay.status = 'pending'; remote.get(pay.providerId).amount.value = '1490.00';
  await core.handleProviderEvent(pay.providerId);
  const me = (await call('GET', '/auth/me', undefined, t)).data;
  assert.equal(me.plan.id, 'premium');
  const until = me.planUntil;
  // повторное уведомление не продлевает срок второй раз
  await core.handleProviderEvent(pay.providerId);
  assert.equal((await call('GET', '/auth/me', undefined, t)).data.planUntil, until);
  // истёкший срок → бесплатный тариф
  store.data.workspaces[0].planUntil = new Date(Date.now() - 1000).toISOString();
  assert.equal((await call('GET', '/auth/me', undefined, t)).data.plan.id, 'free');
});

test('без платёжной системы оплата возвращает 503', async () => {
  const { call } = setup();
  const t = await register(call);
  assert.equal((await call('POST', '/billing/checkout', { planId: 'premium' }, t)).status, 503);
});

test('восстановление пароля: одноразовая ссылка, старые сессии сбрасываются', async () => {
  const mails = [];
  const { call } = setup({ sendMail: m => mails.push(m) });
  const t = await register(call);
  assert.equal((await call('POST', '/auth/forgot', { email: 'nobody@b.ru' })).status, 200);
  assert.equal(mails.length, 0);
  await call('POST', '/auth/forgot', { email: 'a@b.ru' });
  assert.equal(mails.length, 1);
  const token = /reset-([a-z0-9]+)/.exec(mails[0].text)[1];
  assert.equal((await call('POST', '/auth/reset', { token, password: 'newpassword' })).status, 200);
  assert.equal((await call('POST', '/auth/reset', { token, password: 'again12345' })).status, 400);
  assert.equal((await call('GET', '/auth/me', undefined, t)).status, 401);
  assert.equal((await call('POST', '/auth/login', { email: 'a@b.ru', password: 'newpassword' })).status, 200);
});

test('совместное редактирование: ссылка, перевыпуск отключает старую', async () => {
  const { call } = setup();
  const t = await register(call);
  const p = (await call('POST', '/projects', { templateId: 'ivory' }, t)).data;
  const link1 = (await call('POST', `/projects/${p.id}/couple-link`, {}, t)).data.token;
  const s = await call('POST', '/auth/couple', { token: link1 });
  assert.equal(s.data.me.role, 'couple');
  assert.equal((await call('GET', '/projects/' + p.id, undefined, s.data.token)).status, 200);
  assert.equal((await call('GET', '/projects', undefined, s.data.token)).status, 403);
  const link2 = (await call('POST', `/projects/${p.id}/couple-link`, { reset: true }, t)).data.token;
  assert.notEqual(link1, link2);
  assert.equal((await call('POST', '/auth/couple', { token: link1 })).status, 404);
  assert.equal((await call('GET', '/projects/' + p.id, undefined, s.data.token)).status, 401);
});

test('анкета гостя: ловушка для ботов, персональная ссылка, уведомление', async () => {
  const mails = [];
  const { call, store } = setup({ sendMail: m => mails.push(m) });
  const t = await register(call);
  const p = (await call('POST', '/projects', { templateId: 'ivory', couple: { a: 'Аня', b: 'Ваня' } }, t)).data;
  const pub = (await call('POST', `/projects/${p.id}/publish`, {}, t)).data;
  const [g] = (await call('POST', `/projects/${p.id}/guests`, { items: [{ name: 'Оля', seats: 2 }] }, t)).data;
  await call('POST', '/public/rsvp/' + pub.slug, { name: 'Бот', attending: true, website: 'spam' });
  assert.equal(store.data.responses.length, 0);
  await call('POST', '/public/rsvp/' + pub.slug, { name: 'Оля', attending: true, guests: 2 }, null, { g: g.token });
  await call('POST', '/public/rsvp/' + pub.slug, { name: 'Оля', attending: false }, null, { g: g.token });
  assert.equal(store.data.responses.length, 1, 'повторный ответ гостя заменяет прежний');
  assert.equal(mails.length, 2);
  const inv = await call('GET', '/public/invite/' + pub.slug, undefined, null, { g: g.token });
  assert.equal(inv.data.guest.name, 'Оля');
  assert.deepEqual(inv.data.brand, { text: 'Создано в WEDNELLO', url: '' });
});

test('удаление аккаунта стирает данные, но оставляет обезличенные платежи', async () => {
  const { call, store } = setup();
  const t = await register(call);
  await call('POST', '/projects', { templateId: 'ivory' }, t);
  store.data.payments.push({ id: 'p1', workspaceId: store.data.workspaces[0].id, userId: store.data.users[0].id, email: 'a@b.ru', amount: 1490, status: 'succeeded', createdAt: new Date().toISOString() });
  assert.equal((await call('DELETE', '/account', { password: 'wrong' }, t)).status, 400);
  assert.equal((await call('DELETE', '/account', { password: 'password1' }, t)).status, 200);
  assert.equal(store.data.users.length + store.data.projects.length + store.data.workspaces.length, 0);
  assert.equal(store.data.payments[0].email, '');
});

test('статистика доступна только администратору', async () => {
  const { call } = setup({ adminEmails: ['boss@b.ru'] });
  const t = await register(call);
  assert.equal((await call('GET', '/admin/stats', undefined, t)).status, 403);
  const b = await register(call, 'boss@b.ru');
  const s = await call('GET', '/admin/stats', undefined, b);
  assert.equal(s.status, 200);
  assert.equal(s.data.users.total, 2);
});

test('миграция базы v1', () => {
  const old = { version: 1, plans: [{ id: 'personal' }], workspaces: [{ id: 'w', planId: 'personal' }], users: [], members: [], sessions: [], projects: [], guests: [], responses: [] };
  migrateDb(old);
  assert.equal(old.version, 2);
  assert.equal(old.workspaces[0].planId, 'free');
  assert.ok(Array.isArray(old.payments) && Array.isArray(old.resets));
});
