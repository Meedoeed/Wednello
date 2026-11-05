import React, { useRef, useState } from 'react';
import { TEMPLATES, TOKENS, GROUPS, ICONS } from '../../../shared/templates.js';
import { PROGRAM_PRESETS, presetItems, uid, interpolate, buildTokens, mapLink, formatDateLong, addDays } from '../../../shared/model.js';
import { BASIC_TEMPLATES } from '../../../shared/core.js';
import { uploadImage, uploadAudio, appAsset } from '../api.js';
import { Button, Icon, SvgHtml, Field, Input, Textarea, Toggle, Menu, Modal, Select, useSortable, useToast, Badge } from '../ui.jsx';
import { useApp } from '../App.jsx';

export const PANELS = [
  { id: 'main', icon: 'heart', label: 'Пара и дата', section: 'main' },
  { id: 'venues', icon: 'pin', label: 'Место', section: 'venues' },
  { id: 'program', icon: 'clock', label: 'План дня', section: 'program' },
  { id: 'photos', icon: 'image', label: 'Фото', section: 'photos' },
  { id: 'dress', icon: 'palette', label: 'Дресс-код', section: 'dress' },
  { id: 'rsvp', icon: 'inbox', label: 'Анкета', section: 'rsvp' },
  { id: 'texts', icon: 'type', label: 'Тексты' },
  { id: 'music', icon: 'music', label: 'Музыка' },
  { id: 'design', icon: 'layers', label: 'Шаблон' },
];

const TIMEZONES = [
  ['Europe/Kaliningrad', 'Калининград (UTC+2)'], ['Europe/Moscow', 'Москва (UTC+3)'], ['Europe/Samara', 'Самара (UTC+4)'],
  ['Asia/Yekaterinburg', 'Екатеринбург (UTC+5)'], ['Asia/Omsk', 'Омск (UTC+6)'], ['Asia/Novosibirsk', 'Новосибирск (UTC+7)'],
  ['Asia/Krasnoyarsk', 'Красноярск (UTC+7)'], ['Asia/Irkutsk', 'Иркутск (UTC+8)'], ['Asia/Yakutsk', 'Якутск (UTC+9)'],
  ['Asia/Vladivostok', 'Владивосток (UTC+10)'], ['Asia/Magadan', 'Магадан (UTC+11)'], ['Asia/Kamchatka', 'Камчатка (UTC+12)'],
  ['Europe/Minsk', 'Минск (UTC+3)'], ['Asia/Almaty', 'Алматы (UTC+5)'], ['Asia/Tbilisi', 'Тбилиси (UTC+4)'], ['Asia/Dubai', 'Дубай (UTC+4)'],
  ['Europe/Istanbul', 'Стамбул (UTC+3)'], ['Europe/Berlin', 'Берлин (UTC+1/+2)'], ['Europe/London', 'Лондон (UTC+0/+1)'],
];

const PALETTES = [
  { name: 'Пудра и шампань', colors: [['#e8d5cc', 'Пудровый'], ['#d9b99b', 'Шампань'], ['#b48a6e', 'Карамель'], ['#f4efe8', 'Молочный'], ['#7a6461', 'Какао']] },
  { name: 'Сад и шалфей', colors: [['#c9cfb9', 'Шалфей'], ['#8f9b78', 'Олива'], ['#e9e4d4', 'Лён'], ['#5b6b4e', 'Хвоя'], ['#d8c3a5', 'Песок']] },
  { name: 'Ночная синь', colors: [['#1f2a44', 'Полночь'], ['#3d5a80', 'Индиго'], ['#98c1d9', 'Небо'], ['#e0e5ec', 'Туман'], ['#a88f5c', 'Латунь']] },
  { name: 'Бордо и золото', colors: [['#5b1a1f', 'Бордо'], ['#8c2f39', 'Вишня'], ['#b08d4a', 'Золото'], ['#e8dcc0', 'Пергамент'], ['#2a1a14', 'Шоколад']] },
  { name: 'Лаванда', colors: [['#cfc3e0', 'Лаванда'], ['#9d8cbf', 'Сирень'], ['#efeaf4', 'Дымка'], ['#6b5b8a', 'Слива'], ['#c9c4b8', 'Камень']] },
  { name: 'Монохром', colors: [['#111111', 'Чёрный'], ['#5c5c5c', 'Графит'], ['#a3a3a3', 'Серый'], ['#e5e5e5', 'Жемчуг'], ['#ffffff', 'Белый']] },
];

