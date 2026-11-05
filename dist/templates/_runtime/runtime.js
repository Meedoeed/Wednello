/* WEDNELLO · рантайм шаблонов.
 * Получает готовую модель приглашения (window.VZ_BOOT при публикации или postMessage из конструктора)
 * и раскладывает её по разметке шаблона: тексты [data-t], вычисляемые поля [data-v], списки [data-list],
 * фото [data-slot], разделы [data-sec], анкету #rsvpForm, музыку и персональное обращение.
 * Шаблон с собственным рендером (Ivory) регистрирует адаптер через VZ.registerAdapter().
 */
(function () {
  'use strict';
  const html = document.documentElement;
  const TPL = html.dataset.tpl || '';
  const params = new URLSearchParams(location.search);
  const embedded = window.parent && window.parent !== window;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const state = { model: null, mode: 'standalone', rsvpEndpoint: '', adapter: null, pending: null, reqs: new Map() };
  window.VZ = {
    state,
    registerAdapter(a) { state.adapter = a; if (state.pending) { const p = state.pending; state.pending = null; apply(p); } else if (state.standaloneReady) a.standalone?.(); },
    sendRsvp,
    get mode() { return state.mode; },
  };

  if (params.has('vzwait')) {
    html.classList.add('vz-wait');
    setTimeout(() => html.classList.remove('vz-wait'), 3000);
  }

  /* ───────── утилиты ───────── */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function setText(el, value) {
    const lines = String(value ?? '').split('\n');
    el.replaceChildren();
    lines.forEach((line, i) => { if (i) el.append(document.createElement('br')); el.append(line); });
  }
  const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? b : c; };
  function daysLeft(iso) {
    const ms = Date.parse(iso) - Date.now();
    if (isNaN(ms)) return '—';
    if (ms <= 0) return 'совсем ничего';
    const d = Math.ceil(ms / 864e5);
    return `${d} ${plural(d, 'день', 'дня', 'дней')}`;
  }
  const safeSrc = s => (typeof s === 'string' && (/^(https?:|blob:|\/|\.\.?\/|data:(image|audio)\/)/i.test(s) || /^[\w-]+\//.test(s)) ? s : '');

  /* ───────── применение модели ───────── */
  function apply(payload) {
    const m = payload.model;
    state.model = m;
    state.mode = payload.mode || state.mode;
    state.rsvpEndpoint = payload.rsvpEndpoint || '';
    html.classList.toggle('vz-preview', state.mode === 'preview');
    if (state.adapter) {
      state.adapter.apply(m, payload);
    } else if (html.dataset.vzAdapter) {
      state.pending = payload; return;
    } else {
      bindDom(m);
      setupRsvp(m);
    }
    setupMusic(m);
    html.classList.remove('vz-wait');
    setupEditChip();
    document.dispatchEvent(new CustomEvent('vz:applied', { detail: m }));
  }

  function bindDom(m) {
    document.title = m.title || document.title;
    const T = m.texts || {};
    $$('[data-t]').forEach(el => { const k = el.dataset.t; if (k in T) setText(el, T[k]); });

    const n = m.names || {};
    $$('[data-v]').forEach(el => {
      switch (el.dataset.v) {
        case 'names': el.innerHTML = n.b ? `${esc(n.a)} <em>${esc(n.sep || '&')}</em> ${esc(n.b)}` : esc(n.a); break;
        case 'namesAmp': el.textContent = n.b ? `${n.a} ${n.sep || '&'} ${n.b}` : n.a; break;
        case 'daysLeft': el.textContent = daysLeft(m.startISO); break;
        case 'guest': el.hidden = !m.guest; el.textContent = m.guest ? m.guest.greeting : ''; break;
        case 'brand': {
          const b = m.brand; el.hidden = !b;
          el.innerHTML = b ? (b.url ? `<a href="${esc(b.url)}" target="_blank" rel="noopener">${esc(b.text)}</a>` : esc(b.text)) : '';
          break;
        }
      }
    });

    /* списки */
    $$('[data-list]').forEach(box => {
      const kind = box.dataset.list;
      const tpl = $(`template[data-item="${kind}"]`, box);
      if (!tpl) return;
      const items = kind === 'program' ? m.program : kind === 'colors' ? m.colors : [];
      [...box.children].forEach(ch => { if (ch !== tpl) ch.remove(); });
      for (const it of items || []) {
        const node = tpl.content.firstElementChild.cloneNode(true);
        if (kind === 'program') {
          fill(node, 'time', it.time); fill(node, 'title', it.title); fill(node, 'text', it.text, true);
        } else {
          node.style.setProperty('--c', it.color);
          fill(node, 'name', it.name); fill(node, 'hex', it.color.toUpperCase());
        }
        box.append(node);
      }
    });

    /* фото */
    const photos = m.photos || [];
    $$('img[data-slot]').forEach(img => {
      if (!('orig' in img.dataset)) img.dataset.orig = img.getAttribute('src') || '';
      const i = +img.dataset.slot;
      let p = photos[i];
      if (!(p && p.src) && img.dataset.slotFallback !== undefined) p = photos[+img.dataset.slotFallback];
      const ph = img.parentElement && $(':scope > .ph', img.parentElement);
      const src = p && safeSrc(p.src);
      if (src) {
        if (img.getAttribute('src') !== src) img.src = src;
        img.style.objectPosition = `${p.x ?? 50}% ${p.y ?? 50}%`;
        img.hidden = false;
        if (ph) ph.style.display = 'none';
      } else if ('slotKeep' in img.dataset) {
        if (img.getAttribute('src') !== img.dataset.orig) img.src = img.dataset.orig;
        img.style.objectPosition = ''; img.hidden = false;
      } else {
        img.hidden = true; img.removeAttribute('src');
        if (ph) ph.style.display = '';
      }
    });
    $$('[data-cap]').forEach(el => {
      const p = photos[+el.dataset.cap];
      if (p && p.caption) setText(el, p.caption);
    });

    /* разделы */
    const S = m.sections || {};
    $$('[data-sec]').forEach(el => { const k = el.dataset.sec; el.hidden = S[k] === false; });
    if (m.rsvp && !m.rsvp.enabled) $$('[data-sec="rsvp"]').forEach(el => (el.hidden = true));
  }
  function fill(node, f, value, hideEmpty) {
    const el = $(`[data-f="${f}"]`, node); if (!el) return;
    setText(el, value || '');
    if (hideEmpty) el.hidden = !value;
  }

  /* ───────── анкета ───────── */
  let rsvpBound = false;
  function setupRsvp(m) {
    const form = $('#rsvpForm'); if (!form) return;
    const r = m.rsvp || {};
    const status = $('#formStatus'), yes = $('#yesFields');
    const show = (k, v) => $$(`[data-rsvp="${k}"]`, form).forEach(el => (el.hidden = !v));
    show('guests', r.askGuests); show('food', r.askFood); show('wish', r.askWish);

    const sel = form.querySelector('select[name=guests]');
    if (sel) {
      const cur = sel.value;
      sel.replaceChildren(...Array.from({ length: r.maxGuests || 4 }, (_, i) => new Option(String(i + 1), String(i + 1))));
      const want = m.guest ? String(Math.min(m.guest.seats || 1, r.maxGuests || 4)) : cur;
      if ([...sel.options].some(o => o.value === want)) sel.value = want;
    }

    const extra = $('[data-rsvp="extra"]', form);
    if (extra) {
      extra.replaceChildren();
      for (const q of r.questions || []) {
        const name = 'q_' + q.id;
        if (q.type === 'choice' && q.options.length) {
          const fs = document.createElement('fieldset'); fs.className = 'choice vz-q'; fs.dataset.q = q.id;
          fs.innerHTML = `<legend>${esc(q.label)}</legend>` + q.options.map((o, i) =>
            `<label><input type="radio" name="${esc(name)}" value="${esc(o)}"${i === 0 && q.required ? ' checked' : ''}><span>${esc(o)}</span></label>`).join('');
          extra.append(fs);
        } else {
          const lb = document.createElement('label'); lb.className = 'field vz-q'; lb.dataset.q = q.id;
          lb.innerHTML = `<span>${esc(q.label)}</span><input name="${esc(name)}" type="text">`;
          extra.append(lb);
        }
      }
      extra.hidden = !(r.questions || []).length;
    }

    // приём ответов закрыт
    let closedNote = $('.vz-closed', form.parentElement);
    if (r.closed) {
      form.hidden = true;
      if (!closedNote) { closedNote = document.createElement('p'); closedNote.className = 'lead vz-closed'; form.after(closedNote); }
      closedNote.textContent = r.closedText;
    } else {
      form.hidden = false; closedNote?.remove();
    }

    if (m.guest && form.name && !form.name.value) form.name.value = m.guest.name.replace(/[!.]$/, '');

    if (rsvpBound) return;
    rsvpBound = true;
    $$('input[name=attend]', form).forEach(x => x.addEventListener('change', () => yes?.classList.toggle('off', form.attend.value === 'no')));
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const M = state.model || {}, TT = M.texts || {};
      status.className = 'form-status';
      const name = form.name.value.trim();
      form.name.closest('.field')?.classList.toggle('err', !name);
      if (!name) { status.textContent = 'Подскажите, пожалуйста, как вас зовут.'; status.classList.add('bad'); form.name.focus(); return; }
      const attend = form.attend.value === 'yes';
      const answers = {};
      for (const q of (M.rsvp && M.rsvp.questions) || []) {
        const el = form.elements['q_' + q.id];
        const v = el ? (el.value ?? '').trim() : '';
        if (attend && q.required && !v) { status.textContent = `Ответьте, пожалуйста: «${q.label}»`; status.classList.add('bad'); return; }
        if (v) answers[q.label] = v;
      }
      const payload = {
        name, attending: attend,
        guests: attend && M.rsvp?.askGuests ? +(form.guests?.value || 1) : attend ? 1 : 0,
        food: attend && M.rsvp?.askFood ? (form.food?.value || '').trim() : '',
        wish: M.rsvp?.askWish ? (form.wish?.value || '').trim() : '',
        answers: attend ? answers : {},
      };
      const btn = form.querySelector('.btn');
      btn.disabled = true; status.textContent = 'Отправляем…';
      try {
        const res = await sendRsvp(payload);
        status.textContent = attend ? (TT.rsvpThanksYes || 'Спасибо!') : (TT.rsvpThanksNo || 'Спасибо, что сообщили.');
        if (res && res.preview) status.textContent += ' (Это предпросмотр: ответ никуда не отправлен.)';
        form.reset(); yes?.classList.remove('off');
        setupRsvp(state.model);
      } catch (err) {
        status.textContent = 'Не получилось отправить. Попробуйте ещё раз чуть позже.'; status.classList.add('bad');
      } finally { btn.disabled = false; }
    });
  }

  /** Отправка ответа: на сервер (публикация) или родительскому окну (конструктор / демо) */
  function sendRsvp(payload) {
    if (state.rsvpEndpoint) {
      return fetch(state.rsvpEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), credentials: 'omit' })
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json().catch(() => ({})); });
    }
    if (embedded) {
      return new Promise((resolve, reject) => {
        const id = Math.random().toString(36).slice(2);
        const timer = setTimeout(() => { state.reqs.delete(id); reject(new Error('timeout')); }, 8000);
        state.reqs.set(id, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
        window.parent.postMessage({ type: 'vz:rsvp', id, payload }, '*');
      });
    }
    console.info('[WEDNELLO] ответ гостя (адрес приёма не настроен):', payload);
    return Promise.resolve({});
  }

  /* ───────── музыка ───────── */
  let audio = null, musicBtn = null;
  function setupMusic(m) {
    if (TPL === 'ivory') return; // у Ivory свой граммофон
    const src = m.music && safeSrc(m.music.src);
    if (!src) { if (audio) audio.pause(); musicBtn?.remove(); musicBtn = null; return; }
    if (!musicBtn) {
      musicBtn = document.createElement('button');
      musicBtn.type = 'button'; musicBtn.className = 'vz-music';
      musicBtn.setAttribute('aria-label', 'Включить музыку');
      musicBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l11-2v13M9 9l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2.5"/><ellipse cx="17" cy="16" rx="3" ry="2.5"/></svg><i></i>';
      musicBtn.addEventListener('click', () => {
        if (!audio) return;
        if (audio.paused) audio.play().then(() => musicBtn.classList.add('on')).catch(() => musicBtn.classList.add('err'));
        else { audio.pause(); musicBtn.classList.remove('on'); }
        musicBtn.setAttribute('aria-label', audio.paused ? 'Включить музыку' : 'Выключить музыку');
      });
      document.body.append(musicBtn);
    }
    if (!audio || audio.dataset.src !== src) {
      const was = audio && !audio.paused; audio?.pause();
      audio = new Audio(); audio.preload = 'none'; audio.loop = true; audio.volume = 0.4; audio.src = src; audio.dataset.src = src;
      musicBtn.classList.remove('on', 'err');
      if (was) audio.play().then(() => musicBtn.classList.add('on')).catch(() => {});
    }
  }

  /* ───────── фокус и «редактировать» в предпросмотре ───────── */
  const LABELS = { main: 'Заставка и приглашение', venues: 'Место', program: 'План дня', dress: 'Дресс-код', photos: 'Фото', rsvp: 'Анкета', words: 'Тексты', footer: 'Финал', story: 'История' };
  function focusSection(section, focusMap) {
    if (state.adapter?.focus) return state.adapter.focus(section);
    const smooth = { behavior: 'smooth' };
    const f = (focusMap || {})[section];
    const cin = $('#cinema');
    if (typeof f === 'number' && cin) {
      scrollTo({ top: cin.offsetTop + f * (cin.offsetHeight - innerHeight), ...smooth });
      return;
    }
    const el = $(`[data-sec="${section}"]`);
    if (el && !el.hidden) el.scrollIntoView({ ...smooth, block: 'start' });
    else if (section === 'main' || section === 'venues') scrollTo({ top: 0, ...smooth });
  }
  function currentSection() {
    if (state.adapter?.current) return state.adapter.current();
    const y = innerHeight * 0.45;
    for (const el of $$('[data-sec]')) {
      if (el.hidden) continue;
      const r = el.getBoundingClientRect();
      if (r.top <= y && r.bottom >= y) return el.dataset.sec;
    }
    return 'main';
  }
  let chip = null;
  function setupEditChip() {
    if (state.mode !== 'preview') { chip?.remove(); chip = null; return; }
    if (chip) return;
    chip = document.createElement('button');
    chip.type = 'button'; chip.className = 'vz-edit-chip';
    const upd = () => { const s = currentSection(); chip.dataset.s = s; chip.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m14 6 4 4"/></svg><span>${esc(LABELS[s] || 'Изменить')}</span>`; };
    chip.addEventListener('click', () => window.parent.postMessage({ type: 'vz:select', section: chip.dataset.s }, '*'));
    document.body.append(chip);
    let raf = 0;
    addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; upd(); }); }, { passive: true });
    upd();
  }

  /* ───────── связь с конструктором ───────── */
  addEventListener('message', e => {
    if (e.source !== window.parent) return;
    const d = e.data || {};
    if (d.type === 'vz:data') apply(d);
    else if (d.type === 'vz:focus') focusSection(d.section, d.focus || state.model?.focus);
    else if (d.type === 'vz:rsvp:result') {
      const r = state.reqs.get(d.id); if (!r) return;
      state.reqs.delete(d.id); d.ok ? r.resolve(d.result || {}) : r.reject(new Error(d.error || 'error'));
    }
  });

  if (window.VZ_BOOT) {
    const boot = window.VZ_BOOT;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => apply(boot), { once: true });
    else apply(boot);
  } else if (embedded) {
    window.parent.postMessage({ type: 'vz:ready', template: TPL }, '*');
    setTimeout(() => { if (!state.model) { state.standaloneReady = true; state.adapter?.standalone?.(); } }, 2500);
  } else {
    state.standaloneReady = true;
    setTimeout(() => state.adapter?.standalone?.(), 0);
  }
})();
