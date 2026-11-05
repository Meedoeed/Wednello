// WEDNELLO → Ivory Letter: превращает модель конструктора в config.json шаблона.
const base = await fetch(new URL('./config.json', import.meta.url), { cache: 'no-store' }).then(r => r.json());
const ICON_KEYS = ['welcome', 'rings', 'dinner', 'music', 'camera', 'cake', 'car', 'moon', 'flower', 'ceremony', 'none'];
const SECTION_EL = { main: '#invitation', venues: '#place', program: '#program', dress: '#details', photos: '#story', story: '#story', rsvp: '#rsvp', footer: 'footer', words: '#invitation' };
const root = () => document.querySelector('#invitation-root');
let mounted = false, lastPayload = null;

const paras = s => String(s || '').split(/\n\s*\n/).map(x => x.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
const isoNoMs = d => new Date(d).toISOString().replace(/\.\d{3}Z$/, 'Z');

function build(m, payload) {
  const c = structuredClone(base);
  const T = m.texts || {};
  const S = m.sections || {};
  c.id = 'vz-' + String(payload.id || 'preview').replace(/[^a-zA-Z0-9_-]/g, '');
  c.meta.title = m.title || c.meta.title;
  c.meta.description = `${m.namesPlain}. ${m.dateLong}.`;
  c.couple = { firstName: m.names.a || '—', secondName: m.names.b || '—', separator: m.names.sep || '&' };
  if (m.date && m.startISO) {
    c.event.date = m.date; c.event.startAt = m.startISO;
    let end = m.endISO && Date.parse(m.endISO) > Date.parse(m.startISO) ? m.endISO : isoNoMs(Date.parse(m.startISO) + 7 * 3600e3);
    c.event.endAt = end; c.event.timeZone = m.timeZone || 'Europe/Moscow';
  }
  c.event.calendarTitle = `Свадьба: ${m.namesPlain}`;
  c.event.calendarDescription = [m.venues.ceremony.name, m.venues.ceremony.address].filter(Boolean).join(', ') || 'Детали — в приглашении.';
  if (m.theme) c.theme = { ...c.theme, ...m.theme };

  c.header.brand = T.brand || c.header.brand;
  c.header.brandAccent = T.brandAccent || '';
  Object.assign(c.opening, { eyebrow: T.openingEyebrow, title: { text: T.openingTitle, accent: T.openingAccent }, description: T.openingDescription, letterLabel: T.letterLabel, sideLabel: T.sideLabel });
  Object.assign(c.invitation, { eyebrow: T.invitationEyebrow, greeting: m.guest ? m.guest.greeting : T.greeting, paragraphs: paras(T.invitationText) });

  const ph = (p, alt, placeholder) => ({ src: p?.src || '', alt, position: { x: Math.round(p?.x ?? 50), y: Math.round(p?.y ?? 50) }, placeholder, aspectRatio: '4 / 5' });
  Object.assign(c.story, {
    enabled: S.story !== false, eyebrow: T.storyEyebrow, title: { text: T.storyTitle, accent: T.storyAccent },
    paragraphs: paras(T.storyText), signature: T.storySignature,
    photo: ph(m.photos[0], `Фотография: ${m.namesPlain}`, 'Здесь будет ваша фотография'),
  });
  Object.assign(c.day, { eyebrow: T.dayEyebrow, title: { text: T.dayTitle, accent: T.dayAccent }, countdownLabel: T.countdownLabel });

  const cer = m.venues.ceremony, par = m.venues.party;
  const line = v => [v.name, v.address].filter(Boolean).join(', ');
  let address = line(cer) ? `${line(cer)}${cer.time ? ' · ' + cer.time : ''}` : 'Скоро здесь появятся название площадки и адрес.';
  if (!par.same && line(par) && line(par) !== line(cer)) address += ` — банкет: ${line(par)}${par.time ? ' · ' + par.time : ''}`;
  const map = /^https?:\/\//.test(cer.map || '') ? cer.map : '';
  Object.assign(c.place, {
    eyebrow: T.placeEyebrow, title: T.placeTitle, address, description: T.placeDescription, mapUrl: map,
    photo: ph(m.photos[1], `Фотография: ${m.namesPlain}`, 'Ещё один ваш счастливый момент'),
  });

  const ids = new Set();
  c.program = {
    ...c.program, enabled: S.program !== false, eyebrow: T.programEyebrow, title: { text: T.programTitle, accent: T.programAccent }, note: T.programNote,
    items: m.program.filter(i => /^([01]\d|2[0-3]):[0-5]\d$/.test(i.time)).map((i, n) => {
      let id = 'p' + n; while (ids.has(id)) id += 'x'; ids.add(id);
      return { id, time: i.time, title: i.title, description: i.text || '', icon: ICON_KEYS.includes(i.icon) ? i.icon : 'none' };
    }),
  };
  Object.assign(c.details, { enabled: S.dress !== false, eyebrow: T.dressEyebrow, title: { text: T.dressTitle, accent: T.dressAccent }, description: T.dressLead, colors: m.colors.map(x => ({ color: x.color, label: x.name })) });

  const r = m.rsvp;
  const fields = [
    { id: 'name', type: 'text', label: T.rsvpName, placeholder: 'Имя и фамилия', required: true, maxLength: 100, autocomplete: 'name' },
    { id: 'attending', type: 'radio', label: T.rsvpAttend, required: true, options: [{ value: 'yes', label: T.rsvpYes }, { value: 'no', label: T.rsvpNo }] },
  ];
  if (r.askGuests) fields.push({ id: 'guests', type: 'select', label: T.rsvpGuests, required: false, options: Array.from({ length: r.maxGuests }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })) });
  if (r.askFood) fields.push({ id: 'food', type: 'text', label: T.rsvpFood, placeholder: 'Например: без орехов', required: false, maxLength: 300 });
  for (const q of r.questions) {
    const id = 'q_' + String(q.id).replace(/[^a-z0-9_-]/gi, '');
    if (q.type === 'choice' && q.options.length) fields.push({ id, type: 'radio', label: q.label, required: !!q.required, options: [...new Set(q.options)].map(o => ({ value: o, label: o })) });
    else fields.push({ id, type: 'text', label: q.label, required: false, maxLength: 300 });
  }
  if (r.askWish) fields.push({ id: 'note', type: 'textarea', label: T.rsvpWish, placeholder: 'Всё, что нам стоит знать', required: false, maxLength: 1000 });
  Object.assign(c.rsvp, {
    enabled: r.enabled, title: { text: T.rsvpTitle, accent: T.rsvpAccent },
    description: r.closed ? r.closedText : T.rsvpLead, formTitle: T.rsvpFormTitle, fields,
    submission: payload.rsvpEndpoint ? { mode: 'endpoint', endpoint: payload.rsvpEndpoint } : { mode: 'local', endpoint: '' },
    submitLabel: T.rsvpSubmit, privacyNote: 'Ответ увидят только пара и организаторы.',
    messages: { ...c.rsvp.messages, localSuccess: T.rsvpThanksYes, success: T.rsvpThanksYes },
  });
  c.footer = { ...c.footer, eyebrow: T.footerEyebrow, note: [T.footerNote, m.brand?.text].filter(Boolean).join(' · ') };
  c.music = m.music
    ? { ...c.music, enabled: true, src: m.music.src }
    : { ...c.music, enabled: false, src: '' };
  return c;
}

