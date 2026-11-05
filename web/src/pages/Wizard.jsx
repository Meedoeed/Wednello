import React, { useMemo, useState } from 'react';
import { TEMPLATES, getTemplate } from '../../../shared/templates.js';
import { PROGRAM_PRESETS, defaultData, defaultDate, presetItems, formatDateLong, weekday } from '../../../shared/model.js';
import { post } from '../api.js';
import { Button, Field, Input, Icon, useToast } from '../ui.jsx';
import { TemplateFrame, DeviceStage } from '../Preview.jsx';
import { Logo, useApp } from '../App.jsx';
import { Consent } from './Auth.jsx';

const STEPS = ['Шаблон', 'Пара и дата', 'План дня', 'Сохранение'];
const ss = { get: k => { try { return sessionStorage.getItem(k); } catch { return null; } }, del: k => { try { sessionStorage.removeItem(k); } catch {} } };

export function Wizard() {
  const { me, nav, signIn, refreshMe } = useApp();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [tpl, setTpl] = useState(() => { const t = ss.get('wn.tpl'); ss.del('wn.tpl'); return TEMPLATES.some(x => x.id === t) ? t : 'ivory'; });
  const [a, setA] = useState(''), [b, setB] = useState('');
  const [date, setDate] = useState(defaultDate());
  const [city, setCity] = useState('');
  const [preset, setPreset] = useState('');
  const [acc, setAcc] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [err, setErr] = useState('');
  const last = me ? 2 : 3;

  const preview = useMemo(() => {
    const d = defaultData(tpl);
    d.couple.a = a.trim() || 'Анна'; d.couple.b = b.trim() || 'Михаил';
    d.event.date = date || d.event.date; if (city) d.event.city = city;
    if (preset) d.program = presetItems(preset);
    d.photos = [{ id: 'a', src: '@demo/couple-1.jpg', x: 50, y: 40 }, { id: 'b', src: '@demo/couple-2.jpg', x: 50, y: 40 }];
    return { id: 'wizard', templateId: tpl, data: d };
  }, [tpl, a, b, date, city, preset]);

  const canNext = step === 1 ? a.trim() && b.trim() && date : step === 3 && !me ? consent && acc.email && acc.password.length >= 8 : true;
  const create = async () => {
    setErr(''); setBusy(true);
    try {
      if (!me) {
        const res = await post('/auth/register', { ...acc, name: acc.name || a.trim(), consent });
        signIn(res);
      }
      const p = await post('/projects', { templateId: tpl, couple: { a: a.trim(), b: b.trim() }, date, city: city.trim() || undefined, preset: preset || undefined, title: `${a.trim()} и ${b.trim()}` });
      await refreshMe();
      nav('editor-' + p.id, true);
      toast('Приглашение создано. Добавьте место, фото и план дня');
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const next = () => (step === last ? create() : setStep(step + 1));

  return (
    <div className="wizard">
      <header className="wiz-head">
        <button type="button" className="logo-btn" onClick={() => nav(me ? 'dashboard' : '')} aria-label="На главную"><Logo small /></button>
        <ol className="wiz-steps" aria-label="Шаги">
          {STEPS.slice(0, last + 1).map((s, i) => (
            <li key={s} className={i === step ? 'on' : i < step ? 'done' : ''}>
              <button type="button" disabled={i > step} onClick={() => setStep(i)}><span>{i < step ? <Icon name="check" size={13} /> : i + 1}</span>{s}</button>
            </li>
          ))}
        </ol>
        <Button variant="ghost" icon="x" onClick={() => nav(me ? 'dashboard' : '')} aria-label="Закрыть" />
      </header>

      <div className="wiz-body">
        <section className="wiz-form">
          {step === 0 && <>
            <p className="eyebrow">Шаг 1 из {last + 1}</p>
            <h1>Выберите <em>настроение</em></h1>
            <p className="wiz-lead">Шаблон можно сменить позже, ваши данные сохранятся. Премиум-шаблоны настраиваются бесплатно, оплата — только перед публикацией.</p>
            <div className="wiz-tpls">
              {TEMPLATES.map(t => (
                <button key={t.id} type="button" className={'wiz-tpl' + (tpl === t.id ? ' on' : '')} onClick={() => setTpl(t.id)} aria-pressed={tpl === t.id}>
                  <span className="wiz-tpl-img"><img src={t.cover} alt="" /></span>
                  <span className="wiz-tpl-txt"><b>{t.name}{t.premium && <i className="pro-tag">Премиум</i>}</b><small>{t.tagline}</small></span>
                  <span className="wiz-tpl-check"><Icon name="check" size={14} /></span>
                </button>
              ))}
            </div>
          </>}

          {step === 1 && <>
            <p className="eyebrow">Шаг 2 из {last + 1}</p>
            <h1>Как вас <em>зовут</em>?</h1>
            <p className="wiz-lead">Так имена будут написаны в приглашении. Справа сразу видно, как это выглядит.</p>
            <div className="wiz-fields">
              <div className="form-grid form-grid-2">
                <Field label="Невеста"><Input value={a} onChange={e => setA(e.target.value)} placeholder="Анна" autoFocus /></Field>
                <Field label="Жених"><Input value={b} onChange={e => setB(e.target.value)} placeholder="Михаил" /></Field>
              </div>
              <div className="form-grid form-grid-2">
                <Field label="Дата свадьбы" hint={date ? `${formatDateLong(date)}, ${weekday(date)}` : undefined}><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
                <Field label="Город"><Input value={city} onChange={e => setCity(e.target.value)} placeholder="Москва" /></Field>
              </div>
            </div>
          </>}

          {step === 2 && <>
            <p className="eyebrow">Шаг 3 из {last + 1}</p>
            <h1>Каким будет <em>ваш день</em>?</h1>
            <p className="wiz-lead">Возьмите готовый план за основу. Время и пункты поправите в конструкторе.</p>
            <div className="wiz-presets">
              <button type="button" className={'preset' + (preset === '' ? ' on' : '')} onClick={() => setPreset('')}>
                <b>Как в шаблоне</b><small>{getTemplate(tpl).program.map(p => p.title).slice(0, 4).join(' · ')}</small>
              </button>
              {PROGRAM_PRESETS.map(p => (
                <button key={p.id} type="button" className={'preset' + (preset === p.id ? ' on' : '')} onClick={() => setPreset(p.id)}>
                  <b>{p.name}</b><small>{p.items.map(i => `${i.time} ${i.title}`).slice(0, 4).join(' · ')}</small>
                </button>
              ))}
            </div>
          </>}

          {step === 3 && !me && <>
            <p className="eyebrow">Последний шаг</p>
            <h1>Сохраним <em>приглашение</em></h1>
            <p className="wiz-lead">Аккаунт нужен, чтобы вернуться к приглашению, собирать ответы гостей и редактировать вдвоём.</p>
            <form className="wiz-fields" onSubmit={e => { e.preventDefault(); create(); }}>
              <Field label="Ваше имя"><Input value={acc.name} onChange={e => setAcc({ ...acc, name: e.target.value })} placeholder={a || 'Анна'} autoComplete="name" /></Field>
              <Field label="E-mail"><Input type="email" value={acc.email} onChange={e => setAcc({ ...acc, email: e.target.value })} autoComplete="email" required /></Field>
              <Field label="Пароль" hint="Не короче 8 символов"><Input type="password" value={acc.password} onChange={e => setAcc({ ...acc, password: e.target.value })} autoComplete="new-password" minLength={8} required /></Field>
              <Consent checked={consent} onChange={setConsent} />
              <button type="submit" hidden />
              <p className="small muted">Уже есть аккаунт? <button type="button" className="link-btn" onClick={() => nav('login')}>Войти</button></p>
            </form>
          </>}

          {err && <div className="alert alert-error"><Icon name="alert" size={16} />{err}</div>}
          <div className="wiz-nav">
            {step > 0 && <Button variant="ghost" icon="left" onClick={() => setStep(step - 1)}>Назад</Button>}
            <span className="grow" />
            <Button variant="primary" size="lg" disabled={!canNext} loading={busy} onClick={next} iconRight={step < last ? 'right' : undefined}>
              {step < last ? 'Дальше' : me ? 'Создать приглашение' : 'Создать и сохранить'}
            </Button>
          </div>
        </section>
        <section className="wiz-stage" aria-label="Предпросмотр">
          <DeviceStage device="phone"><TemplateFrame project={preview} mode="public" fill /></DeviceStage>
        </section>
      </div>
    </div>
  );
}