/* ───────── общие кусочки ───────── */
function PanelHead({ title, children, help }) {
  return <div className="panel-head"><div><h2>{title}</h2>{help && <p className="muted small">{help}</p>}</div>{children}</div>;
}
function Group({ title, children, aside, collapsible, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={'pgroup' + (open ? '' : ' closed')}>
      {title && <div className="pgroup-head" onClick={collapsible ? () => setOpen(!open) : undefined} role={collapsible ? 'button' : undefined} tabIndex={collapsible ? 0 : undefined}>
        <h3>{title}</h3>{aside}{collapsible && <Icon name={open ? 'up' : 'down'} size={16} />}
      </div>}
      {open && <div className="pgroup-body">{children}</div>}
    </section>
  );
}

/** Поле текста шаблона с подстановками и сбросом к варианту шаблона */
function TokenInput({ value, onChange, multiline, placeholder, id }) {
  const ref = useRef(null);
  const insert = tok => {
    const el = ref.current; const v = value || '';
    const a = el?.selectionStart ?? v.length, b = el?.selectionEnd ?? v.length;
    const next = v.slice(0, a) + tok + v.slice(b);
    onChange(next);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(a + tok.length, a + tok.length); });
  };
  const Comp = multiline ? Textarea : Input;
  return (
    <div className="token-input">
      <Comp ref={ref} id={id} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
      <Menu align="right" trigger={<button type="button" className="token-btn" title="Вставить подстановку" aria-label="Вставить подстановку">{'{ }'}</button>}
        items={TOKENS.map(t => ({ label: t.label, hint: t.token, onClick: () => insert(t.token) }))} />
    </div>
  );
}
function TemplateTexts({ template, data, setData, groups, exclude = [] }) {
  const own = data.texts?.[template.id] || {};
  const tokens = buildTokens(data);
  const rows = template.texts.filter(([g, k]) => (!groups || groups.includes(g)) && !exclude.includes(k));
  if (!rows.length) return null;
  const set = (k, v) => setData(d => ({ ...d, texts: { ...d.texts, [template.id]: { ...(d.texts?.[template.id] || {}), [k]: v } } }), 'text-' + k);
  const reset = k => setData(d => { const o = { ...(d.texts?.[template.id] || {}) }; delete o[k]; return { ...d, texts: { ...d.texts, [template.id]: o } }; });
  return (
    <div className="ttexts">
      {rows.map(([, key, label, def, multi]) => {
        const v = own[key] ?? def;
        const changed = own[key] !== undefined && own[key] !== def;
        const shown = interpolate(v, tokens);
        return (
          <Field key={key} label={label} aside={changed && <button type="button" className="link-btn small" onClick={() => reset(key)}>Как в шаблоне</button>}
            hint={/\{[^}]+\}/.test(v) ? <>Гость увидит: <i>{shown}</i></> : undefined}>
            <TokenInput value={v} onChange={x => set(key, x)} multiline={multi || String(v).length > 60} />
          </Field>
        );
      })}
    </div>
  );
}
function SectionToggle({ data, setData, k, label = 'Показывать раздел' }) {
  return <Toggle checked={data.sections?.[k] !== false} onChange={v => setData(d => ({ ...d, sections: { ...d.sections, [k]: v } }))} label={label} />;
}
const deep = (d, path, v) => {
  const [h, ...rest] = path;
  return { ...d, [h]: rest.length ? deep(d[h] || {}, rest, v) : v };
};

export function PanelBody(props) {
  const map = { main: MainPanel, venues: VenuesPanel, program: ProgramPanel, photos: PhotosPanel, dress: DressPanel, rsvp: RsvpPanel, texts: TextsPanel, music: MusicPanel, design: DesignPanel };
  const C = map[props.id] || MainPanel;
  return <div className="panel" key={props.id}><C {...props} /></div>;
}

