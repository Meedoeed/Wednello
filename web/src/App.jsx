import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { initApi, get, post, setToken, getToken, getMode } from './api.js';
import { Icon, ToastProvider, Menu, Monogram } from './ui.jsx';
import { Landing } from './pages/Landing.jsx';
import { AuthPage } from './pages/Auth.jsx';
import { Wizard } from './pages/Wizard.jsx';
import { Dashboard } from './pages/Dashboard.jsx';
import { TemplatesPage } from './pages/Templates.jsx';
import { EditorPage } from './pages/Editor.jsx';
import { GuestsPage } from './pages/Guests.jsx';
import { ResponsesPage } from './pages/Responses.jsx';
import { AccountPage } from './pages/Account.jsx';
import { PublicInvite } from './pages/PublicInvite.jsx';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);
export const DEMO_LOGIN = { email: 'demo@wednello.ru', password: 'demo123' };

function parseRoute(hash) {
  const h = (hash || '').replace(/^#/, '');
  const m = /^(editor|guests|responses|invite|partner|couple)-(.+)$/.exec(h);
  if (m) return { name: m[1] === 'couple' ? 'partner' : m[1], arg: m[2] };
  return { name: h || '' };
}

export function App() {
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState(null);
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  const [partnerError, setPartnerError] = useState('');

  useEffect(() => {
    const on = () => setRoute(parseRoute(location.hash));
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);

  const nav = useCallback((to, replace) => {
    const h = to ? '#' + to : location.pathname + location.search;
    if (replace) history.replaceState(null, '', h); else history.pushState(null, '', h);
    setRoute(parseRoute(to ? '#' + to : ''));
    window.scrollTo(0, 0);
  }, []);

  const refreshMe = useCallback(async () => {
    try { const m = await get('/auth/me'); setMe(m); return m; } catch { setMe(null); return null; }
  }, []);

  useEffect(() => {
    (async () => {
      await initApi();
      const r = parseRoute(location.hash);
      if (r.name === 'partner') {
        try { const res = await post('/auth/couple', { token: r.arg }); setToken(res.token); setMe(res.me); nav('editor-' + res.me.projectId, true); }
        catch (e) { setPartnerError(e.message); nav('login', true); }
      } else if (getToken()) await refreshMe();
      setReady(true);
    })();
  }, []);

  const signIn = res => { setToken(res.token); setMe(res.me); };
  const logout = async () => { try { await post('/auth/logout'); } catch {} setToken(null); setMe(null); nav('', true); };
  const demo = async () => { const res = await post('/auth/login', DEMO_LOGIN); signIn(res); nav('dashboard'); };

  if (!ready) return <div className="boot"><Logo /></div>;

  if (route.name === 'invite') {
    const [slug, g] = route.arg.split('--');
    return <ToastProvider><PublicInvite slug={slug} guestToken={g} /></ToastProvider>;
  }

  const ctx = { me, setMe, refreshMe, nav, route, logout, signIn, demo, mode: getMode() };
  const authed = !!me;
  const partner = me?.role === 'couple';
  let page, chrome = 'app';
  const name = route.name;

  if (!authed) {
    if (name === 'login' || name === 'signup') { page = <AuthPage initial={name} error={partnerError} />; chrome = 'none'; }
    else if (name === 'new') { page = <Wizard />; chrome = 'none'; }
    else if (name === 'templates') { page = <TemplatesPage />; chrome = 'site'; }
    else { page = <Landing />; chrome = 'none'; }
  } else if (partner) {
    const id = me.projectId;
    page = name === 'guests' ? <GuestsPage projectId={id} /> : name === 'responses' ? <ResponsesPage projectId={id} /> : <EditorPage projectId={id} />;
    chrome = name === 'guests' || name === 'responses' ? 'app' : 'none';
  } else {
    switch (name) {
      case 'editor': page = <EditorPage projectId={route.arg} />; chrome = 'none'; break;
      case 'guests': page = <GuestsPage projectId={route.arg} />; break;
      case 'responses': page = <ResponsesPage projectId={route.arg} />; break;
      case 'templates': page = <TemplatesPage />; break;
      case 'new': page = <Wizard />; chrome = 'none'; break;
      case 'account': page = <AccountPage />; break;
      case 'home': page = <Landing />; chrome = 'none'; break;
      default: page = <Dashboard />;
    }
  }

  return (
    <ToastProvider>
      <Ctx.Provider value={ctx}>
        {chrome === 'app' && <AppHeader />}
        {chrome === 'site' && <SiteHeader solid />}
        <main className={'main main-' + chrome}>{page}</main>
      </Ctx.Provider>
    </ToastProvider>
  );
}

export function Logo({ light, small, onClick }) {
  return (
    <span className={'logo' + (light ? ' logo-light' : '') + (small ? ' logo-sm' : '')} onClick={onClick} role={onClick ? 'link' : undefined}>
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="20" cy="20" r="18.6" fill="none" stroke="currentColor" strokeWidth=".9" opacity=".55" />
        <circle cx="20" cy="20" r="15.8" fill="none" stroke="currentColor" strokeWidth=".5" opacity=".35" />
        <path d="M10.8 13.4 15 27.2 20 15.8l5 11.4 4.2-13.8" fill="none" stroke="var(--brass)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <b>WEDNELLO</b>
    </span>
  );
}

/** Шапка маркетинговых страниц */
export function SiteHeader({ solid }) {
  const { me, nav } = useApp();
  const [scrolled, setScrolled] = useState(solid);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (solid) return;
    const on = () => setScrolled(scrollY > 40);
    on(); addEventListener('scroll', on, { passive: true });
    return () => removeEventListener('scroll', on);
  }, [solid]);
  const go = id => { setOpen(false); if (!document.getElementById(id)) { nav(''); setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }), 60); } else document.getElementById(id).scrollIntoView({ behavior: 'smooth' }); };
  return (
    <header className={'site-head' + (scrolled ? ' scrolled' : '') + (open ? ' open' : '')}>
      <div className="site-head-in">
        <button type="button" className="logo-btn" onClick={() => nav(me ? 'home' : '')} aria-label="На главную"><Logo /></button>
        <nav className="site-nav" aria-label="Разделы">
          <button type="button" onClick={() => go('templates')}>Шаблоны</button>
          <button type="button" onClick={() => go('how')}>Как это работает</button>
          <button type="button" onClick={() => go('features')}>Возможности</button>
          <button type="button" onClick={() => go('faq')}>Вопросы</button>
        </nav>
        <div className="site-actions">
          {me ? <button type="button" className="btn btn-primary" onClick={() => nav('dashboard')}>Мои приглашения</button> : <>
            <button type="button" className="btn btn-ghost hide-sm" onClick={() => nav('login')}>Войти</button>
            <button type="button" className="btn btn-primary" onClick={() => nav('new')}>Создать приглашение</button>
          </>}
          <button type="button" className="btn btn-ghost btn-icon site-burger" onClick={() => setOpen(!open)} aria-label="Меню" aria-expanded={open}><Icon name={open ? 'x' : 'menu'} /></button>
        </div>
      </div>
      {open && <div className="site-drawer">
        <button type="button" onClick={() => go('templates')}>Шаблоны</button>
        <button type="button" onClick={() => go('how')}>Как это работает</button>
        <button type="button" onClick={() => go('features')}>Возможности</button>
        <button type="button" onClick={() => go('faq')}>Вопросы</button>
        {!me && <button type="button" onClick={() => nav('login')}>Войти</button>}
      </div>}
    </header>
  );
}

