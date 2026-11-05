import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { get, post, patch, inviteUrl, coupleUrl } from '../api.js';
import { getTemplate } from '../../../shared/templates.js';
import { readiness, slugify } from '../../../shared/model.js';
import { Button, Icon, Badge, Segmented, Modal, Field, Input, Toggle, CopyField, useToast, timeAgo } from '../ui.jsx';
import { TemplateFrame, DeviceStage } from '../Preview.jsx';
import { useApp, Logo } from '../App.jsx';
import { qrSvg } from '../lib/qr.js';
import { PANELS, PanelBody } from './Panels.jsx';
import { statusOf } from './Dashboard.jsx';
import { Paywall } from './Pricing.jsx';

const SECTION_TO_PANEL = { main: 'main', venues: 'venues', program: 'program', dress: 'dress', photos: 'photos', story: 'photos', rsvp: 'rsvp', words: 'texts', footer: 'texts' };

/* ───────── история изменений ───────── */
function useHistoryState(initial) {
  const [state, setState] = useState({ past: [], present: initial, future: [] });
  const last = useRef({ key: null, t: 0 });
  const set = useCallback((updater, key) => {
    setState(s => {
      const next = typeof updater === 'function' ? updater(s.present) : updater;
      if (next === s.present) return s;
      const now = Date.now();
      const merge = key && last.current.key === key && now - last.current.t < 1200;
      last.current = { key, t: now };
      return { past: merge ? s.past : [...s.past.slice(-80), s.present], present: next, future: [] };
    });
  }, []);
  const undo = useCallback(() => setState(s => (s.past.length ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] } : s)), []);
  const redo = useCallback(() => setState(s => (s.future.length ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) } : s)), []);
  const reset = useCallback(v => setState({ past: [], present: v, future: [] }), []);
  return { value: state.present, set, undo, redo, reset, canUndo: state.past.length > 0, canRedo: state.future.length > 0 };
}