/* ───────── пара и дата ───────── */
function MainPanel({ data, setData, template }) {
  const set = (path, key) => e => setData(d => deep(d, path, e.target.value), key || path.join('.'));
  return <>
    <PanelHead title="Пара и дата" help="Имена и дата подставляются во все тексты приглашения." />
    <Group title="Пара">
      <div className="names-row">
        <Field label="Первое имя"><Input value={data.couple.a} onChange={set(['couple', 'a'])} /></Field>
        <Field label="Знак"><Select value={data.couple.sep} onChange={set(['couple', 'sep'])} options={['&', 'и', '+', '♥', '·']} /></Field>
        <Field label="Второе имя"><Input value={data.couple.b} onChange={set(['couple', 'b'])} /></Field>
      </div>
    </Group>
    <Group title="Дата и время">
      <div className="form-grid form-grid-2">
        <Field label="Дата"><Input type="date" value={data.event.date} onChange={set(['event', 'date'])} /></Field>
        <Field label="Город"><Input value={data.event.city} onChange={set(['event', 'city'])} /></Field>
        <Field label="Начало"><Input type="time" value={data.event.time} onChange={set(['event', 'time'])} /></Field>
        <Field label="Окончание" hint="Для календаря гостя"><Input type="time" value={data.event.endTime} onChange={set(['event', 'endTime'])} /></Field>
      </div>
      <Field label="Часовой пояс" hint="От него считается обратный отсчёт и событие в календаре">
        <Select value={data.event.timeZone} onChange={set(['event', 'timeZone'])} options={TIMEZONES.map(([value, label]) => ({ value, label }))} />
      </Field>
    </Group>
    <Group title="Тексты заставки" collapsible defaultOpen={false}>
      <TemplateTexts template={template} data={data} setData={setData} groups={['main']} />
    </Group>
  </>;
}

/* ───────── место ───────── */
function VenueCard({ title, v, onChange, same, onSame }) {
  const f = (k, key) => e => onChange({ ...v, [k]: e.target.value }, key);
  const link = mapLink(v);
  return (
    <Group title={title} aside={onSame && <Toggle checked={same} onChange={onSame} label="Там же" />}>
      {!same && <>
        <Field label="Название"><Input value={v.name} onChange={f('name')} placeholder={title === 'Церемония' ? 'Усадьба, ЗАГС, сад…' : 'Ресторан, лофт, шатёр…'} /></Field>
        <Field label="Адрес"><Input value={v.address} onChange={f('address')} placeholder="Город, улица, дом" /></Field>
      </>}
      <div className="form-grid form-grid-2">
        <Field label="Время"><Input type="time" value={v.time} onChange={f('time')} /></Field>
        {!same && <Field label="Ссылка на карту" hint={!v.mapUrl && link ? 'Подставим поиск в Яндекс Картах' : undefined}><Input value={v.mapUrl} onChange={f('mapUrl')} placeholder="https://…" /></Field>}
      </div>
      {!same && link && <a className="link-btn small" href={link} target="_blank" rel="noopener"><Icon name="external" size={14} /> Проверить на карте</a>}
    </Group>
  );
}
function VenuesPanel({ data, setData, template }) {
  const setV = k => (v, key) => setData(d => ({ ...d, venues: { ...d.venues, [k]: v } }), 'venue-' + k + (key || ''));
  return <>
    <PanelHead title="Место" help={template.features.venues === 'tickets' ? 'Попадает на билеты «Церемония» и «Банкет» в конце заставки.' : template.features.venues === 'place' ? 'Блок «Место нашей встречи» с кнопкой маршрута.' : 'Место церемонии выводится на странице-приглашении.'} />
    <VenueCard title="Церемония" v={data.venues.ceremony} onChange={setV('ceremony')} />
    <VenueCard title="Банкет" v={data.venues.party} onChange={setV('party')} same={data.venues.party.same}
      onSame={v => setData(d => ({ ...d, venues: { ...d.venues, party: { ...d.venues.party, same: v } } }))} />
    <Group title="Тексты" collapsible defaultOpen={false}>
      <TemplateTexts template={template} data={data} setData={setData} groups={['venues', 'tickets']} />
    </Group>
  </>;
}

