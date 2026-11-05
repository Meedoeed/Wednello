import React, { useEffect, useMemo, useState } from 'react';
import { get, post, patch, del, inviteUrl, download } from '../api.js';
import { SALUTATIONS, guestGreeting, formatDateLong } from '../../../shared/model.js';
import { Button, Icon, Badge, Field, Input, Select, Modal, Menu, Confirm, Empty, Textarea, useToast, copyText, plural } from '../ui.jsx';
import { ProjectHeader } from './ProjectHeader.jsx';
import { useApp } from '../App.jsx';

export const DEFAULT_MESSAGE = '{Обращение} Мы женимся и очень хотим видеть вас рядом {Дата}. Всё о празднике и короткая анкета — по ссылке: {Ссылка}';

export function guestStatus(g) {
  if (g.response) return g.response.attending ? { key: 'yes', tone: 'ok', label: `Придёт${g.response.guests > 1 ? ' · ' + g.response.guests : ''}` } : { key: 'no', tone: 'danger', label: 'Не придёт' };
  if (g.openedAt) return { key: 'opened', tone: 'info', label: 'Открыл' };
  if (g.invitedAt) return { key: 'sent', tone: 'neutral', label: 'Отправлено' };
  return { key: 'new', tone: 'ghost', label: 'Не отправлено' };
}
const toCsv = rows => rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');

