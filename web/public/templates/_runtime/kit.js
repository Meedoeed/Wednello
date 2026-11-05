/* WEDNELLO · набор для «лёгких» шаблонов (Минимализм, Сад, Полночь).
 * Подключается после runtime.js. Дополняет его тем, что одинаково во всех трёх шаблонах:
 *   [data-venue="ceremony|party"] с полями [data-vf="name|address|time|note|map"] — места и ссылки на карту;
 *   [data-d="day|month|year|weekday|dots|short"] — части даты;
 *   [data-cd="d|h|m|s"] и [data-cdl="d|h|m|s"] — обратный отсчёт и подписи к нему;
 *   [data-ics] — кнопка «Добавить в календарь» (.ics);
 *   .rv — плавное появление при прокрутке (класс .in).
 * Шаблон слушает document 'vz:applied' или window.VZKit.onModel(fn), если нужна своя логика.
 */
(function () {
  'use strict';
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const WEEK = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
  const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? b : c; };
  const UNITS = { d: ['день', 'дня', 'дней'], h: ['час', 'часа', 'часов'], m: ['минута', 'минуты', 'минут'], s: ['секунда', 'секунды', 'секунд'] };
  const listeners = [];
  let model = null;

  /* появление при прокрутке */
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const io = 'IntersectionObserver' in window && !reduce
    ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12, rootMargin: '0px 0px -6% 0px' })
    : null;
  function observe() { $$('.rv:not(.in)').forEach(el => (io ? io.observe(el) : el.classList.add('in'))); }

  /* даты */
  function dates(m) {
    const p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(m?.date || '');
    if (!p) return;
    const y = +p[1], mo = +p[2], d = +p[3];
    const wd = WEEK[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()];
    const map = { day: String(d), dd: String(d).padStart(2, '0'), month: MONTHS[mo - 1], mm: String(mo).padStart(2, '0'), year: String(y), yy: String(y).slice(2), weekday: wd,
      dots: `${String(d).padStart(2, '0')}.${String(mo).padStart(2, '0')}.${y}`, short: `${d} ${MONTHS[mo - 1]}`, long: `${d} ${MONTHS[mo - 1]} ${y}`, time: m.time || '' };
    $$('[data-d]').forEach(el => { const v = map[el.dataset.d]; if (v !== undefined) el.textContent = v; });
  }

  /* места */
  function venues(m) {
    const V = m?.venues; if (!V) return;
    const same = !V.party?.name && !V.party?.address ? false : V.ceremony?.name === V.party?.name && V.ceremony?.address === V.party?.address;
    for (const key of ['ceremony', 'party']) {
      const v = V[key] || {};
      $$(`[data-venue="${key}"]`).forEach(box => {
        if (key === 'party' && same) { box.hidden = true; return; }
        box.hidden = false;
        const set = (f, val, fallback) => $$(`[data-vf="${f}"]`, box).forEach(el => { el.textContent = val || fallback || ''; if (el.dataset.hideEmpty !== undefined) el.hidden = !val; });
        set('name', v.name, key === 'ceremony' ? 'Место церемонии уточняется' : 'Место банкета уточняется');
        set('address', v.address, 'Адрес сообщим чуть позже');
        set('time', v.time, '');
        set('note', v.note, '');
        $$('[data-vf="map"]', box).forEach(a => { if (v.map) { a.href = v.map; a.hidden = false; } else { a.removeAttribute('href'); a.hidden = true; } });
      });
    }
    $$('[data-venues-one]').forEach(el => el.classList.toggle('one', same));
  }

  /* обратный отсчёт */
  function tick() {
    const iso = model?.startISO || document.documentElement.dataset.start;
    const els = $$('[data-cd]'); if (!els.length || !iso) return;
    let ms = Date.parse(iso) - Date.now(); if (isNaN(ms)) return;
    const done = ms <= 0; if (done) ms = 0;
    const v = { d: Math.floor(ms / 864e5), h: Math.floor(ms / 36e5) % 24, m: Math.floor(ms / 6e4) % 60, s: Math.floor(ms / 1e3) % 60 };
    els.forEach(el => { const k = el.dataset.cd; const s = k === 'd' ? String(v.d) : String(v[k]).padStart(2, '0'); if (el.textContent !== s) el.textContent = s; });
    $$('[data-cdl]').forEach(el => { const k = el.dataset.cdl; el.textContent = plural(v[k], ...UNITS[k]); });
    document.documentElement.classList.toggle('k-done', done);
  }

  /* календарь */
  function ics() {
    const m = model; if (!m) return;
    const esc = s => String(s || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
    const stamp = d => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const c = m.venues?.ceremony || {};
    const loc = [c.name, c.address].filter(Boolean).join(', ');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//WEDNELLO//Invitation//RU', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      `UID:${Date.now()}-${Math.random().toString(36).slice(2)}@wednello`, `DTSTAMP:${stamp(Date.now())}`,
      `DTSTART:${stamp(m.startISO)}`, `DTEND:${stamp(m.endISO || m.startISO)}`, `SUMMARY:${esc('Свадьба: ' + (m.namesPlain || ''))}`,
      loc ? `LOCATION:${esc(loc)}` : '', `DESCRIPTION:${esc(location.href.split('#')[0])}`,
      'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', 'DESCRIPTION:Завтра свадьба!', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean);
    const url = URL.createObjectURL(new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'wedding.ics'; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }
  document.addEventListener('click', e => { const b = e.target.closest('[data-ics]'); if (b) { e.preventDefault(); ics(); } });

  document.addEventListener('vz:applied', e => {
    model = e.detail;
    dates(model); venues(model); tick(); observe();
    document.documentElement.dataset.photos = String((model.photos || []).filter(p => p.src).length);
    listeners.forEach(fn => { try { fn(model); } catch (err) { console.error(err); } });
  });
  setInterval(tick, 1000);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { observe(); tick(); }, { once: true });
  else { observe(); tick(); }

  window.VZKit = { onModel(fn) { listeners.push(fn); if (model) fn(model); }, get model() { return model; }, observe, plural };
})();