/** Шапка личного кабинета */
function AppHeader() {
  const { me, nav, route, logout } = useApp();
  const partner = me.role === 'couple';
  const on = n => (route.name === n || (n === 'dashboard' && ['', 'guests', 'responses'].includes(route.name)) ? 'on' : '');
  return (
    <header className="app-head">
      <div className="app-head-in">
        <button type="button" className="logo-btn" onClick={() => nav(partner ? 'editor-' + me.projectId : 'dashboard')} aria-label="Мои приглашения"><Logo small /></button>
        {!partner && <nav className="app-nav" aria-label="Кабинет">
          <button type="button" className={on('dashboard')} onClick={() => nav('dashboard')}>Мои приглашения</button>
          <button type="button" className={on('templates')} onClick={() => nav('templates')}>Шаблоны</button>
        </nav>}
        <span className="grow" />
        {!partner ? (
          <Menu align="right" trigger={<button type="button" className="me-btn" aria-label="Аккаунт"><Monogram a={me.user?.name} size={34} /><span className="hide-sm">{me.user?.name}</span><Icon name="down" size={14} /></button>}
            items={[
              { icon: 'settings', label: 'Аккаунт', onClick: () => nav('account') },
              { icon: 'heart', label: 'О сервисе', onClick: () => nav('home') },
              '-', { icon: 'logout', label: 'Выйти', onClick: logout },
            ]} />
        ) : <span className="partner-tag">Совместное редактирование</span>}
      </div>
    </header>
  );
}
