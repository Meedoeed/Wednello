import React, { useState } from 'react';
import { post } from '../api.js';
import { Button, Field, Input, Icon } from '../ui.jsx';
import { Logo, useApp, DEMO_LOGIN } from '../App.jsx';

export function Consent({ checked, onChange }) {
  return (
    <label className="consent">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} required />
      <span>Принимаю условия <a href="/legal/terms" target="_blank" rel="noopener">оферты</a> и даю согласие на обработку персональных данных по <a href="/legal/privacy" target="_blank" rel="noopener">политике конфиденциальности</a></span>
    </label>
  );
}

function AuthShell({ children }) {
  const { nav } = useApp();
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
        {children}
      </div>
    </div>
  );
}

export function AuthPage({ initial = 'login', error }) {
  const { mode, nav, signIn } = useApp();
  const [tab, setTab] = useState(initial === 'signup' ? 'register' : initial === 'forgot' ? 'forgot' : 'login');
  const [f, setF] = useState({ email: '', password: '', name: '' });
  const [consent, setConsent] = useState(false);
  const [err, setErr] = useState(error || '');
  const [sent, setSent] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const done = res => { signIn(res); nav('dashboard', true); };
  const go = t => { setTab(t); setErr(''); setSent(null); };
  const submit = async e => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      if (tab === 'forgot') setSent(await post('/auth/forgot', { email: f.email }));
      else done(await post(tab === 'login' ? '/auth/login' : '/auth/register', tab === 'login' ? { email: f.email, password: f.password } : { ...f, consent }));
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <AuthShell>
      <form className="auth-form" onSubmit={submit}>
        <h1>{tab === 'login' ? <>С возвращением</> : tab === 'forgot' ? <>Восстановим <em>пароль</em></> : <>Создадим ваш <em>аккаунт</em></>}</h1>
        <p className="muted">{tab === 'login' ? 'Войдите, чтобы продолжить работу над приглашением.' : tab === 'forgot' ? 'Пришлём на почту ссылку, по которой можно задать новый пароль.' : 'Приглашение, гости и ответы будут храниться здесь.'}</p>
        {sent ? <div className="alert alert-info"><Icon name="mail" size={16} /><div>Если аккаунт с адресом <b>{f.email}</b> существует, письмо уже в пути. Проверьте папку «Спам», если его долго нет.
          {sent.devLink && <p className="mt small">Почта не настроена, ссылка для проверки: <a href={sent.devLink}>задать пароль</a></p>}</div></div> : <>
          {tab === 'register' && <Field label="Ваше имя"><Input value={f.name} onChange={set('name')} autoComplete="name" maxLength={80} /></Field>}
          <Field label="E-mail"><Input type="email" value={f.email} onChange={set('email')} autoComplete="email" required /></Field>
          {tab !== 'forgot' && <Field label="Пароль" hint={tab === 'register' ? 'Не короче 8 символов' : undefined}
            aside={tab === 'login' ? <button type="button" className="link-btn small" onClick={() => go('forgot')}>Забыли пароль?</button> : undefined}>
            <Input type="password" value={f.password} onChange={set('password')} autoComplete={tab === 'login' ? 'current-password' : 'new-password'} minLength={tab === 'register' ? 8 : undefined} required />
          </Field>}
          {tab === 'register' && <Consent checked={consent} onChange={setConsent} />}
          {err && <div className="alert alert-error"><Icon name="alert" size={16} />{err}</div>}
          <Button variant="primary" size="lg" type="submit" loading={busy} disabled={tab === 'register' && !consent}>{tab === 'login' ? 'Войти' : tab === 'forgot' ? 'Отправить ссылку' : 'Создать аккаунт'}</Button>
        </>}
        <p className="auth-switch">
          {tab === 'login' ? <>Ещё нет аккаунта? <button type="button" className="link-btn" onClick={() => go('register')}>Зарегистрироваться</button></>
            : <>Уже есть аккаунт? <button type="button" className="link-btn" onClick={() => go('login')}>Войти</button></>}
        </p>
        {mode === 'demo' && <div className="demo-box">
          <p>Это демо-версия: данные хранятся только в этом браузере.</p>
          <Button variant="outline" onClick={async () => { setBusy(true); try { done(await post('/auth/login', DEMO_LOGIN)); } finally { setBusy(false); } }}>Открыть демо-кабинет</Button>
        </div>}
      </form>
    </AuthShell>
  );
}

export function ResetPage({ token }) {
  const { nav, signIn } = useApp();
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async e => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { signIn(await post('/auth/reset', { token, password })); nav('dashboard', true); }
    catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <AuthShell>
      <form className="auth-form" onSubmit={submit}>
        <h1>Новый <em>пароль</em></h1>
        <p className="muted">Придумайте пароль, которым будете входить в аккаунт.</p>
        <Field label="Новый пароль" hint="Не короче 8 символов"><Input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required autoFocus /></Field>
        {err && <div className="alert alert-error"><Icon name="alert" size={16} /><div>{err} <button type="button" className="link-btn" onClick={() => nav('forgot', true)}>Запросить снова</button></div></div>}
        <Button variant="primary" size="lg" type="submit" loading={busy}>Сохранить и войти</Button>
      </form>
    </AuthShell>
  );
}
