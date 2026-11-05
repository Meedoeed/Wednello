import React, { useState } from 'react';
import { patch, post, api, setToken } from '../api.js';
import { Button, Field, Input, Toggle, Modal, Icon, useToast, fmtDate, rub } from '../ui.jsx';
import { useApp } from '../App.jsx';

export function AccountPage() {
  const { me, setMe, logout, mode, nav } = useApp();
  const toast = useToast();
  const [name, setName] = useState(me.workspace?.name || me.user?.name || '');
  const [busy, setBusy] = useState('');
  const [pw, setPw] = useState({ current: '', password: '' });
  const [del, setDel] = useState(false);
  const [delPw, setDelPw] = useState('');
  const run = async (key, fn, ok) => { setBusy(key); try { await fn(); ok && toast(ok); } catch (e) { toast(e.message, 'error', 6000); } finally { setBusy(''); } };
  const paid = me.plan.price > 0;
  return (
    <div className="page page-narrow">
      <header className="page-head"><div><p className="eyebrow">Аккаунт</p><h1>Ваш <em>профиль</em></h1></div></header>

      <section className="card">
        <h3><Icon name="crown" size={16} />Тариф</h3>
        <div className="plan-row">
          <div><b className="plan-name">{me.plan.name}</b>
            <p className="muted small">{paid ? (me.planUntil ? `Действует до ${fmtDate(me.planUntil.slice(0, 10))}` : 'Действует бессрочно') : `До ${me.plan.limits.guests} гостей, бесплатные шаблоны, отметка WEDNELLO`}</p></div>
          <Button variant={paid ? 'outline' : 'primary'} onClick={() => nav('plans')}>{paid ? 'Тарифы и платежи' : 'Перейти на Премиум'}</Button>
        </div>
      </section>

      <section className="card mt">
        <h3><Icon name="settings" size={16} />Профиль</h3>
        <Field label="Как к вам обращаться"><Input value={name} onChange={e => setName(e.target.value)} maxLength={80} /></Field>
        <Field label="E-mail" hint="Используется для входа"><Input value={me.user?.email || ''} readOnly /></Field>
        <Toggle checked={me.notify?.rsvp !== false} label="Письмо о каждом новом ответе гостя" hint="Придёт на e-mail аккаунта"
          onChange={v => run('notify', async () => setMe(await patch('/workspace', { notify: { rsvp: v } })), v ? 'Уведомления включены' : 'Уведомления выключены')} />
        <div className="row gap">
          <Button variant="primary" loading={busy === 'name'} onClick={() => run('name', async () => setMe(await patch('/workspace', { name })), 'Сохранено')}>Сохранить</Button>
        </div>
      </section>

      <section className="card mt">
        <h3><Icon name="lock" size={16} />Пароль</h3>
        <form className="stack" onSubmit={e => { e.preventDefault(); run('pw', async () => { await post('/auth/password', pw); setPw({ current: '', password: '' }); }, 'Пароль изменён. На других устройствах нужно войти заново.'); }}>
          <Field label="Текущий пароль"><Input type="password" value={pw.current} onChange={e => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" required /></Field>
          <Field label="Новый пароль" hint="Не короче 8 символов"><Input type="password" value={pw.password} onChange={e => setPw({ ...pw, password: e.target.value })} autoComplete="new-password" minLength={8} required /></Field>
          <div><Button type="submit" loading={busy === 'pw'}>Сменить пароль</Button></div>
        </form>
      </section>

      <section className="card mt danger-zone">
        <h3><Icon name="trash" size={16} />Удаление аккаунта</h3>
        <p className="muted small">Удалятся аккаунт, все приглашения, списки гостей и ответы. Ссылки у гостей перестанут работать. Отменить это нельзя.</p>
        <div className="row gap">
          <Button variant="ghost" icon="logout" onClick={logout}>Выйти</Button>
          <span className="grow" />
          <Button variant="ghost" className="btn-danger-text" onClick={() => setDel(true)}>Удалить аккаунт</Button>
        </div>
      </section>
      <p className="muted small center mt"><a href="/legal/terms" target="_blank" rel="noopener">Оферта</a> · <a href="/legal/privacy" target="_blank" rel="noopener">Конфиденциальность</a> · <a href="/legal/contacts" target="_blank" rel="noopener">Контакты</a></p>
      {mode === 'demo' && <p className="muted small center mt">Демо-версия: аккаунт и приглашения хранятся только в этом браузере.</p>}

      <Modal open={del} onClose={() => setDel(false)} size="sm" title="Удалить аккаунт навсегда?"
        footer={<><Button variant="ghost" onClick={() => setDel(false)}>Отмена</Button>
          <Button variant="danger" loading={busy === 'del'} disabled={!delPw} onClick={() => run('del', async () => { await api('DELETE', '/account', { password: delPw }); setToken(null); setMe(null); nav('', true); }, 'Аккаунт удалён')}>Удалить всё</Button></>}>
        <Field label="Введите пароль для подтверждения"><Input type="password" value={delPw} onChange={e => setDelPw(e.target.value)} autoComplete="current-password" autoFocus /></Field>
      </Modal>
    </div>
  );
}