/* ───────── план дня ───────── */
function IconPick({ value, onChange }) {
  return (
    <Menu align="left" trigger={<button type="button" className="icon-pick" title="Иконка" aria-label="Выбрать иконку">{value && value !== 'none' ? <SvgHtml html={ICONS[value]?.[1] || ''} size={20} /> : <Icon name="plus" size={14} />}</button>}
      items={Object.entries(ICONS).map(([k, [label, svg]]) => ({ label, icon: undefined, onClick: () => onChange(k), hint: k === value ? '✓' : '' }))} />
  );
}
function ProgramPanel({ data, setData, template }) {
  const [presetAsk, setPresetAsk] = useState(null);
  const items = data.program;
  const setItems = (fn, key) => setData(d => ({ ...d, program: typeof fn === 'function' ? fn(d.program) : fn }), key);
  const sort = useSortable(items, next => setItems(next));
  const upd = (id, patch, key) => setItems(list => list.map(i => (i.id === id ? { ...i, ...patch } : i)), key);
  const add = () => {
    const last = items[items.length - 1];
    const [h, m] = (last?.time || '15:00').split(':').map(Number);
    const t = `${String(Math.min(23, h + 1)).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;
    setItems(list => [...list, { id: uid(8), time: t, title: '', text: '', icon: 'none' }]);
    setTimeout(() => document.querySelector('.prog-item:last-child .prog-title input')?.focus(), 50);
  };
  const sorted = [...items].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  const isSorted = sorted.every((x, i) => x.id === items[i].id);
  return <>
    <PanelHead title="План дня" help={template.features.icons ? 'Порядок задаёте вы: перетащите пункт за ручку слева. Иконки видны в шаблоне Ivory.' : 'Порядок задаёте вы: перетащите пункт за ручку слева.'}>
      <Menu trigger={<Button variant="ghost" size="sm" icon="wand">Готовые планы</Button>}
        items={PROGRAM_PRESETS.map(p => ({ label: p.name, hint: p.hint, onClick: () => setPresetAsk(p) })).concat(['-', { label: 'План из шаблона', hint: template.name, onClick: () => setPresetAsk({ id: '_tpl', name: 'План из шаблона «' + template.name + '»' }) }])} />
    </PanelHead>
    <SectionToggle data={data} setData={setData} k="program" />
    {!isSorted && items.length > 1 && <button type="button" className="hint-bar" onClick={() => setItems(sorted)}><Icon name="sort" size={15} />Пункты идут не по времени — упорядочить</button>}
    <ol className={'prog-list' + (sort.dragging ? ' dragging' : '')}>
      {items.map((it, i) => (
        <li key={it.id} className="prog-item" {...sort.itemProps(it.id)}>
          <span {...sort.handleProps(it.id)}><Icon name="grip" size={18} /></span>
          <div className="prog-fields">
            <div className="prog-row">
              <input className="input prog-time" type="time" value={it.time} onChange={e => upd(it.id, { time: e.target.value }, 'pt' + it.id)} aria-label="Время" />
              <div className="prog-title"><input className="input" value={it.title} onChange={e => upd(it.id, { title: e.target.value }, 'pn' + it.id)} placeholder="Что происходит" aria-label="Название" /></div>
              <IconPick value={it.icon} onChange={v => upd(it.id, { icon: v })} />
              <Menu trigger={<button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Ещё"><Icon name="more" size={16} /></button>}
                items={[
                  { icon: 'up', label: 'Выше', disabled: i === 0, onClick: () => sort.move(it.id, -1) },
                  { icon: 'down', label: 'Ниже', disabled: i === items.length - 1, onClick: () => sort.move(it.id, 1) },
                  { icon: 'dup', label: 'Дублировать', onClick: () => setItems(l => { const n = l.slice(); n.splice(i + 1, 0, { ...it, id: uid(8) }); return n; }) },
                  '-', { icon: 'trash', label: 'Удалить', danger: true, onClick: () => setItems(l => l.filter(x => x.id !== it.id)) },
                ]} />
            </div>
            <Textarea value={it.text} onChange={e => upd(it.id, { text: e.target.value }, 'px' + it.id)} placeholder="Пара слов для гостей (необязательно)" rows={1} aria-label="Описание" />
          </div>
        </li>
      ))}
    </ol>
    <Button icon="plus" onClick={add} className="w-full">Добавить пункт</Button>
    <Group title="Тексты раздела" collapsible defaultOpen={false}>
      <TemplateTexts template={template} data={data} setData={setData} groups={['program']} />
    </Group>
    <Modal open={!!presetAsk} onClose={() => setPresetAsk(null)} size="sm" title="Заменить план дня?"
      footer={<><Button variant="ghost" onClick={() => setPresetAsk(null)}>Отмена</Button><Button variant="primary" onClick={() => {
        const next = presetAsk.id === '_tpl' ? template.program.map(x => ({ ...x, id: uid(8) })) : presetItems(presetAsk.id);
        setItems(next); setPresetAsk(null);
      }}>Заменить</Button></>}>
      <p className="muted">Текущие пункты заменятся на «{presetAsk?.name}». Если передумаете — нажмите «Отменить» вверху.</p>
    </Modal>
  </>;
}

/* ───────── фото ───────── */
function FocusPicker({ photo, onChange }) {
  const ref = useRef(null);
  const setFrom = e => {
    const r = ref.current.getBoundingClientRect();
    onChange({ x: Math.round(Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100))), y: Math.round(Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100))) });
  };
  return (
    <div className="focus-pick" ref={ref}
      onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); setFrom(e); }}
      onPointerMove={e => { if (e.buttons) setFrom(e); }} title="Нажмите, чтобы задать точку фокуса">
      <img src={appAsset(photo.src)} alt="" draggable="false" />
      <i style={{ left: photo.x + '%', top: photo.y + '%' }} />
    </div>
  );
}
function PhotosPanel({ data, setData, template }) {
  const toast = useToast();
  const [busy, setBusy] = useState(-1);
  const fileRef = useRef(null);
  const target = useRef(null);
  const slots = template.photos.slots;
  const photos = data.photos;
  const setPhotos = (fn, key) => setData(d => ({ ...d, photos: typeof fn === 'function' ? fn(d.photos) : fn }), key);
  const pick = i => { target.current = i; fileRef.current.click(); };
  const onFiles = async files => {
    const list = [...files].filter(f => f.type.startsWith('image/'));
    if (!list.length) return;
    let at = target.current ?? photos.findIndex(p => !p?.src);
    if (at < 0) at = photos.length;
    try {
      for (const f of list) {
        setBusy(at);
        const url = await uploadImage(f);
        const idx = at;
        setPhotos(ps => { const n = ps.slice(); while (n.length < idx) n.push({ id: uid(8), src: '', x: 50, y: 50, caption: '' }); n[idx] = { id: n[idx]?.id || uid(8), src: url, x: 50, y: 45, caption: n[idx]?.caption || '' }; return n; });
        at = target.current !== null && list.length === 1 ? at : at + 1;
      }
      toast(list.length > 1 ? `Загружено фото: ${list.length}` : 'Фото загружено');
    } catch (e) { toast('Не удалось загрузить: ' + e.message, 'error'); } finally { setBusy(-1); target.current = null; }
  };
  const upd = (i, patch, key) => setPhotos(ps => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)), key);
  const swap = (i, j) => setPhotos(ps => { const n = ps.slice(); while (n.length <= Math.max(i, j)) n.push({ id: uid(8), src: '', x: 50, y: 50, caption: '' }); [n[i], n[j]] = [n[j], n[i]]; return n; });
  const extra = photos.slice(slots.length).filter(p => p?.src);
  return <>
    <PanelHead title="Фото" help={template.photos.hint}>
      <Button size="sm" icon="upload" onClick={() => pick(null)}>Загрузить</Button>
    </PanelHead>
    <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => { onFiles(e.target.files); e.target.value = ''; }} />
    {'photos' in (data.sections || {}) && template.sections.includes('photos') && <SectionToggle data={data} setData={setData} k="photos" label="Показывать раздел «Кадры на память»" />}
    {template.id === 'ivory' && <SectionToggle data={data} setData={setData} k="story" label="Показывать раздел «История»" />}
    <div className="slots" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); target.current = null; onFiles(e.dataTransfer.files); }}>
      {slots.map((label, i) => {
        const p = photos[i];
        return (
          <div key={i} className={'slot' + (p?.src ? ' filled' : '')}>
            <div className="slot-head"><b className="num">{i + 1}</b><span>{label}</span>
              {p?.src && <Menu trigger={<button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Действия с фото"><Icon name="more" size={16} /></button>}
                items={[
                  { icon: 'upload', label: 'Заменить', onClick: () => pick(i) },
                  { icon: 'left', label: 'Поменять с предыдущим', disabled: i === 0, onClick: () => swap(i, i - 1) },
                  { icon: 'right', label: 'Поменять со следующим', disabled: i >= slots.length - 1, onClick: () => swap(i, i + 1) },
                  '-', { icon: 'trash', label: 'Убрать', danger: true, onClick: () => upd(i, { src: '' }) },
                ]} />}
            </div>
            {p?.src ? <>
              <FocusPicker photo={p} onChange={v => upd(i, v, 'focus' + i)} />
              <div className="slot-foot muted small">Точка фокуса: {p.x}% × {p.y}% — нажмите на лица</div>
              {i < template.photos.captions && (
                <Field label="Подпись к кадру"><Textarea value={p.caption || ''} onChange={e => upd(i, { caption: e.target.value }, 'cap' + i)}
                  placeholder={template.texts.find(x => x[1] === 'cap' + i)?.[3]} rows={1} /></Field>
              )}
            </> : (
              <button type="button" className="dropzone" onClick={() => pick(i)} disabled={busy === i}>
                {busy === i ? <span className="spin" /> : <Icon name="image" size={22} />}
                <span>{busy === i ? 'Загружаем…' : 'Выбрать фото или перетащить сюда'}</span>
              </button>
            )}
          </div>
        );
      })}
    </div>
    {extra.length > 0 && <p className="muted small">Ещё {extra.length} фото сохранены от другого шаблона и появятся, если вернуться к нему.</p>}
    {template.photos.captions > 0 && <Group title="Тексты раздела" collapsible defaultOpen={false}>
      <TemplateTexts template={template} data={data} setData={setData} groups={['photos']} exclude={Array.from({ length: template.photos.captions }, (_, i) => 'cap' + i)} />
    </Group>}
    {template.photos.captions === 0 && <Group title="Тексты раздела" collapsible defaultOpen={false}><TemplateTexts template={template} data={data} setData={setData} groups={['photos', 'story']} /></Group>}
  </>;
}

/* ───────── дресс-код ───────── */
function DressPanel({ data, setData, template }) {
  const colors = data.dress.colors;
  const setColors = (fn, key) => setData(d => ({ ...d, dress: { ...d.dress, colors: typeof fn === 'function' ? fn(d.dress.colors) : fn } }), key);
  const sort = useSortable(colors, next => setColors(next));
  const upd = (id, p, key) => setColors(l => l.map(c => (c.id === id ? { ...c, ...p } : c)), key);
  return <>
    <PanelHead title="Дресс-код" help="Палитра, в которой гостям будет красиво. До 8 цветов." />
    <SectionToggle data={data} setData={setData} k="dress" />
    <div className="palette-preview" aria-hidden="true">{colors.map(c => <i key={c.id} style={{ background: c.color }} />)}</div>
    <ul className="color-list">
      {colors.map(c => (
        <li key={c.id} className="color-item" {...sort.itemProps(c.id)}>
          <span {...sort.handleProps(c.id)}><Icon name="grip" size={18} /></span>
          <label className="color-swatch" style={{ background: c.color }}><input type="color" value={c.color} onChange={e => upd(c.id, { color: e.target.value }, 'cc' + c.id)} aria-label="Цвет" /></label>
          <input className="input mono hex" value={c.color} onChange={e => upd(c.id, { color: e.target.value.trim() }, 'ch' + c.id)} aria-label="Код цвета" maxLength={7} />
          <input className="input" value={c.name} onChange={e => upd(c.id, { name: e.target.value }, 'cn' + c.id)} placeholder="Название" aria-label="Название цвета" />
          <Button variant="ghost" size="sm" icon="trash" onClick={() => setColors(l => l.filter(x => x.id !== c.id))} aria-label="Убрать цвет" />
        </li>
      ))}
    </ul>
    <div className="row gap wrap">
      <Button icon="plus" disabled={colors.length >= 8} onClick={() => setColors(l => [...l, { id: uid(8), color: '#c8b7a6', name: '' }])}>Добавить цвет</Button>
      <Menu trigger={<Button variant="ghost" icon="palette">Готовые палитры</Button>}
        items={[{ label: `Палитра шаблона «${template.name}»`, onClick: () => setColors(template.palette.map(x => ({ id: uid(8), ...x }))) }, '-',
          ...PALETTES.map(p => ({ label: p.name, onClick: () => setColors(p.colors.map(([color, name]) => ({ id: uid(8), color, name }))) }))]} />
    </div>
    <Group title="Тексты раздела">
      <TemplateTexts template={template} data={data} setData={setData} groups={['dress']} />
    </Group>
  </>;
}

/* ───────── анкета ───────── */
function RsvpPanel({ data, setData, template }) {
  const r = data.rsvp;
  const set = (k, v, key) => setData(d => ({ ...d, rsvp: { ...d.rsvp, [k]: v } }), key);
  const qs = r.questions || [];
  const setQs = (fn, key) => setData(d => ({ ...d, rsvp: { ...d.rsvp, questions: fn(d.rsvp.questions || []) } }), key);
  const updQ = (id, p, key) => setQs(l => l.map(q => (q.id === id ? { ...q, ...p } : q)), key);
  const auto = addDays(data.event.date, -30);
  return <>
    <PanelHead title="Анкета гостя" help="Ответы попадают в раздел «Ответы» и в список гостей." />
    <SectionToggle data={data} setData={setData} k="rsvp" />
    <Group title="Сроки">
      <Field label="Ответить до" hint={!r.deadline ? `Не задано — подставим ${formatDateLong(auto)} (за месяц)` : undefined}>
        <Input type="date" value={r.deadline} onChange={e => set('deadline', e.target.value)} />
      </Field>
      <Toggle checked={r.closeAfterDeadline} onChange={v => set('closeAfterDeadline', v)} label="Закрыть анкету после срока" hint="Гости увидят, что приём ответов завершён" />
    </Group>
    <Group title="Что спрашиваем">
      <div className="stack">
        <div className="row gap between">
          <Toggle checked={r.askGuests} onChange={v => set('askGuests', v)} label="Сколько человек придёт" />
          {r.askGuests && <label className="inline-num">до <input className="input num" type="number" min={1} max={10} value={r.maxGuests} onChange={e => set('maxGuests', Math.max(1, Math.min(10, +e.target.value || 1)))} aria-label="Максимум гостей" /></label>}
        </div>
        <Toggle checked={r.askFood} onChange={v => set('askFood', v)} label="Предпочтения в еде и аллергии" />
        <Toggle checked={r.askWish} onChange={v => set('askWish', v)} label="Пожелания паре" />
      </div>
    </Group>
    <Group title="Свои вопросы" aside={<Badge>{qs.length}</Badge>}>
      {qs.length === 0 && <p className="muted small">Например: «Нужен ли трансфер?», «Останетесь на второй день?», «Какой алкоголь предпочитаете?»</p>}
      {qs.map(q => (
        <div key={q.id} className="q-card">
          <div className="row gap">
            <Input value={q.label} onChange={e => updQ(q.id, { label: e.target.value }, 'ql' + q.id)} placeholder="Текст вопроса" aria-label="Вопрос" />
            <Button variant="ghost" size="sm" icon="trash" onClick={() => setQs(l => l.filter(x => x.id !== q.id))} aria-label="Удалить вопрос" />
          </div>
          <div className="row gap wrap">
            <Select value={q.type} onChange={e => updQ(q.id, { type: e.target.value })} options={[{ value: 'choice', label: 'Выбор из вариантов' }, { value: 'text', label: 'Свободный ответ' }]} />
            {q.type === 'choice' && <Toggle checked={q.required} onChange={v => updQ(q.id, { required: v })} label="Обязательный" />}
          </div>
          {q.type === 'choice' && <Field label="Варианты" hint="Каждый с новой строки">
            <Textarea value={(q.options || []).join('\n')} onChange={e => updQ(q.id, { options: e.target.value.split('\n') }, 'qo' + q.id)} rows={3} />
          </Field>}
        </div>
      ))}
      <Button icon="plus" onClick={() => setQs(l => [...l, { id: uid(8), label: '', type: 'choice', options: ['Да', 'Нет'], required: false }])}>Добавить вопрос</Button>
    </Group>
    <Group title="Тексты анкеты" collapsible defaultOpen={false}>
      <TemplateTexts template={template} data={data} setData={setData} groups={['rsvp']} />
    </Group>
  </>;
}

/* ───────── все тексты ───────── */
function TextsPanel({ data, setData, template }) {
  const groups = [...new Set(template.texts.map(x => x[0]))];
  const own = data.texts?.[template.id] || {};
  const changed = Object.keys(own).length;
  return <>
    <PanelHead title="Все тексты" help="Тексты принадлежат шаблону: если сменить шаблон и вернуться, правки сохранятся. Кнопка { } вставляет имена, дату и место.">
      {changed > 0 && <Button variant="ghost" size="sm" icon="refresh" onClick={() => setData(d => ({ ...d, texts: { ...d.texts, [template.id]: {} } }))}>Сбросить все</Button>}
    </PanelHead>
    {groups.map(g => (
      <Group key={g} title={GROUPS[g] || g} collapsible defaultOpen={g === groups[0]}>
        <TemplateTexts template={template} data={data} setData={setData} groups={[g]} />
      </Group>
    ))}
  </>;
}

/* ───────── музыка ───────── */
function MusicPanel({ data, setData }) {
  const { me, nav } = useApp();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  const m = data.music;
  const allowed = me.plan?.features?.music;
  const set = p => setData(d => ({ ...d, music: { ...d.music, ...p } }));
  const onFile = async f => {
    if (!f) return; setBusy(true);
    try { const url = await uploadAudio(f); set({ src: url, name: f.name.replace(/\.[^.]+$/, ''), enabled: true }); toast('Трек загружен'); }
    catch (e) { toast(e.message, 'error', 5000); } finally { setBusy(false); }
  };
  return <>
    <PanelHead title="Музыка" help="Кнопка с нотой в углу приглашения. Музыка включается только по нажатию гостя — браузеры запрещают автозапуск со звуком." />
    {!allowed && <div className="alert alert-gold"><Icon name="crown" size={16} /><div>Музыка входит в Премиум. Настроить можно уже сейчас, гости услышат её после подключения тарифа. <button className="link-btn" onClick={() => nav('plans')}>Подробнее</button></div></div>}
    <Toggle checked={m.enabled} onChange={v => set({ enabled: v })} label="Музыка в приглашении" />
    <input ref={ref} type="file" accept="audio/mpeg,audio/mp4,audio/aac,audio/ogg,audio/*" hidden onChange={e => { onFile(e.target.files[0]); e.target.value = ''; }} />
    <Group title="Трек">
      {m.src ? <>
        <Field label="Название (для вас)"><Input value={m.name} onChange={e => setData(d => ({ ...d, music: { ...d.music, name: e.target.value } }), 'mname')} /></Field>
        <audio controls src={appAsset(m.src)} preload="none" className="audio" />
        <div className="row gap"><Button icon="upload" loading={busy} onClick={() => ref.current.click()}>Заменить</Button><Button variant="ghost" icon="trash" onClick={() => set({ src: '', name: '', enabled: false })}>Убрать</Button></div>
      </> : <>
        <button type="button" className="dropzone" onClick={() => ref.current.click()} disabled={busy}>{busy ? <span className="spin" /> : <Icon name="music" size={22} />}<span>Загрузить MP3 до 12 МБ</span></button>
        <button type="button" className="link-btn small" onClick={() => set({ src: '@demo/music.mp3', name: 'Демо-мелодия', enabled: true })}>Поставить демо-мелодию</button>
      </>}
    </Group>
    <p className="muted small">Используйте треки, на которые у пары есть права: собственную запись, музыку с открытой лицензией или купленную.</p>
  </>;
}

/* ───────── шаблон и оформление ───────── */
function DesignPanel({ data, setData, template, templateId, setTemplate }) {
  const { me } = useApp();
  const [ask, setAsk] = useState(null);
  const free = !me.plan?.features?.allTemplates;
  const sectionLabels = { program: 'План дня', dress: 'Дресс-код', photos: 'Кадры на память', rsvp: 'Анкета', words: 'Тёплые слова', story: 'История' };
  return <>
    <PanelHead title="Шаблон" help="Имена, дата, место, план дня, фото, палитра и анкета переходят в новый шаблон. Тексты у каждого шаблона свои." />
    {free && <p className="muted small">Шаблоны с отметкой «Премиум» можно примерить и настроить бесплатно, а опубликовать — после подключения тарифа.</p>}
    <div className="tpl-switch">
      {TEMPLATES.map(t => (
        <button key={t.id} type="button" className={'tpl-switch-item' + (t.id === templateId ? ' on' : '')} onClick={() => t.id !== templateId && setAsk(t)}>
          <img src={t.cover} alt="" loading="lazy" />
          <span><b>{t.name}{t.premium && <i className="pro-tag">Премиум</i>}</b><small>{t.mood.join(' · ')}</small></span>
          {t.id === templateId && <Icon name="check" size={16} />}
        </button>
      ))}
    </div>
    {template.themes && <Group title="Цвет бумаги">
      <div className="themes">
        {template.themes.map(th => (
          <button key={th.id} type="button" className={'theme' + ((data.theme?.[template.id] || template.themes[0].id) === th.id ? ' on' : '')}
            onClick={() => setData(d => ({ ...d, theme: { ...d.theme, [template.id]: th.id } }))}>
            <span style={{ background: th.colors.paper }}><i style={{ background: th.colors.dark }} /><i style={{ background: th.colors.gold }} /></span>{th.name}
          </button>
        ))}
      </div>
    </Group>}
    <Group title="Разделы">
      <div className="stack">
        {template.sections.map(k => <SectionToggle key={k} data={data} setData={setData} k={k} label={sectionLabels[k] || k} />)}
      </div>
    </Group>
    <Modal open={!!ask} onClose={() => setAsk(null)} size="sm" title={ask && `Перейти на «${ask.name}»?`}
      footer={<><Button variant="ghost" onClick={() => setAsk(null)}>Отмена</Button>
        <Button onClick={() => { setTemplate(ask.id); setAsk(null); }}>Сменить шаблон</Button>
        <Button variant="primary" onClick={() => { const t = ask; setData(d => ({ ...d, dress: { ...d.dress, colors: t.palette.map(x => ({ id: uid(8), ...x })) } })); setTemplate(t.id); setAsk(null); }}>Сменить и взять его палитру</Button></>}>
      <p className="muted">Все данные пары сохранятся. В «{ask?.name}» {ask?.photos.slots.length} мест для фото — лишние фото не пропадут.</p>
    </Modal>
  </>;
}
