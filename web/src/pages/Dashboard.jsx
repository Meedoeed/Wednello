import React, { useEffect, useMemo, useState } from 'react';
import { get, post, patch, del, appAsset, inviteUrl } from '../api.js';
import { getTemplate } from '../../../shared/templates.js';
import { Button, Icon, Badge, Progress, Menu, Confirm, useToast, fmtDate, daysUntil, plural, timeAgo, Empty } from '../ui.jsx';
import { useApp } from '../App.jsx';

export function statusOf(p) {
  if (p.archived) return { tone: 'neutral', label: 'В архиве' };
  if (p.readyForReview) return { tone: 'gold', label: 'Партнёр отметил: готово' };
  if (p.status === 'published' && p.dirty) return { tone: 'warn', label: 'Есть неопубликованные правки' };
  if (p.status === 'published') return { tone: 'ok', label: 'Опубликовано' };
  return { tone: 'neutral', label: 'Черновик' };
}

export function Dashboard() {
  const { me, nav, refreshMe } = useApp();
  const toast = useToast();
  const [list, setList] = useState(null);
  const [activity, setActivity] = useState([]);
  const [toDelete, setToDelete] = useState(null);
  const [showArchive, setShowArchive] = useState(false);
  const load = async () => { const [ps, act] = await Promise.all([get('/projects'), get('/activity')]); setList(ps); setActivity(act); };
  useEffect(() => { load(); }, []);
  const act = async (fn, okText) => { try { await fn(); okText && toast(okText); await load(); refreshMe(); } catch (e) { toast(e.message, 'error', 5000); } };

  const active = (list || []).filter(p => !p.archived);
  const archived = (list || []).filter(p => p.archived);
  const main = useMemo(() => [...active].sort((a, b) => (b.status === 'published') - (a.status === 'published'))[0], [list]);
  const ordered = useMemo(() => [...active].sort((a, b) => (b.status === 'published') - (a.status === 'published')), [list]);
  const days = main ? daysUntil(main.date) : null;
  const firstName = (me.user?.name || '').split(' ')[0];

  return (
    <div className="page dash">
      <header className="dash-hero">
        <img className="sprig dash-sprig" src="img/sprig-gypsophila.webp" alt="" />
        <p className="eyebrow">{main ? fmtDate(main.date) : 'Добро пожаловать'}</p>
        <h1>{firstName ? `${firstName}, ` : ''}{days !== null && days > 0 ? <>до свадьбы <em>{days} {plural(days, 'день', 'дня', 'дней')}</em></> : days === 0 ? <em>сегодня ваш день</em> : main ? <>ваши <em>приглашения</em></> : <>начнём <em>с приглашения</em></>}</h1>
      </header>

      {!list ? <div className="skeleton" /> : active.length === 0 ? (
        <Empty image="img/envelope.webp" title="Здесь появится ваше приглашение" action={<Button variant="primary" size="lg" icon="plus" onClick={() => nav('new')}>Создать приглашение</Button>}>
          Выберите шаблон и впишите имена. Остальное можно заполнить потом, в своём темпе.
        </Empty>
      ) : (
        <div className="inv-list">
          {ordered.map(p => <InviteCard key={p.id} p={p} onDelete={() => setToDelete(p)} act={act} />)}
          <button type="button" className="inv-new" onClick={() => nav('new')}>
            <span className="inv-new-ico"><Icon name="plus" size={22} /></span>
            <b>Ещё одно приглашение</b>
            <small>Например, в другом стиле или для второго дня праздника</small>
          </button>
        </div>
      )}

      {activity.length > 0 && <section className="feed">
        <h2>Последние ответы</h2>
        <ul>
          {activity.slice(0, 6).map(r => (
            <li key={r.id}>
              <span className={'dot ' + (r.attending ? 'dot-ok' : 'dot-no')} />
              <div><b>{r.name}</b> {r.attending ? <>придёт{r.guests > 1 ? `, ${r.guests} ${plural(r.guests, 'человек', 'человека', 'человек')}` : ''}</> : 'не сможет прийти'}
                {r.wish && <q>{r.wish}</q>}</div>
              <small>{timeAgo(r.createdAt)}</small>
            </li>
          ))}
        </ul>
      </section>}

      {archived.length > 0 && <section className="archive">
        <button type="button" className="link-btn" onClick={() => setShowArchive(!showArchive)}><Icon name="archive" size={15} />Архив · {archived.length}</button>
        {showArchive && <div className="inv-list mt">{archived.map(p => <InviteCard key={p.id} p={p} onDelete={() => setToDelete(p)} act={act} />)}</div>}
      </section>}

      <Confirm open={!!toDelete} onClose={() => setToDelete(null)} title="Удалить приглашение?"
        text={toDelete && `«${toDelete.title}» удалится вместе со списком гостей и ответами. Ссылки у гостей перестанут работать.`}
        onConfirm={() => act(() => del('/projects/' + toDelete.id), 'Приглашение удалено')} />
    </div>
  );
}