export function EditorPage({ projectId }) {
  const { me, nav } = useApp();
  const toast = useToast();
  const [project, setProject] = useState(null);
  const [error, setError] = useState('');
  const doc = useHistoryState(null); // { title, templateId, data }
  const [save, setSave] = useState({ state: 'idle', at: null });
  const [panel, setPanel] = useState('main');
  const [focus, setFocus] = useState({ section: 'main', n: 0 });
  const [device, setDevice] = useState(() => (innerWidth < 1100 ? 'phone' : 'phone'));
  const [mobileView, setMobileView] = useState('edit');
  const [publishOpen, setPublishOpen] = useState(false);
  const [coupleOpen, setCoupleOpen] = useState(false);
  const [guests, setGuests] = useState([]);
  const [asGuest, setAsGuest] = useState('');
  const couple = me.role === 'couple';
  const savedRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const p = await get('/projects/' + projectId);
        setProject(p);
        const d = { title: p.title, templateId: p.templateId, data: p.data };
        doc.reset(d); savedRef.current = d;
        get(`/projects/${projectId}/guests`).then(setGuests).catch(() => {});
      } catch (e) { setError(e.message); }
    })();
  }, [projectId]);

  // автосохранение
  useEffect(() => {
    const d = doc.value;
    if (!d || d === savedRef.current) return;
    setSave(s => ({ ...s, state: 'pending' }));
    const id = setTimeout(async () => {
      setSave(s => ({ ...s, state: 'saving' }));
      try {
        const p = await patch('/projects/' + projectId, { title: d.title, templateId: d.templateId, data: d.data });
        savedRef.current = d; setProject(p); setSave({ state: 'saved', at: new Date().toISOString() });
      } catch (e) {
        setSave({ state: 'error', at: null, msg: e.message });
        if (e.status === 402) { toast(e.message, 'error', 6000); doc.undo(); }
      }
    }, 700);
    return () => clearTimeout(id);
  }, [doc.value]);

  // предупреждение о несохранённом
  useEffect(() => {
    const h = e => { if (save.state === 'pending' || save.state === 'saving') { e.preventDefault(); e.returnValue = ''; } };
    addEventListener('beforeunload', h); return () => removeEventListener('beforeunload', h);
  }, [save.state]);

  // горячие клавиши
  useEffect(() => {
    const k = e => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.key.toLowerCase() !== 'z') return;
      e.preventDefault(); e.shiftKey ? doc.redo() : doc.undo();
    };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  }, []);

  const setData = useCallback((fn, key) => doc.set(d => ({ ...d, data: typeof fn === 'function' ? fn(d.data) : fn }), key), [doc.set]);
  const openPanel = useCallback(id => {
    setPanel(id);
    const sec = PANELS.find(p => p.id === id)?.section;
    if (sec) setFocus(f => ({ section: sec, n: f.n + 1 }));
  }, []);

  if (error) return <div className="page"><div className="alert alert-error"><Icon name="alert" />{error}</div><Button onClick={() => nav('dashboard')}>К списку приглашений</Button></div>;
  if (!project || !doc.value) return <div className="editor-loading"><span className="spin" /> Открываем конструктор…</div>;

  const d = doc.value;
  const t = getTemplate(d.templateId);
  const previewProject = { id: project.id, templateId: d.templateId, data: d.data };
  const guest = guests.find(g => g.id === asGuest) || null;
  const brand = me.plan?.features?.removeBadge ? null : { text: 'Создано в WEDNELLO' };
  const st = statusOf(project);

  return (
    <div className={'editor mv-' + mobileView}>
      <header className="ed-top">
        <div className="ed-top-left">
          {couple ? <span className="ed-logo"><Logo small /></span> : <Button variant="ghost" icon="left" onClick={() => nav('dashboard')} aria-label="К приглашениям" />}
          <div className="ed-title">
            <input value={d.title} onChange={e => doc.set(x => ({ ...x, title: e.target.value }), 'title')} aria-label="Название приглашения" />
            <div className="ed-sub">
              <Badge tone={st.tone} dot>{st.label}</Badge>
              <SaveState s={save} />
            </div>
          </div>
        </div>
        <nav className="ed-tabs" aria-label="Разделы приглашения">
          <button className="on" type="button">Конструктор</button>
          <button type="button" onClick={() => nav('guests-' + project.id)}>Гости <span className="num">{guests.length}</span></button>
          <button type="button" onClick={() => nav('responses-' + project.id)}>Ответы <span className="num">{project.stats.responses}</span></button>
        </nav>
        <div className="ed-top-right">
          <Button variant="ghost" icon="undo" onClick={doc.undo} disabled={!doc.canUndo} title="Отменить (Ctrl+Z)" aria-label="Отменить" />
          <Button variant="ghost" icon="redo" onClick={doc.redo} disabled={!doc.canRedo} title="Повторить (Ctrl+Shift+Z)" aria-label="Повторить" />
          {!couple && <Button variant="ghost" icon="users" onClick={() => setCoupleOpen(true)} className="hide-sm">Вдвоём</Button>}
          <Button variant="primary" icon="send" onClick={() => setPublishOpen(true)}>{project.status === 'published' ? 'Публикация' : 'Опубликовать'}</Button>
        </div>
      </header>

      <div className="ed-body">
        <nav className="ed-rail" aria-label="Что настраиваем">
          {PANELS.filter(p => !p.only || p.only(t)).map(p => (
            <button key={p.id} type="button" className={panel === p.id ? 'on' : ''} onClick={() => openPanel(p.id)} aria-current={panel === p.id}>
              <Icon name={p.icon} size={19} /><span>{p.label}</span>
            </button>
          ))}
        </nav>
        <section className="ed-panel" aria-label={PANELS.find(p => p.id === panel)?.label}>
          <PanelBody id={panel} data={d.data} setData={setData} template={t} templateId={d.templateId}
            setTemplate={id => doc.set(x => ({ ...x, templateId: id }))} project={project} openPanel={openPanel} />
        </section>
        <section className="ed-stage">
          <div className="stage-tools">
            <Segmented size="sm" value={device} onChange={setDevice} options={[{ value: 'phone', icon: 'phone', title: 'Телефон' }, { value: 'desktop', icon: 'monitor', title: 'Компьютер' }]} />
            <label className="as-guest">
              <Icon name="eye" size={15} />
              <select value={asGuest} onChange={e => setAsGuest(e.target.value)} aria-label="Смотреть глазами гостя">
                <option value="">Глазами гостя: без обращения</option>
                {guests.map(g => <option key={g.id} value={g.id}>{g.greeting}</option>)}
              </select>
            </label>
            <span className="stage-hint">Нажмите «Изменить» в превью, чтобы открыть нужный раздел</span>
          </div>
          <DeviceStage device={device}>
            <TemplateFrame project={previewProject} mode="preview" brand={brand} guest={guest} focus={focus}
              onSelect={s => { const id = SECTION_TO_PANEL[s] || 'texts'; setPanel(id); setMobileView('edit'); }}
              onRsvp={() => ({ preview: true })} fill />
          </DeviceStage>
        </section>
      </div>
      <div className="mv-switch">
        <Segmented value={mobileView} onChange={setMobileView} options={[{ value: 'edit', icon: 'edit', label: 'Настройки' }, { value: 'preview', icon: 'eye', label: 'Превью' }]} />
      </div>

      <PublishDialog open={publishOpen} onClose={() => setPublishOpen(false)} project={project} setProject={setProject} data={d.data} templateId={d.templateId}
        flush={async () => { if (d !== savedRef.current) { const p = await patch('/projects/' + projectId, { title: d.title, templateId: d.templateId, data: d.data }); savedRef.current = d; setProject(p); } }}
        openPanel={id => { setPublishOpen(false); openPanel(id); }} />
      {!couple && <PartnerDialog open={coupleOpen} onClose={() => setCoupleOpen(false)} project={project} />}
    </div>
  );
}