export function GuestsPage({ projectId }) {
  const { me } = useApp();
  const toast = useToast();
  const [project, setProject] = useState(null);
  const [guests, setGuests] = useState(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [group, setGroup] = useState('');
  const [edit, setEdit] = useState(null);
  const [importing, setImporting] = useState(false);
  const [msgOpen, setMsgOpen] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  const load = async () => {
    const [p, gs] = await Promise.all([get('/projects/' + projectId), get(`/projects/${projectId}/guests`)]);
    setProject(p); setGuests(gs);
  };
  useEffect(() => { load().catch(e => toast(e.message, 'error')); }, [projectId]);

  const groups = useMemo(() => [...new Set((guests || []).map(g => g.group).filter(Boolean))].sort(), [guests]);
  const shown = useMemo(() => (guests || []).filter(g =>
    (!q || (g.name + ' ' + g.group + ' ' + g.phone).toLowerCase().includes(q.toLowerCase())) &&
    (!status || guestStatus(g).key === status) && (!group || g.group === group)), [guests, q, status, group]);

  if (!project || !guests) return <div className="page"><span className="spin" /></div>;
  const published = project.status === 'published';
  const template = project.settings?.message || DEFAULT_MESSAGE;
  const linkOf = g => (published ? inviteUrl(project.slug, g.token) : '');
  const messageOf = g => template.replace('{Обращение}', g.greeting).replace('{Имя}', g.name).replace('{Дата}', formatDateLong(project.data.event.date)).replace('{Ссылка}', linkOf(g));
  const stats = {
    total: guests.length, seats: guests.reduce((s, g) => s + g.seats, 0),
    sent: guests.filter(g => g.invitedAt).length, opened: guests.filter(g => g.openedAt).length,
    yes: guests.filter(g => g.response?.attending), no: guests.filter(g => g.response && !g.response.attending).length,
  };
  const people = stats.yes.reduce((s, g) => s + (g.response.guests || 1), 0);
  const limit = me.plan?.limits?.guests;

  const save = async g => {
    try {
      if (g.id) { const u = await patch('/guests/' + g.id, g); setGuests(l => l.map(x => (x.id === u.id ? u : x))); toast('Гость сохранён'); }
      else { const [u] = await post(`/projects/${projectId}/guests`, g); setGuests(l => [...l, u]); toast('Гость добавлен'); }
      setEdit(null);
    } catch (e) { toast(e.message, 'error', 5000); }
  };
  const markSent = async (g, v = true) => { const u = await patch('/guests/' + g.id, { invited: v }); setGuests(l => l.map(x => (x.id === u.id ? u : x))); };
  const copyLink = async g => { if (!published) return toast('Сначала опубликуйте приглашение', 'warn'); if (await copyText(linkOf(g))) toast('Персональная ссылка скопирована'); };
  const copyMsg = async g => {
    if (!published) return toast('Сначала опубликуйте приглашение', 'warn');
    if (await copyText(messageOf(g))) { toast('Текст с ссылкой скопирован — отметили как отправленное'); markSent(g); }
  };
  const exportRows = () => [['Гость', 'Обращение', 'Группа', 'Мест', 'Статус', 'Придут', 'Телефон', 'E-mail', 'Ссылка', 'Заметка'],
    ...guests.map(g => [g.name, g.greeting, g.group, g.seats, guestStatus(g).label, g.response?.attending ? g.response.guests : 0, g.phone, g.email, linkOf(g), g.note])];

  return (
    <div className="page page-wide">
      <ProjectHeader project={project} tab="guests" guests={guests.length}
        actions={<>
          <Menu trigger={<Button variant="ghost" icon="download">Выгрузить</Button>} items={[
            { icon: 'download', label: 'Скачать CSV для Excel', onClick: () => download(`gosti-${project.slug || project.id}.csv`, toCsv(exportRows())) },
            { icon: 'copy', label: 'Скопировать таблицу', hint: 'Для вставки в Google Таблицы', onClick: async () => { if (await copyText(exportRows().map(r => r.join('\t')).join('\n'))) toast('Таблица скопирована'); } },
          ]} />
          <Button icon="upload" onClick={() => setImporting(true)}>Список целиком</Button>
          <Button variant="primary" icon="plus" onClick={() => setEdit({ name: '', salutation: 'Дорогие', seats: 1, group: '' })}>Гость</Button>
        </>} />

      {!published && <div className="alert alert-info"><Icon name="info" size={16} /><div>Приглашение ещё не опубликовано. Список можно собирать уже сейчас — персональные ссылки заработают после публикации.</div></div>}

      <div className="guest-stats">
        <div><b className="num">{stats.total}</b><span>{plural(stats.total, 'приглашение', 'приглашения', 'приглашений')} · {stats.seats} мест</span></div>
        <div><b className="num">{stats.sent}</b><span>отправлено</span></div>
        <div><b className="num">{stats.opened}</b><span>открыли</span></div>
        <div className="ok"><b className="num">{people}</b><span>{plural(people, 'человек придёт', 'человека придут', 'человек придут')}</span></div>
        <div className="no"><b className="num">{stats.no}</b><span>не смогут</span></div>
        <div className="funnel" aria-hidden="true">
          {[['sent', stats.sent], ['opened', stats.opened], ['answered', stats.yes.length + stats.no]].map(([k, v]) => <i key={k} className={'f-' + k} style={{ width: (stats.total ? (v / stats.total) * 100 : 0) + '%' }} />)}
        </div>
      </div>

      <div className="toolbar">
        <label className="search"><Icon name="search" size={16} /><input placeholder="Имя, группа или телефон" value={q} onChange={e => setQ(e.target.value)} aria-label="Поиск гостей" /></label>
        <Select value={status} onChange={e => setStatus(e.target.value)} aria-label="Статус" options={[{ value: '', label: 'Все статусы' }, { value: 'new', label: 'Не отправлено' }, { value: 'sent', label: 'Отправлено' }, { value: 'opened', label: 'Открыли' }, { value: 'yes', label: 'Придут' }, { value: 'no', label: 'Не придут' }]} />
        {groups.length > 0 && <Select value={group} onChange={e => setGroup(e.target.value)} aria-label="Группа" options={[{ value: '', label: 'Все группы' }, ...groups]} />}
        <span className="grow" />
        <Button variant="ghost" icon="chat" onClick={() => setMsgOpen(true)}>Текст сообщения</Button>
      </div>

      {guests.length === 0 ? (
        <Empty icon="users" title="Список гостей пуст" action={<div className="row gap"><Button icon="upload" onClick={() => setImporting(true)}>Вставить список</Button><Button variant="primary" icon="plus" onClick={() => setEdit({ name: '', salutation: 'Дорогие', seats: 1 })}>Добавить гостя</Button></div>}>
          Добавьте гостей, и у каждого будет своя ссылка с обращением по имени. Вы увидите, кто открыл приглашение и что ответил.
        </Empty>
      ) : (
        <div className="table-wrap">
          <table className="table guests-table">
            <thead><tr><th>Гость</th><th>Группа</th><th className="num">Мест</th><th>Статус</th><th className="hide-sm">Ответ</th><th aria-label="Действия" /></tr></thead>
            <tbody>
              {shown.map(g => {
                const st = guestStatus(g);
                return (
                  <tr key={g.id}>
                    <td><button type="button" className="cell-main" onClick={() => setEdit(g)}><b>{g.name}</b><small>{g.greeting}</small></button></td>
                    <td>{g.group ? <span className="chip">{g.group}</span> : <span className="muted">—</span>}</td>
                    <td className="num">{g.seats}</td>
                    <td><Badge tone={st.tone} dot>{st.label}</Badge>{g.opens > 1 && <small className="muted"> · {g.opens}×</small>}</td>
                    <td className="hide-sm small muted">{g.response ? new Date(g.response.createdAt).toLocaleDateString('ru-RU') : g.invitedAt ? 'ждём ответ' : ''}</td>
                    <td className="row-actions">
                      <Button size="sm" variant="ghost" icon="copy" onClick={() => copyMsg(g)} title="Скопировать сообщение со ссылкой">Сообщение</Button>
                      <Menu trigger={<Button size="sm" variant="ghost" icon="more" aria-label="Ещё" />} items={[
                        { icon: 'link', label: 'Скопировать ссылку', onClick: () => copyLink(g) },
                        published && { icon: 'send', label: 'Отправить в Telegram', onClick: () => { window.open('https://t.me/share/url?url=' + encodeURIComponent(linkOf(g)) + '&text=' + encodeURIComponent(messageOf(g).replace(linkOf(g), '')), '_blank'); markSent(g); } },
                        published && { icon: 'chat', label: 'Отправить в WhatsApp', onClick: () => { window.open(`https://wa.me/${(g.phone || '').replace(/\D/g, '')}?text=` + encodeURIComponent(messageOf(g)), '_blank'); markSent(g); } },
                        published && { icon: 'external', label: 'Открыть как гость', onClick: () => window.open(linkOf(g) + (linkOf(g).includes('?') ? '&' : '?') + 'peek=1', '_blank') },
                        '-',
                        g.invitedAt ? { icon: 'x', label: 'Снять отметку «отправлено»', onClick: () => markSent(g, false) } : { icon: 'check', label: 'Отметить отправленным', onClick: () => markSent(g) },
                        { icon: 'edit', label: 'Изменить', onClick: () => setEdit(g) },
                        { icon: 'trash', label: 'Удалить', danger: true, onClick: () => setToDelete(g) },
                      ]} />
                    </td>
                  </tr>
                );
              })}
              {shown.length === 0 && <tr><td colSpan={6} className="muted center">Никого не нашли — измените фильтр</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <GuestModal guest={edit} groups={groups} onClose={() => setEdit(null)} onSave={save} />
      <ImportModal open={importing} onClose={() => setImporting(false)} projectId={projectId} onDone={gs => { setGuests(l => [...l, ...gs]); setImporting(false); toast(`Добавлено: ${gs.length}`); }} />
      <MessageModal open={msgOpen} onClose={() => setMsgOpen(false)} value={template} sample={guests[0]} render={messageOf}
        onSave={async v => { const p = await patch('/projects/' + projectId, { settings: { message: v } }); setProject(p); setMsgOpen(false); toast('Текст сохранён'); }} />
      <Confirm open={!!toDelete} onClose={() => setToDelete(null)} title="Удалить гостя?" text={toDelete && `${toDelete.name}: персональная ссылка перестанет работать. Ответ, если был, останется в разделе «Ответы».`}
        onConfirm={async () => { await del('/guests/' + toDelete.id); setGuests(l => l.filter(x => x.id !== toDelete.id)); toast('Гость удалён'); }} />
    </div>
  );
}

function GuestModal({ guest, groups, onClose, onSave }) {
  const [g, setG] = useState(guest);
  const [busy, setBusy] = useState(false);
  useEffect(() => setG(guest), [guest]);
  if (!g) return null;
  const set = k => e => setG({ ...g, [k]: e.target.value });
  return (
    <Modal open={!!guest} onClose={onClose} size="md" title={g.id ? 'Гость' : 'Новый гость'}
      footer={<><Button variant="ghost" onClick={onClose}>Отмена</Button><Button variant="primary" loading={busy} disabled={!g.name?.trim()} onClick={async () => { setBusy(true); await onSave(g); setBusy(false); }}>Сохранить</Button></>}>
      <div className="form-grid form-grid-1">
        <Field label="Как написано в приглашении" hint="Например: «Ольга и Сергей», «Бабушка Валя», «Семья Орловых»"><Input value={g.name} onChange={set('name')} /></Field>
        <div className="form-grid form-grid-2">
          <Field label="Обращение"><Select value={g.salutation} onChange={set('salutation')} options={SALUTATIONS} /></Field>
          <Field label="Мест"><Input type="number" min={1} max={10} value={g.seats} onChange={set('seats')} /></Field>
        </div>
        {g.salutation === 'Свой вариант' && <Field label="Своё обращение"><Input value={g.custom || ''} onChange={set('custom')} placeholder="Любимые крёстные!" /></Field>}
        <div className="greeting-preview"><small>Гость увидит</small><b>{guestGreeting(g) || '—'}</b></div>
        <Field label="Группа"><Input value={g.group || ''} onChange={set('group')} list="guest-groups" placeholder="Семья невесты, друзья, коллеги…" /></Field>
        <datalist id="guest-groups">{groups.map(x => <option key={x} value={x} />)}</datalist>
        <div className="form-grid form-grid-2">
          <Field label="Телефон" hint="Для отправки в WhatsApp"><Input type="tel" value={g.phone || ''} onChange={set('phone')} /></Field>
          <Field label="E-mail"><Input type="email" value={g.email || ''} onChange={set('email')} /></Field>
        </div>
        <Field label="Заметка"><Input value={g.note || ''} onChange={set('note')} placeholder="Например: стол №3, приедут к банкету" /></Field>
      </div>
    </Modal>
  );
}

function parseList(text, salutation) {
  return text.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
    const [name, seats, group] = line.split(/[;\t]/).map(s => s?.trim());
    const many = /\sи\s|,|семья|&|\+/i.test(name);
    const first = (name || '').split(/\s+/)[0].toLowerCase();
    const female = /^(бабушка|тётя|тетя|мама|сестра|крёстная|крестная)$/.test(first) || (/[ая]$/.test(first) && !/^(дедушка|папа|дядя|никита|илья|миша|саша|женя|лёша|леша|паша|дима|петя|коля|ваня|серёжа|сережа|вова|костя|гоша|рома|слава|стёпа|степа|толя|юра|гриша|миша|лёва|лева|данила|фома|кузьма)$/.test(first));
    const auto = many ? 'Дорогие' : female ? 'Дорогая' : 'Дорогой';
    return { name, seats: +seats || (/\sи\s|&|\+/.test(name) ? 2 : 1), group: group || '', salutation: salutation === 'auto' ? auto : salutation };
  });
}
function ImportModal({ open, onClose, projectId, onDone }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [sal, setSal] = useState('auto');
  const [busy, setBusy] = useState(false);
  const items = parseList(text, sal);
  return (
    <Modal open={open} onClose={onClose} size="md" title="Добавить список гостей" subtitle="Вставьте из заметок, Excel или чата — по одному приглашению на строку"
      footer={<><Button variant="ghost" onClick={onClose}>Отмена</Button><Button variant="primary" loading={busy} disabled={!items.length} onClick={async () => {
        setBusy(true);
        try { onDone(await post(`/projects/${projectId}/guests`, { items })); setText(''); } catch (e) { toast(e.message, 'error', 6000); } finally { setBusy(false); }
      }}>Добавить {items.length || ''}</Button></>}>
      <Field label="Гости" hint="Формат строки: Имя; мест; группа. Мест и группа — необязательно. Пары через «и» получат 2 места.">
        <Textarea value={text} onChange={e => setText(e.target.value)} rows={8} autoGrow={false} placeholder={'Ольга и Сергей; 2; Семья невесты\nБабушка Валя; 1; Семья невесты\nИгорь Смирнов; ; Друзья жениха'} />
      </Field>
      <Field label="Обращение" hint="«Автоматически»: пары и семьи — «Дорогие», остальные — «Дорогой» или «Дорогая» по имени. Можно поправить у каждого гостя."><Select value={sal} onChange={e => setSal(e.target.value)} options={[{ value: 'auto', label: 'Автоматически' }, ...SALUTATIONS.filter(s => s !== 'Свой вариант')]} /></Field>
      {items.length > 0 && <div className="import-preview">{items.slice(0, 6).map((g, i) => <span key={i} className="chip">{g.salutation} {g.name} · {g.seats}{g.group ? ' · ' + g.group : ''}</span>)}{items.length > 6 && <span className="muted small">и ещё {items.length - 6}</span>}</div>}
    </Modal>
  );
}

function MessageModal({ open, onClose, value, onSave, sample, render }) {
  const [v, setV] = useState(value);
  useEffect(() => { if (open) setV(value); }, [open]);
  const tokens = ['{Обращение}', '{Имя}', '{Дата}', '{Ссылка}'];
  return (
    <Modal open={open} onClose={onClose} size="md" title="Текст сообщения гостям" subtitle="Подставляется при копировании и отправке в мессенджеры"
      footer={<><Button variant="ghost" onClick={() => setV(DEFAULT_MESSAGE)}>Вернуть исходный</Button><span className="grow" /><Button variant="primary" onClick={() => onSave(v)}>Сохранить</Button></>}>
      <Textarea value={v} onChange={e => setV(e.target.value)} rows={4} />
      <div className="chips mt">{tokens.map(t => <button key={t} type="button" className="chip chip-btn" onClick={() => setV(x => x + ' ' + t)}>{t}</button>)}</div>
      {sample && <div className="msg-preview"><small>Так увидит {sample.name}</small><p>{v.replace('{Обращение}', sample.greeting).replace('{Имя}', sample.name).replace('{Дата}', render(sample).match(/\d+ [а-я]+ \d{4}/)?.[0] || '').replace('{Ссылка}', '…/i/…')}</p></div>}
    </Modal>
  );
}
