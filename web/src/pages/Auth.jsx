import React, { useState } from 'react';
import { post } from '../api.js';
import { Button, Field, Input, Icon } from '../ui.jsx';
import { Logo, useApp, DEMO_LOGIN } from '../App.jsx';

export function AuthPage({ initial = 'login', error }) {
  const { mode, nav, signIn } = useApp();
  const [tab, setTab] = useState(initial === 'signup' ? 'register' : 'login');
  const [f, setF] = useState({ email: '', password: '', name: '' });
  const [err, setErr] = useState(error || '');
  const [busy, setBusy] = useState(false);
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const done = res => { signIn(res); nav('dashboard', true); };
  const submit = async e => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { done(await post(tab === 'login' ? '/auth/login' : '/auth/register', f)); }
    catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <div className="auth">
      <figure className="auth-art">
        <img src="img/auth.webp" alt="" />
        <figcaption>
          <p className="eyebrow">WEDNELLO</p>
          <p className="auth-quote">«Самые красивые истории <em>пишутся вместе</em>»</p>
        </figcaption>
      </figure>
      <div className="auth-side">
        <button type="button" className="logo-btn auth-logo" onClick={() => nav('')} aria-label="На главную"><Logo /></button>
        <form className="auth-form" onSubmit={submit}>
          <h1>{tab === 'login' ? <>С возвращением</> : <>Создадим ваш <em>аккаунт</em></>}</h1>
          <p className="muted">{tab === 'login' ? 'Войдите, чтобы продолжить работу над приглашением.' : 'Приглашение, гости и ответы будут храниться здесь.'}</p>
          {tab === 'register' && <Field label="Ваше имя"><Input value={f.name} onChange={set('name')} autoComplete="name" /></Field>}
          <Field label="E-mail"><Input type="email" value={f.email} onChange={set('email')} autoComplete="email" required /></Field>
          <Field label="Пароль" hint={tab === 'register' ? 'Не короче 6 символов' : undefined}><Input type="password" value={f.password} onChange={set('password')} autoComplete={tab === 'login' ? 'current-password' : 'new-password'} required /></Field>
          {err && <div className="alert alert-error"><Icon name="alert" size={16} />{err}</div>}
          <Button variant="primary" size="lg" type="submit" loading={busy}>{tab === 'login' ? 'Войти' : 'Создать аккаунт'}</Button>
          <p className="auth-switch">
            {tab === 'login' ? <>Ещё нет аккаунта? <button type="button" className="link-btn" onClick={() => setTab('register')}>Зарегистрироваться</button></>
              : <>Уже есть аккаунт? <button type="button" className="link-btn" onClick={() => setTab('login')}>Войти</button></>}
          </p>
          {mode === 'demo' && <div className="demo-box">
            <p>Это демо-версия: данные хранятся только в этом браузере.</p>
            <Button variant="outline" onClick={async () => { setBusy(true); try { done(await post('/auth/login', DEMO_LOGIN)); } finally { setBusy(false); } }}>Открыть демо-кабинет</Button>
          </div>}
        </form>
      </div>
    </div>
  );
}
