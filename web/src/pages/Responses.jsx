import React, { useEffect, useMemo, useState } from 'react';
import { get, del, download } from '../api.js';
import { Button, Icon, Badge, Empty, Menu, Confirm, Segmented, useToast, copyText, plural, timeAgo } from '../ui.jsx';
import { ProjectHeader } from './ProjectHeader.jsx';

const toCsv = rows => rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');

export function ResponsesPage({ projectId }) {
  const toast = useToast();
  const [project, setProject] = useState(null);
  const [list, setList] = useState(null);
  const [guests, setGuests] = useState([]);
  const [filter, setFilter] = useState('all');
  const [toDelete, setToDelete] = useState(null);
  useEffect(() => {
    Promise.all([get('/projects/' + projectId), get(`/projects/${projectId}/responses`), get(`/projects/${projectId}/guests`)])
      .then(([p, r, g]) => { setProject(p); setList(r); setGuests(g); }).catch(e => toast(e.message, 'error'));
  }, [projectId]);

  const agg = useMemo(() => {
    if (!list) return null;
    const yes = list.filter(r => r.attending), no = list.filter(r => !r.attending);
    const people = yes.reduce((s, r) => s + (r.guests || 1), 0);
    const pending = guests.filter(g => !g.response);
    const food = yes.filter(r => r.food);
    const questions = {};
    for (const r of yes) for (const [k, v] of Object.entries(r.answers || {})) {
      questions[k] = questions[k] || {}; questions[k][v] = (questions[k][v] || 0) + 1;
    }
    return { yes, no, people, pending, food, questions, wishes: list.filter(r => r.wish) };
  }, [list, guests]);

  if (!project || !agg) return <div className="page"><span className="spin" /></div>;
  const shown = list.filter(r => filter === 'all' || (filter === 'yes' ? r.attending : !r.attending));
  const total = agg.yes.length + agg.no.length + agg.pending.length || 1;
  const qKeys = Object.keys(agg.questions);
  const rows = () => [['Имя', 'Ответ', 'Человек', 'Питание', 'Пожелания', ...qKeys, 'Гость из списка', 'Дата'],
    ...list.map(r => [r.name, r.attending ? 'Придёт' : 'Не придёт', r.guests, r.food, r.wish, ...qKeys.map(k => r.answers?.[k] || ''), r.guestName || '', new Date(r.createdAt).toLocaleString('ru-RU')])];

  return (
    <div className="page page-wide">
      <ProjectHeader project={project} tab="responses" responses={list.length} guests={guests.length}
        actions={list.length > 0 && <Menu trigger={<Button variant="ghost" icon="download">Выгрузить</Button>} items={[
          { icon: 'download', label: 'Скачать CSV для Excel', onClick: () => download(`otvety-${project.slug || project.id}.csv`, toCsv(rows())) },
          { icon: 'copy', label: 'Скопировать таблицу', hint: 'Для вставки в Google Таблицы', onClick: async () => { if (await copyText(rows().map(r => r.join('\t')).join('\n'))) toast('Таблица скопирована'); } },
        ]} />} />

      {list.length === 0 ? (
        <Empty icon="inbox" title="Ответов пока нет">Когда гости заполнят анкету в приглашении, здесь появятся их ответы, число гостей, пожелания и особенности питания.</Empty>
      ) : <>
        <div className="resp-summary">
          <div className="resp-big ok"><b className="num">{agg.people}</b><span>{plural(agg.people, 'человек придёт', 'человека придут', 'человек придут')}</span><small>{agg.yes.length} {plural(agg.yes.length, 'ответ', 'ответа', 'ответов')} «да»</small></div>
          <div className="resp-big no"><b className="num">{agg.no.length}</b><span>не смогут</span></div>
          <div className="resp-big"><b className="num">{agg.pending.length}</b><span>ждём ответа</span><small>из списка гостей</small></div>
          <div className="resp-bar" aria-label="Соотношение ответов">
            <i className="ok" style={{ flex: agg.yes.length / total }} title={`Придут: ${agg.yes.length}`} />
            <i className="no" style={{ flex: agg.no.length / total }} title={`Не придут: ${agg.no.length}`} />
            <i className="wait" style={{ flex: agg.pending.length / total }} title={`Ждём: ${agg.pending.length}`} />
            <div className="resp-legend"><span><em className="ok" />Придут</span><span><em className="no" />Не придут</span><span><em className="wait" />Ждём</span></div>
          </div>
        </div>

        <div className="resp-grid">
          <section className="card">
            <h3><Icon name="dinner" size={16} />Питание и аллергии <span className="muted num">{agg.food.length}</span></h3>
            {agg.food.length === 0 ? <p className="muted small">Никто не указал особенностей.</p> :
              <ul className="plain">{agg.food.map(r => <li key={r.id}><b>{r.name}</b><span>{r.food}</span></li>)}</ul>}
          </section>
          {qKeys.map(k => {
            const opts = Object.entries(agg.questions[k]).sort((a, b) => b[1] - a[1]);
            const max = Math.max(...opts.map(o => o[1]));
            return (
              <section className="card" key={k}>
                <h3><Icon name="chat" size={16} />{k}</h3>
                <ul className="bars">{opts.map(([o, n]) => <li key={o}><span>{o}</span><i style={{ width: (n / max) * 100 + '%' }} /><b className="num">{n}</b></li>)}</ul>
              </section>
            );
          })}
          <section className="card card-wishes">
            <h3><Icon name="heart" size={16} />Пожелания <span className="muted num">{agg.wishes.length}</span></h3>
            <ul className="wishes">{agg.wishes.slice(0, 8).map(r => <li key={r.id}><q>{r.wish}</q><small>{r.name}</small></li>)}</ul>
          </section>
        </div>

        <div className="toolbar">
          <Segmented value={filter} onChange={setFilter} options={[{ value: 'all', label: `Все · ${list.length}` }, { value: 'yes', label: `Придут · ${agg.yes.length}` }, { value: 'no', label: `Не придут · ${agg.no.length}` }]} />
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Гость</th><th>Ответ</th><th className="num">Чел.</th><th>Питание</th><th className="hide-sm">Пожелание</th>{qKeys.map(k => <th key={k} className="hide-sm">{k}</th>)}<th>Когда</th><th aria-label="Действия" /></tr></thead>
            <tbody>
              {shown.map(r => (
                <tr key={r.id}>
                  <td><b>{r.name}</b>{r.guestName && r.guestName !== r.name && <small className="muted block">по ссылке: {r.guestName}</small>}{!r.guestId && <small className="muted block">общая ссылка</small>}</td>
                  <td><Badge tone={r.attending ? 'ok' : 'danger'} dot>{r.attending ? 'Придёт' : 'Не придёт'}</Badge></td>
                  <td className="num">{r.guests || '—'}</td>
                  <td className="small">{r.food || <span className="muted">—</span>}</td>
                  <td className="hide-sm small clamp">{r.wish || <span className="muted">—</span>}</td>
                  {qKeys.map(k => <td key={k} className="hide-sm small">{r.answers?.[k] || <span className="muted">—</span>}</td>)}
                  <td className="small muted nowrap">{timeAgo(r.createdAt)}</td>
                  <td><Button size="sm" variant="ghost" icon="trash" onClick={() => setToDelete(r)} aria-label="Удалить ответ" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>}
      <Confirm open={!!toDelete} onClose={() => setToDelete(null)} title="Удалить ответ?" text={toDelete && `Ответ «${toDelete.name}» исчезнет из статистики. Гость сможет ответить ещё раз.`}
        onConfirm={async () => { await del('/responses/' + toDelete.id); setList(l => l.filter(x => x.id !== toDelete.id)); setGuests(await get(`/projects/${projectId}/guests`)); toast('Ответ удалён'); }} />
    </div>
  );
}
