import React, { useState } from 'react';
import { patch } from '../api.js';
import { Button, Field, Input, useToast } from '../ui.jsx';
import { useApp } from '../App.jsx';

export function AccountPage() {
  const { me, setMe, logout, mode } = useApp();
  const toast = useToast();
  const [name, setName] = useState(me.workspace?.name || me.user?.name || '');
  const [busy, setBusy] = useState(false);
  return (
    <div className="page page-narrow">
      <header className="page-head"><div><p className="eyebrow">Аккаунт</p><h1>Ваш <em>профиль</em></h1></div></header>
      <section className="card">
        <Field label="Как к вам обращаться"><Input value={name} onChange={e => setName(e.target.value)} /></Field>
        <Field label="E-mail" hint="Используется для входа"><Input value={me.user?.email || ''} readOnly /></Field>
        <div className="row gap">
          <Button variant="primary" loading={busy} onClick={async () => { setBusy(true); try { setMe(await patch('/workspace', { name })); toast('Сохранено'); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); } }}>Сохранить</Button>
          <span className="grow" />
          <Button variant="ghost" icon="logout" onClick={logout}>Выйти</Button>
        </div>
      </section>
      {mode === 'demo' && <p className="muted small center mt">Демо-версия: аккаунт и приглашения хранятся только в этом браузере.</p>}
    </div>
  );
}