function afterMount(m) {
  const form = document.querySelector('#rsvp-form');
  if (m.rsvp.closed && form) form.hidden = true;
  if (m.guest && form) {
    const n = form.querySelector('[name=name]'); if (n && !n.value) n.value = m.guest.name.replace(/[!.]$/, '');
    const g = form.querySelector('[name=guests]'); if (g) g.value = String(Math.min(m.guest.seats || 1, m.rsvp.maxGuests));
  }
}

document.addEventListener('invitation:rsvp', e => {
  if (e.detail?.mode !== 'local' || !lastPayload) return;
  const a = e.detail.payload.answers || {};
  const answers = {};
  for (const [k, v] of Object.entries(a)) if (k.startsWith('q_') && v) {
    const q = lastPayload.model.rsvp.questions.find(x => 'q_' + x.id === k); answers[q ? q.label : k] = v;
  }
  window.VZ.sendRsvp({ name: a.name || '', attending: a.attending === 'yes', guests: a.attending === 'yes' ? +(a.guests || 1) : 0, food: a.food || '', wish: a.note || '', answers })
    .catch(() => { const s = document.querySelector('#form-status'); if (s) s.textContent = 'Не получилось отправить. Попробуйте ещё раз.'; });
});

window.VZ.registerAdapter({
  async apply(m, payload) {
    lastPayload = payload;
    const cfg = build(m, payload);
    const errs = window.WeddingInvitation ? window.WeddingInvitation.validate(cfg) : [];
    if (errs.length) { console.warn('[WEDNELLO] Ivory: конфиг не прошёл проверку', errs); return; }
    if (!mounted) {
      mounted = true;
      window.WEDDING_CONFIG = cfg;
      await import('./app.mjs');
    } else {
      const y = scrollY;
      window.WeddingInvitation.mount(cfg, root());
      scrollTo(0, y);
    }
    afterMount(m);
  },
  standalone() { if (!mounted) { mounted = true; import('./app.mjs'); } },
  focus(section) {
    const el = document.querySelector(SECTION_EL[section] || '#invitation');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },
  current() {
    const y = innerHeight * 0.45;
    for (const [k, sel] of Object.entries({ venues: '#place', program: '#program', dress: '#details', story: '#story', rsvp: '#rsvp', footer: 'footer' })) {
      const el = document.querySelector(sel); if (!el) continue;
      const rc = el.getBoundingClientRect(); if (rc.top <= y && rc.bottom >= y) return k;
    }
    return 'main';
  },
});
