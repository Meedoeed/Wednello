import { getTemplate, TEMPLATES } from './templates.js';

/* ───────── утилиты ───────── */
export const uid = (n = 12) => {
  const a = new Uint8Array(n); globalThis.crypto.getRandomValues(a);
  return Array.from(a, b => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
};
export const clone = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const withId = o => ({ id: uid(8), ...clone(o) });

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

export function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
}
export function formatDateLong(s) {
  const p = parseDate(s); if (!p) return '';
  return `${p.d} ${MONTHS[p.m - 1]} ${p.y}`;
}
export function formatDateShort(s) {
  const p = parseDate(s); if (!p) return '';
  return `${p.d} ${MONTHS[p.m - 1]}`;
}
export function formatDateDots(s) {
  const p = parseDate(s); if (!p) return '';
  return `${String(p.d).padStart(2, '0')} · ${String(p.m).padStart(2, '0')} · ${p.y}`;
}
export function weekday(s) {
  const p = parseDate(s); if (!p) return '';
  return WEEKDAYS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()];
}
export function addDays(s, n) {
  const p = parseDate(s); if (!p) return '';
  const d = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
  return d.toISOString().slice(0, 10);
}
export function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
}

/** Смещение часового пояса в формате +03:00 для даты */
export function tzOffset(date, timeZone) {
  try {
    const p = parseDate(date) || { y: 2027, m: 6, d: 12 };
    const f = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' });
    const name = f.formatToParts(new Date(Date.UTC(p.y, p.m - 1, p.d, 12))).find(x => x.type === 'timeZoneName')?.value || 'GMT';
    const m = /GMT([+-]\d{2}):?(\d{2})?/.exec(name);
    return m ? `${m[1]}:${m[2] || '00'}` : '+00:00';
  } catch { return '+03:00'; }
}
export function eventISO(date, time, timeZone) {
  if (!parseDate(date)) return '';
  const t = /^\d{2}:\d{2}$/.test(time || '') ? time : '16:00';
  return `${date}T${t}:00${tzOffset(date, timeZone || 'Europe/Moscow')}`;
}

const TRANSLIT = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
export function slugify(s) {
  return String(s || '').toLowerCase().split('').map(c => TRANSLIT[c] ?? c).join('')
    .replace(/&/g, '-i-').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'invite';
}

/* ───────── данные проекта ───────── */
export function defaultDate() {
  const d = new Date(); d.setUTCMonth(d.getUTCMonth() + 8);
  // ближайшая суббота
  d.setUTCDate(d.getUTCDate() + ((6 - d.getUTCDay() + 7) % 7));
  return d.toISOString().slice(0, 10);
}

export function defaultData(templateId, overrides = {}) {
  const t = getTemplate(templateId);
  return {
    couple: { a: 'Анна', b: 'Михаил', sep: '&' },
    event: { date: defaultDate(), time: '16:00', endTime: '23:00', timeZone: 'Europe/Moscow', city: 'Москва' },
    venues: {
      ceremony: { name: '', address: '', time: '16:00', mapUrl: '', note: '' },
      party: { same: false, name: '', address: '', time: '18:00', mapUrl: '', note: '' },
    },
    program: t.program.map(withId),
    dress: { colors: t.palette.map(withId) },
    photos: [],
    rsvp: { deadline: '', askGuests: true, maxGuests: 4, askFood: true, askWish: true, closeAfterDeadline: true, questions: [] },
    music: { enabled: false, src: '', name: '' },
    sections: { program: true, dress: true, photos: true, rsvp: true, words: true, story: true },
    texts: {},
    theme: { ivory: 'ivory' },
    ...clone(overrides),
  };
}

/** Мягкая миграция: дополняет старые данные недостающими полями */
export function normalizeData(data, templateId) {
  const base = defaultData(templateId);
  const d = clone(data || {});
  for (const k of Object.keys(base)) {
    if (d[k] === undefined) d[k] = base[k];
    else if (base[k] && typeof base[k] === 'object' && !Array.isArray(base[k]))
      d[k] = { ...base[k], ...d[k] };
  }
  d.venues.ceremony = { ...base.venues.ceremony, ...d.venues.ceremony };
  d.venues.party = { ...base.venues.party, ...d.venues.party };
  return d;
}

