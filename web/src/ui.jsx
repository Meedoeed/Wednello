import React, { useEffect, useRef, useState, useCallback, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';

/* ───────── иконки (24×24, обводка) ───────── */
const P = {
  home: 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  users: 'M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M21 20v-1.5a4 4 0 0 0-3-3.85M15.5 4.15a3.5 3.5 0 0 1 0 6.7',
  inbox: 'M3 13h5l1.5 3h5L16 13h5M5.5 5h13L21 13v6H3v-6z',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  card: 'M3 6h18v12H3zM3 10h18M7 15h3',
  plus: 'M12 5v14M5 12h14',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  link: 'M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1',
  check: 'M4 12.5 9 17.5 20 6.5',
  x: 'M6 6l12 12M18 6 6 18',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  phone: 'M8 2.5h8a1.5 1.5 0 0 1 1.5 1.5v16a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 20V4A1.5 1.5 0 0 1 8 2.5zM11 18.5h2',
  monitor: 'M3 4h18v12H3zM8 20h8M12 16v4',
  undo: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  redo: 'M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
  upload: 'M12 16V4M7 9l5-5 5 5M4 16v4h16v-4',
  image: 'M3 4h18v16H3zM3 16l5-5 4 4 3-3 6 6M15.5 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  music: 'M9 18V5l11-2v13M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM17 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  palette: 'M12 21a9 9 0 1 1 9-9c0 2.5-2 3.5-3.5 3.5H15a2 2 0 0 0-1.5 3.3A1.4 1.4 0 0 1 12 21zM7.5 11.5h.01M10 7.5h.01M14.5 7.5h.01M17 11h.01',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  pin: 'M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12zM12 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  type: 'M5 6V4h14v2M12 4v16M9 20h6',
  heart: 'M12 20s-8-4.6-8-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15.4 12 20 12 20z',
  left: 'M15 6l-6 6 6 6', right: 'M9 6l6 6-6 6', down: 'M6 9l6 6 6-6', up: 'M18 15l-6-6-6 6',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  send: 'M21 3 10 14M21 3l-7 18-4-7-7-4z',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2',
  download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
  lock: 'M6 11h12v10H6zM8.5 11V7.5a3.5 3.5 0 0 1 7 0V11',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  calendar: 'M4 6h16v15H4zM4 10h16M8 3v4M16 3v4',
  archive: 'M3 4h18v4H3zM5 8v12h14V8M10 12h4',
  star: 'm12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  layers: 'M12 3 3 8l9 5 9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5',
  sparkle: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6',
  sort: 'M7 4v16M4 17l3 3 3-3M17 20V4M14 7l3-3 3 3',
  dup: 'M8 8h12v12H8zM4 16V4h12',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01',
  refresh: 'M20 11a8 8 0 0 0-14.9-3M4 5v4h4M4 13a8 8 0 0 0 14.9 3M20 19v-4h-4',
  menu: 'M4 7h16M4 12h16M4 17h16',
  chat: 'M4 5h16v11H9l-5 4z',
  wand: 'M15 4V2M15 10V8M12 5h-2M20 5h-2M18 8l1.5 1.5M18 2l1.5-1.5M3 21l12-12',
  filter: 'M4 5h16l-6 8v6l-4-1v-5z',
  dinner: 'M5 3v7m3-7v7M5 7h3m-1.5 3v11M18 3v18m0-18c-5 3-5 9 0 9',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.7 3.5 5.7 3.5 9s-1 6.3-3.5 9c-2.5-2.7-3.5-5.7-3.5-9s1-6.3 3.5-9z',
};
export function Icon({ name, size = 18, className = '', title }) {
  return (
    <svg className={'ico ' + className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <path d={P[name] || P.info} />
    </svg>
  );
}
export function SvgHtml({ html, size = 20, className = '' }) {
  return <svg className={'ico ' + className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />;
}

/* ───────── кнопки и поля ───────── */
export function Button({ variant = 'default', size, icon, iconRight, children, className = '', loading, ...rest }) {
  return (
    <button type="button" className={`btn btn-${variant} ${size ? 'btn-' + size : ''} ${!children ? 'btn-icon' : ''} ${className}`} disabled={loading || rest.disabled} {...rest}>
      {loading ? <span className="spin" /> : icon && <Icon name={icon} size={size === 'sm' ? 15 : 17} />}
      {children && <span>{children}</span>}
      {iconRight && <Icon name={iconRight} size={15} />}
    </button>
  );
}
let fieldSeq = 0;
export function useId(prefix = 'f') { const r = useRef(null); if (!r.current) r.current = `${prefix}-${++fieldSeq}`; return r.current; }

export function Field({ label, hint, error, children, className = '', aside }) {
  const id = useId();
  const child = React.isValidElement(children) ? React.cloneElement(children, { id: children.props.id || id }) : children;
  return (
    <div className={'field ' + className}>
      {(label || aside) && <div className="field-top">{label && <label htmlFor={id}>{label}</label>}{aside}</div>}
      {child}
      {hint && !error && <div className="field-hint">{hint}</div>}
      {error && <div className="field-err">{error}</div>}
    </div>
  );
}
export const Input = React.forwardRef(function Input(props, ref) { return <input ref={ref} className="input" {...props} />; });
export const Textarea = React.forwardRef(function Textarea({ autoGrow = true, ...props }, ref) {
  const inner = useRef(null);
  const set = el => { inner.current = el; if (typeof ref === 'function') ref(el); else if (ref) ref.current = el; };
  useEffect(() => { const el = inner.current; if (el && autoGrow) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 2 + 'px'; } }, [props.value, autoGrow]);
  return <textarea ref={set} className="input textarea" rows={props.rows || 2} {...props} />;
});
export function Select({ options, ...props }) {
  return (
    <select className="input select" {...props}>
      {options.map(o => (typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>))}
    </select>
  );
}
export function Toggle({ checked, onChange, label, hint, disabled }) {
  const id = useId('t');
  return (
    <label className={'toggle' + (disabled ? ' is-disabled' : '')} htmlFor={id}>
      <input id={id} type="checkbox" checked={!!checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      <span className="toggle-track"><span className="toggle-dot" /></span>
      {(label || hint) && <span className="toggle-text"><span>{label}</span>{hint && <small>{hint}</small>}</span>}
    </label>
  );
}
export function Segmented({ value, onChange, options, size }) {
  return (
    <div className={'seg ' + (size ? 'seg-' + size : '')} role="tablist">
      {options.map(o => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)} title={o.title}>
          {o.icon && <Icon name={o.icon} size={16} />}{o.label && <span>{o.label}</span>}
        </button>
      ))}
    </div>
  );
}
export function Badge({ tone = 'neutral', children, dot }) {
  return <span className={'badge badge-' + tone}>{dot && <i />}{children}</span>;
}
export function Progress({ value, max = 100, tone }) {
  const pct = max ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return <div className={'progress ' + (tone ? 'progress-' + tone : '')}><i style={{ width: pct + '%' }} /></div>;
}
export function Empty({ icon = 'sparkle', image, title, children, action }) {
  return (
    <div className="empty">
      {image ? <img className="empty-img" src={image} alt="" /> : <div className="empty-ico"><Icon name={icon} size={22} /></div>}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
export function Monogram({ a, b, size = 44, color }) {
  const i1 = (a || '?').trim()[0] || '?', i2 = (b || '').trim()[0] || '';
  return (
    <span className="monogram" style={{ width: size, height: size, fontSize: size * 0.36, '--mono': color }} aria-hidden="true">
      <span>{i1}</span>{i2 && <em>&amp;</em>}{i2 && <span>{i2}</span>}
    </span>
  );
}

/* ───────── модальное окно ───────── */
export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md', className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement;
    const onKey = e => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    setTimeout(() => ref.current?.querySelector('input,textarea,select,button.btn-primary')?.focus(), 30);
    document.body.classList.add('modal-open');
    return () => { document.removeEventListener('keydown', onKey); document.body.classList.remove('modal-open'); prev?.focus?.(); };
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div className="modal-wrap" onMouseDown={e => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={`modal modal-${size} ${className}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        {(title || onClose) && (
          <div className="modal-head">
            <div>{title && <h2>{title}</h2>}{subtitle && <p>{subtitle}</p>}</div>
            {onClose && <Button variant="ghost" icon="x" onClick={onClose} aria-label="Закрыть" />}
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
export function Confirm({ open, title, text, confirmLabel = 'Удалить', tone = 'danger', onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Отмена</Button><Button variant={tone} loading={busy} onClick={async () => { setBusy(true); try { await onConfirm(); onClose(); } finally { setBusy(false); } }}>{confirmLabel}</Button></>}>
      <p className="muted">{text}</p>
    </Modal>
  );
}

/* ───────── всплывающее меню ───────── */
export function Menu({ trigger, items, align = 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const key = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', key); };
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      {React.cloneElement(trigger, { onClick: e => { e.stopPropagation(); setOpen(o => !o); }, 'aria-expanded': open })}
      {open && (
        <div className={'menu-list menu-' + align} role="menu">
          {items.filter(Boolean).map((it, i) => it === '-' ? <div key={i} className="menu-sep" /> : (
            <button key={i} type="button" role="menuitem" className={'menu-item' + (it.danger ? ' danger' : '')} disabled={it.disabled}
              onClick={e => { e.stopPropagation(); setOpen(false); it.onClick?.(); }}>
              {it.icon && <Icon name={it.icon} size={16} />}<span>{it.label}</span>{it.hint && <small>{it.hint}</small>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────── уведомления ───────── */
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [list, setList] = useState([]);
  const push = useCallback((text, tone = 'ok', ms = 3200) => {
    const id = Math.random();
    setList(l => [...l, { id, text, tone }]);
    setTimeout(() => setList(l => l.filter(t => t.id !== id)), ms);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {list.map(t => <div key={t.id} className={'toast toast-' + t.tone}><Icon name={t.tone === 'error' ? 'alert' : 'check'} size={16} /><span>{t.text}</span></div>)}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/* ───────── копирование ───────── */
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    try {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.append(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok;
    } catch { return false; }
  }
}
export function CopyField({ value, label = 'Скопировать' }) {
  const toast = useToast();
  const ref = useRef(null);
  return (
    <div className="copy-field">
      <input ref={ref} className="input mono" readOnly value={value} onFocus={e => e.target.select()} aria-label="Ссылка" />
      <Button icon="copy" onClick={async () => { if (await copyText(value)) toast('Ссылка скопирована'); else { ref.current.select(); toast('Выделили ссылку — нажмите Ctrl+C', 'warn'); } }}>{label}</Button>
    </div>
  );
}

/* ───────── сортировка перетаскиванием ───────── */
export function useSortable(items, onReorder) {
  const [drag, setDrag] = useState(null); // { id, over }
  const refs = useRef({});
  const start = (e, id) => {
    e.preventDefault();
    const pointerId = e.pointerId;
    const handle = e.currentTarget;
    handle.setPointerCapture?.(pointerId);
    setDrag({ id, over: id });
    const move = ev => {
      const y = ev.clientY;
      let over = id;
      for (const it of items) {
        const el = refs.current[it.id]; if (!el) continue;
        const r = el.getBoundingClientRect();
        if (y >= r.top && y <= r.bottom) { over = it.id; break; }
      }
      setDrag(d => (d && d.over !== over ? { ...d, over } : d));
    };
    const up = () => {
      handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up);
      setDrag(d => {
        if (d && d.over !== d.id) {
          const from = items.findIndex(i => i.id === d.id), to = items.findIndex(i => i.id === d.over);
          const next = items.slice(); const [m] = next.splice(from, 1); next.splice(to, 0, m);
          setTimeout(() => onReorder(next), 0);
        }
        return null;
      });
    };
    handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', up); handle.addEventListener('pointercancel', up);
  };
  const itemProps = id => ({
    ref: el => { refs.current[id] = el; },
    'data-dragging': drag?.id === id ? '' : undefined,
    'data-over': drag && drag.over === id && drag.id !== id ? (items.findIndex(i => i.id === drag.id) < items.findIndex(i => i.id === id) ? 'below' : 'above') : undefined,
  });
  const handleProps = id => ({ onPointerDown: e => start(e, id), className: 'drag-handle', 'aria-label': 'Перетащить', role: 'button', tabIndex: -1 });
  const move = (id, dir) => {
    const i = items.findIndex(x => x.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= items.length) return;
    const next = items.slice(); [next[i], next[j]] = [next[j], next[i]]; onReorder(next);
  };
  return { itemProps, handleProps, move, dragging: !!drag };
}

/* ───────── даты и числа ───────── */
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export function fmtDate(s, withYear = true) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); if (!m) return '—';
  return `${+m[3]} ${MONTHS[+m[2] - 1]}${withYear ? ' ' + m[1] : ''}`;
}
export function plural(n, a, b, c) { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? b : c; }
export function daysUntil(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date || ''); if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]); const now = new Date(); const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((t - today) / 864e5);
}
export function timeAgo(iso) {
  if (!iso) return '';
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return 'только что';
  if (s < 3600) { const n = Math.floor(s / 60); return `${n} ${plural(n, 'минуту', 'минуты', 'минут')} назад`; }
  if (s < 86400) { const n = Math.floor(s / 3600); return `${n} ${plural(n, 'час', 'часа', 'часов')} назад`; }
  const n = Math.floor(s / 86400);
  if (n < 30) return `${n} ${plural(n, 'день', 'дня', 'дней')} назад`;
  return fmtDate(iso.slice(0, 10));
}
export const rub = n => new Intl.NumberFormat('ru-RU').format(n) + ' ₽';
