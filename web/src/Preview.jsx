import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { resolveModel } from '../../shared/model.js';
import { getTemplate } from '../../shared/templates.js';
import { tplAsset } from './api.js';

const DEVICES = { phone: { w: 390, h: 844 }, desktop: { w: 1366, h: 860 } };

/**
 * Живой предпросмотр шаблона: iframe + обмен сообщениями с рантаймом.
 * mode: 'preview' (конструктор), 'public' (гостевая страница в демо-режиме), 'gallery' (витрина шаблонов)
 */
export function TemplateFrame({ project, mode = 'preview', brand, guest, onSelect, onRsvp, focus, className = '', title, fill }) {
  const ref = useRef(null);
  const ready = useRef(false);
  const t = getTemplate(project.templateId);
  const model = useMemo(() => resolveModel(project, { asset: tplAsset, brand, guest }), [project.templateId, project.data, brand, guest]);
  const payload = { type: 'vz:data', model, mode: mode === 'gallery' ? 'standalone' : mode, id: project.id || 'preview' };
  const latest = useRef(payload); latest.current = payload;
  const handlers = useRef({}); handlers.current = { onSelect, onRsvp };

  useEffect(() => {
    const onMsg = e => {
      if (!ref.current || e.source !== ref.current.contentWindow) return;
      const d = e.data || {};
      if (d.type === 'vz:ready') { ready.current = true; ref.current.contentWindow.postMessage(latest.current, '*'); }
      else if (d.type === 'vz:select') handlers.current.onSelect?.(d.section);
      else if (d.type === 'vz:rsvp') {
        Promise.resolve(handlers.current.onRsvp ? handlers.current.onRsvp(d.payload) : { preview: true })
          .then(result => ref.current?.contentWindow.postMessage({ type: 'vz:rsvp:result', id: d.id, ok: true, result }, '*'))
          .catch(err => ref.current?.contentWindow.postMessage({ type: 'vz:rsvp:result', id: d.id, ok: false, error: String(err?.message || err) }, '*'));
      }
    };
    addEventListener('message', onMsg);
    return () => removeEventListener('message', onMsg);
  }, []);

  useEffect(() => { ready.current = false; }, [t.folder]);

  // обновления — с небольшой задержкой, чтобы не перерисовывать шаблон на каждый символ
  useEffect(() => {
    if (!ready.current) return;
    const id = setTimeout(() => ref.current?.contentWindow.postMessage(latest.current, '*'), t.id === 'ivory' ? 260 : 90);
    return () => clearTimeout(id);
  }, [model]);

  useEffect(() => {
    if (focus?.section && ready.current) ref.current?.contentWindow.postMessage({ type: 'vz:focus', section: focus.section, focus: t.focus }, '*');
  }, [focus?.n]);

  return (
    <iframe ref={ref} className={'tpl-frame ' + className} title={title || `Приглашение «${t.name}»`}
      src={`templates/${t.folder}/index.html?vzwait=1`} key={t.folder}
      allow="autoplay" style={fill ? { width: '100%', height: '100%' } : undefined} />
  );
}

/** Рамка устройства с масштабированием под доступное место */
export function DeviceStage({ device = 'phone', children, toolbar }) {
  const box = useRef(null);
  const [scale, setScale] = useState(0.6);
  const d = DEVICES[device];
  useLayoutEffect(() => {
    const el = box.current; if (!el) return;
    const fit = () => {
      const pad = device === 'phone' ? 40 : 32;
      const s = Math.min((el.clientWidth - pad) / (d.w + (device === 'phone' ? 24 : 0)), (el.clientHeight - pad) / (d.h + (device === 'phone' ? 24 : 40)), 1);
      setScale(Math.max(0.2, s));
    };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(el);
    return () => ro.disconnect();
  }, [device]);
  return (
    <div className="stage-box" ref={box}>
      {toolbar}
      <div className={'device device-' + device} style={{ width: d.w, height: d.h, transform: `translate(-50%, -50%) scale(${scale})` }}>
        {device === 'desktop' && <div className="device-bar"><i /><i /><i /><span>приглашение</span></div>}
        <div className="device-screen">{children}</div>
      </div>
    </div>
  );
}