function SaveState({ s }) {
  if (s.state === 'pending' || s.state === 'saving') return <span className="save-state"><span className="spin spin-xs" />Сохраняем…</span>;
  if (s.state === 'error') return <span className="save-state err" title={s.msg}><Icon name="alert" size={14} />Не сохранено</span>;
  if (s.state === 'saved') return <span className="save-state ok"><Icon name="check" size={14} />Сохранено</span>;
  return <span className="save-state"><Icon name="check" size={14} />Все изменения сохранены</span>;
}

/* ───────── публикация ───────── */
function PublishDialog({ open, onClose, project, setProject, data, templateId, flush, openPanel }) {
  const { me } = useApp();
  const toast = useToast();
  const couple = me.role === 'couple';
  const [slug, setSlug] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setSlug(project.slug || slugify([data.couple.a, data.couple.b].filter(Boolean).join(' и '))); }, [open]);
  const list = useMemo(() => readiness({ templateId, data }), [templateId, data]);
  const done = list.filter(x => x.ok).length;
  const url = project.slug ? inviteUrl(project.slug) : '';
  const canPublish = !couple || project.settings?.couplePublish !== false;
  const tpl = getTemplate(templateId);
  const locked = tpl.premium && !me.plan?.features?.allTemplates;

  const publish = async () => {
    setBusy(true);
    try { await flush(); const p = await post(`/projects/${project.id}/publish`, { slug }); setProject(p); toast(project.status === 'published' ? 'Изменения опубликованы' : 'Приглашение опубликовано'); }
    catch (e) { toast(e.message, 'error', 6000); } finally { setBusy(false); }
  };
  const unpublish = async () => { try { setProject(await post(`/projects/${project.id}/unpublish`)); toast('Приглашение снято с публикации'); } catch (e) { toast(e.message, 'error'); } };
  const markReady = async () => {
    try { await flush(); setProject(await patch(`/projects/${project.id}`, { readyForReview: !project.readyForReview })); toast(project.readyForReview ? 'Отметка снята' : 'Студия увидит, что приглашение готово'); } catch (e) { toast(e.message, 'error'); }
  };
  const published = project.status === 'published';
  const shareText = `Приглашаем вас на нашу свадьбу! ${url}`;

  return (
    <Modal open={open} onClose={onClose} size="lg" title={published ? 'Приглашение опубликовано' : 'Публикация'}
      subtitle={published ? 'Гости видят версию, опубликованную последней. Новые правки появятся у них после обновления.' : 'Проверьте, всё ли заполнено, и выберите адрес страницы.'}>
      <div className="publish">
        <div className="publish-col">
          <h4>Готовность <span className="num muted">{done} из {list.length}</span></h4>
          <ul className="checklist">
            {list.map(x => (
              <li key={x.label} className={x.ok ? 'ok' : ''}>
                <Icon name={x.ok ? 'check' : 'info'} size={16} />
                <span>{x.label}</span>
                {!x.ok && <button className="link-btn" onClick={() => openPanel(x.section)}>Заполнить</button>}
              </li>
            ))}
          </ul>
          {locked ? <Paywall title={`«${tpl.name}» — премиум-шаблон`}>{couple ? 'Чтобы опубликовать его, владельцу аккаунта нужно подключить Премиум. Или выберите бесплатный шаблон в разделе «Шаблон».' : 'Опубликуйте его после оплаты Премиума или выберите бесплатный шаблон в разделе «Шаблон» — все данные сохранятся.'}</Paywall> : canPublish ? <>
            <Field label="Адрес приглашения" hint="Латиница, цифры и дефис. Можно поменять до рассылки гостям.">
              <div className="slug-input"><span className="mono">…/i/</span><input className="input mono" value={slug} onChange={e => setSlug(slugify(e.target.value) || e.target.value)} /></div>
            </Field>
            <div className="row gap">
              <Button variant="primary" icon="send" loading={busy} onClick={publish}>{published ? (project.dirty ? 'Опубликовать изменения' : 'Обновить публикацию') : 'Опубликовать'}</Button>
              {published && !couple && <Button variant="ghost" onClick={unpublish}>Снять с публикации</Button>}
            </div>
          </> : (
            <div className="alert alert-info"><Icon name="info" size={16} />
              <div><b>Публикует ваш организатор.</b> Когда всё будет готово, отметьте это — студия получит уведомление в списке приглашений.
                <div className="mt"><Button variant={project.readyForReview ? 'default' : 'primary'} icon="check" onClick={markReady}>{project.readyForReview ? 'Снять отметку «готово»' : 'Готово, можно публиковать'}</Button></div>
              </div>
            </div>
          )}
        </div>
        <div className="publish-col publish-share">
          {published ? <>
            <div className="qr" dangerouslySetInnerHTML={{ __html: qrSvg(url) }} aria-label="QR-код приглашения" />
            <CopyField value={url} />
            <div className="row gap wrap">
              <a className="btn btn-default" href={url} target="_blank" rel="noopener"><Icon name="external" size={16} /><span>Открыть</span></a>
              <a className="btn btn-default" href={'https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent('Приглашаем вас на нашу свадьбу!')} target="_blank" rel="noopener"><Icon name="send" size={16} /><span>Telegram</span></a>
              <a className="btn btn-default" href={'https://wa.me/?text=' + encodeURIComponent(shareText)} target="_blank" rel="noopener"><Icon name="chat" size={16} /><span>WhatsApp</span></a>
            </div>
            <p className="muted small">Общая ссылка без имени. Для персонального обращения отправляйте ссылки из раздела «Гости» — так вы увидите, кто открыл и ответил.</p>
          </> : (
            <div className="publish-placeholder"><Icon name="qr" size={40} /><p>После публикации здесь появятся ссылка и QR-код для печатных приглашений.</p></div>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ───────── совместное редактирование ───────── */
function PartnerDialog({ open, onClose, project }) {
  const toast = useToast();
  const [link, setLink] = useState('');
  useEffect(() => { if (open) setLink(project.coupleToken ? coupleUrl(project.coupleToken) : ''); }, [open]);
  const reset = async () => { try { const r = await post(`/projects/${project.id}/couple-link`, { reset: true }); setLink(coupleUrl(r.token)); toast('Старая ссылка больше не работает'); } catch (e) { toast(e.message, 'error'); } };
  return (
    <Modal open={open} onClose={onClose} title="Редактировать вдвоём" subtitle="Отправьте ссылку партнёру. Регистрироваться не нужно." size="md">
      <div className="partner">
        <img src="img/f-guests.webp" alt="" className="partner-img" />
        <div className="stack">
          <p className="muted">По этой ссылке открывается это приглашение: конструктор, список гостей и ответы. Всё, что меняет партнёр, сохраняется сразу.</p>
          <CopyField value={link} />
          <div><Button variant="ghost" icon="refresh" onClick={reset}>Выпустить новую ссылку</Button></div>
          <p className="small muted">Новая ссылка отключает старую. Пригодится, если отправили не тому человеку.</p>
        </div>
      </div>
    </Modal>
  );
}