export const PROGRAM_PRESETS = [
  {
    id: 'classic', name: 'Классический день', hint: 'Сбор, церемония, банкет, танцы, торт',
    items: [
      { time: '15:30', title: 'Сбор гостей', text: 'Welcome-зона, лёгкие закуски и напитки.', icon: 'welcome' },
      { time: '16:00', title: 'Церемония', text: 'Самые важные слова. И вы — рядом.', icon: 'rings' },
      { time: '17:00', title: 'Фуршет и фотосессия', text: 'Поздравления, объятия и общие фотографии.', icon: 'camera' },
      { time: '18:00', title: 'Банкет', text: 'Ужин, тосты и тёплые истории.', icon: 'dinner' },
      { time: '20:00', title: 'Первый танец', text: 'А дальше — танцпол ваш.', icon: 'music' },
      { time: '21:30', title: 'Торт', text: 'Сладкая кульминация вечера.', icon: 'cake' },
      { time: '23:00', title: 'Финал вечера', text: 'Прощальный круг.', icon: 'moon' },
    ],
  },
  {
    id: 'registry', name: 'ЗАГС и ужин', hint: 'Роспись, прогулка, ужин с близкими',
    items: [
      { time: '12:00', title: 'Торжественная регистрация', text: 'Встречаемся у входа за 20 минут.', icon: 'ceremony' },
      { time: '13:00', title: 'Прогулка и фото', text: 'Немного времени для общих снимков.', icon: 'camera' },
      { time: '15:00', title: 'Трансфер', text: 'Автобус отвезёт гостей в ресторан.', icon: 'car' },
      { time: '16:00', title: 'Ужин', text: 'Тосты, тёплые слова и любимая музыка.', icon: 'dinner' },
      { time: '19:00', title: 'Торт', text: 'И ещё немного танцев.', icon: 'cake' },
    ],
  },
  {
    id: 'outdoor', name: 'Выездная церемония', hint: 'Трансфер, церемония на природе, вечер',
    items: [
      { time: '14:30', title: 'Трансфер из города', text: 'Отправление от метро, вернём всех вечером.', icon: 'car' },
      { time: '15:30', title: 'Велком', text: 'Лимонады, игристое и живая музыка.', icon: 'welcome' },
      { time: '16:00', title: 'Церемония под открытым небом', text: 'Возьмите солнечные очки.', icon: 'flower' },
      { time: '17:30', title: 'Ужин на террасе', text: 'Сезонное меню и тёплые слова.', icon: 'dinner' },
      { time: '20:30', title: 'Танцы', text: 'Диджей и ваши любимые песни.', icon: 'music' },
      { time: '22:30', title: 'Трансфер в город', text: 'Первый автобус — в 22:30, последний — в 00:30.', icon: 'moon' },
    ],
  },
  {
    id: 'two-days', name: 'Два дня праздника', hint: 'Вечеринка накануне + свадебный день',
    items: [
      { time: '19:00', title: 'Накануне: вечеринка', text: 'Знакомимся, обнимаемся и разогреваемся.', icon: 'music' },
      { time: '15:00', title: 'Свадебный день: сбор', text: 'Встречаемся на площадке.', icon: 'welcome' },
      { time: '16:00', title: 'Церемония', text: 'Главный момент.', icon: 'rings' },
      { time: '18:00', title: 'Банкет', text: 'Ужин и тосты.', icon: 'dinner' },
      { time: '22:00', title: 'Афтепати', text: 'Для самых стойких.', icon: 'moon' },
    ],
  },
];
export const presetItems = id => (PROGRAM_PRESETS.find(p => p.id === id)?.items || []).map(withId);

export const SALUTATIONS = ['Дорогие', 'Дорогой', 'Дорогая', 'Уважаемые', 'Свой вариант'];
export function guestGreeting(g) {
  if (!g) return '';
  if (g.salutation === 'Свой вариант') return g.custom || g.name || '';
  return `${g.salutation || 'Дорогие'} ${g.name}!`;
}

/* ───────── сборка модели для шаблона ───────── */
export function namesPlain(c) {
  if (!c) return '';
  return [c.a, c.b].filter(Boolean).join(' и ');
}

export function buildTokens(d) {
  const cer = d.venues?.ceremony || {}, par0 = d.venues?.party || {};
  const par = par0.same ? { ...cer, time: par0.time || cer.time } : par0;
  const deadline = d.rsvp?.deadline || addDays(d.event?.date, -30);
  return {
    'Имена': namesPlain(d.couple),
    'Дата': formatDateLong(d.event?.date),
    'Дата цифрами': formatDateDots(d.event?.date),
    'День недели': weekday(d.event?.date),
    'Время': d.event?.time || '',
    'Город': d.event?.city || 'город',
    'Церемония': cer.name || 'Место церемонии',
    'Церемония: время': cer.time || d.event?.time || '',
    'Церемония: адрес': cer.address || 'адрес уточняется',
    'Банкет': par.name || 'Ресторан',
    'Банкет: время': par.time || '',
    'Банкет: адрес': par.address || 'адрес уточняется',
    'Ответить до': formatDateLong(deadline),
  };
}
export function interpolate(str, tokens) {
  return String(str ?? '').replace(/\{([^{}]+)\}/g, (m, k) => (k in tokens ? tokens[k] : m));
}