function InviteCard({ p, onDelete, act }) {
  const { nav } = useApp();
  const t = getTemplate(p.templateId);
  const st = statusOf(p);
  const [done, total] = String(p.readiness).split('/').map(Number);
  const steps = [
    { ok: done >= total, label: 'Заполнить приглашение', hint: `${done} из ${total} разделов`, go: () => nav('editor-' + p.id) },
    { ok: p.status === 'published', label: 'Опубликовать', hint: 'Получить ссылку и QR-код', go: () => nav('editor-' + p.id) },
    { ok: p.stats.guests > 0, label: 'Добавить гостей', hint: 'Список можно вставить целиком', go: () => nav('guests-' + p.id) },
    { ok: p.stats.guests > 0 && p.stats.sent >= p.stats.guests, label: 'Разослать личные ссылки', hint: p.stats.guests ? `Отправлено ${p.stats.sent} из ${p.stats.guests}` : 'После добавления гостей', go: () => nav('guests-' + p.id) },
  ];
  const nextIdx = steps.findIndex(s => !s.ok);
  const rate = p.stats.guests ? Math.round((p.stats.responses / p.stats.guests) * 100) : 0;
  return (
    <article className="inv-card">
      <button type="button" className="inv-cover" onClick={() => nav('editor-' + p.id)} aria-label={`Открыть «${p.title}» в конструкторе`}>
        <span className="inv-paper">
          <small>Приглашение на свадьбу</small>
          <b>{p.couple.a || '—'}<em>&amp;</em>{p.couple.b || '—'}</b>
          <span>{fmtDate(p.date)}</span>
          <img src="img/sprig-olive.webp" alt="" />
        </span>
        {p.cover && <span className="inv-photo"><img src={appAsset(p.cover)} alt="" /></span>}
      </button>
      <div className="inv-body">
        <div className="inv-top">
          <Badge tone={st.tone} dot>{st.label}</Badge>
          <span className="muted small">{t.name}</span>
          <span className="grow" />
          <Menu trigger={<Button variant="ghost" icon="more" aria-label="Ещё" />} items={[
            p.status === 'published' && { icon: 'external', label: 'Открыть как гость', onClick: () => window.open(inviteUrl(p.slug), '_blank') },
            { icon: 'dup', label: 'Сделать копию', onClick: () => act(() => post(`/projects/${p.id}/duplicate`), 'Копия создана') },
            p.archived ? { icon: 'refresh', label: 'Вернуть из архива', onClick: () => act(() => patch(`/projects/${p.id}`, { archived: false }), 'Возвращено') }
              : { icon: 'archive', label: 'В архив', onClick: () => act(() => patch(`/projects/${p.id}`, { archived: true }), 'Отправлено в архив') },
            '-', { icon: 'trash', label: 'Удалить', danger: true, onClick: onDelete },
          ]} />
        </div>
        <h2 className="inv-title">{p.couple.a && p.couple.b ? <>{p.couple.a} <em>&amp;</em> {p.couple.b}</> : p.title}</h2>
        <p className="inv-sub">{fmtDate(p.date)}{p.title !== `${p.couple.a} и ${p.couple.b}` && <> · {p.title}</>}</p>

        <div className="inv-stats">
          <div><b>{p.stats.guests}</b><span>гостей</span></div>
          <div><b>{p.stats.opened}</b><span>открыли</span></div>
          <div><b>{p.stats.people}</b><span>придут</span></div>
          <div><b>{p.stats.no}</b><span>не смогут</span></div>
          <div className="inv-rate"><Progress value={rate} /><span>{rate}% ответили</span></div>
        </div>

        {!p.archived && nextIdx >= 0 && (
          <ol className="next-steps">
            {steps.map((s, i) => (
              <li key={s.label} className={s.ok ? 'ok' : i === nextIdx ? 'next' : ''}>
                <span className="ns-mark">{s.ok ? <Icon name="check" size={12} /> : i + 1}</span>
                <span className="ns-txt"><b>{s.label}</b><small>{s.hint}</small></span>
                {i === nextIdx && <button type="button" className="link-btn" onClick={s.go}>Перейти<Icon name="right" size={14} /></button>}
              </li>
            ))}
          </ol>
        )}

        <div className="inv-actions">
          <Button variant="primary" icon="edit" onClick={() => nav('editor-' + p.id)}>Конструктор</Button>
          <Button variant="outline" icon="users" onClick={() => nav('guests-' + p.id)}>Гости</Button>
          <Button variant="outline" icon="inbox" onClick={() => nav('responses-' + p.id)}>Ответы{p.stats.responses ? ` · ${p.stats.responses}` : ''}</Button>
        </div>
      </div>
    </article>
  );
}