export function mapLink(v) {
  if (!v) return '';
  if (v.mapUrl) return v.mapUrl;
  const q = [v.name, v.address].filter(Boolean).join(', ');
  return q && v.address ? 'https://yandex.ru/maps/?text=' + encodeURIComponent(q) : '';
}

/**
 * Готовая модель для рантайма шаблона.
 * ctx.asset(src) превращает ссылку из данных в URL для шаблона.
 */
export function resolveModel(project, ctx = {}) {
  const t = getTemplate(project.templateId);
  const d = normalizeData(project.data, t.id);
  const tokens = buildTokens(d);
  const asset = ctx.asset || (s => s);
  const own = d.texts?.[t.id] || {};
  const texts = {};
  for (const [, key, , def] of t.texts) texts[key] = interpolate(own[key] ?? def, tokens);
  const deadline = d.rsvp.deadline || addDays(d.event.date, -30);
  const today = ctx.today || new Date().toISOString().slice(0, 10);
  const closed = !!(d.rsvp.closeAfterDeadline && deadline && today > deadline);
  const cer = d.venues.ceremony, par = d.venues.party.same ? { ...cer, time: d.venues.party.time } : d.venues.party;
  return {
    templateId: t.id,
    title: `${namesPlain(d.couple)} — приглашение на свадьбу`,
    names: { a: d.couple.a || '', b: d.couple.b || '', sep: d.couple.sep || '&' },
    namesPlain: namesPlain(d.couple),
    date: d.event.date,
    dateLong: formatDateLong(d.event.date),
    time: d.event.time,
    startISO: eventISO(d.event.date, d.event.time, d.event.timeZone),
    endISO: eventISO(d.event.date, d.event.endTime || '23:00', d.event.timeZone),
    timeZone: d.event.timeZone,
    city: d.event.city,
    venues: {
      ceremony: { ...cer, map: mapLink(cer) },
      party: { ...par, map: mapLink(par) },
    },
    texts,
    program: d.program.filter(i => i.title || i.time).map(i => ({ time: i.time || '', title: i.title || '', text: i.text || '', icon: i.icon || 'none' })),
    colors: d.dress.colors.filter(c => /^#[0-9a-f]{6}$/i.test(c.color)).map(c => ({ color: c.color.toLowerCase(), name: c.name || '' })),
    photos: d.photos.map(p => ({ src: asset(p.src), x: p.x ?? 50, y: p.y ?? 50, caption: p.caption || '' })),
    sections: d.sections,
    rsvp: {
      enabled: d.sections.rsvp !== false,
      askGuests: !!d.rsvp.askGuests, maxGuests: Math.max(1, Math.min(10, +d.rsvp.maxGuests || 4)),
      askFood: !!d.rsvp.askFood, askWish: !!d.rsvp.askWish,
      questions: (d.rsvp.questions || []).filter(q => q.label).map(q => ({ id: q.id, label: q.label, type: q.type, options: (q.options || []).filter(Boolean), required: !!q.required })),
      deadline, closed,
      closedText: 'Приём ответов завершён. Если планы изменились — напишите паре лично.',
    },
    music: d.music.enabled && d.music.src ? { src: asset(d.music.src), name: d.music.name || '' } : null,
    theme: t.themes ? (t.themes.find(x => x.id === d.theme?.[t.id]) || t.themes[0]).colors : null,
    brand: ctx.brand || null,
    guest: ctx.guest ? { name: ctx.guest.name, greeting: guestGreeting(ctx.guest), seats: ctx.guest.seats || 1 } : null,
    focus: t.focus || {},
  };
}

/* ───────── проверка готовности ───────── */
export function readiness(project) {
  const t = getTemplate(project.templateId);
  const d = normalizeData(project.data, t.id);
  const list = [];
  const add = (ok, label, section) => list.push({ ok: !!ok, label, section });
  add(d.couple.a && d.couple.b, 'Имена пары', 'main');
  add(parseDate(d.event.date), 'Дата свадьбы', 'main');
  add(d.venues.ceremony.name && d.venues.ceremony.address, 'Место и адрес церемонии', 'venues');
  add(d.venues.party.same || (d.venues.party.name && d.venues.party.address), 'Место банкета', 'venues');
  add(d.photos.filter(p => p.src).length >= Math.min(2, t.photos.max), `Фотографии пары (${t.photos.slots.length} мест)`, 'photos');
  add(d.program.length > 0 || d.sections.program === false, 'План дня', 'program');
  add(d.rsvp.deadline || d.sections.rsvp === false, 'Срок ответа гостей', 'rsvp');
  return list;
}

export { TEMPLATES };
