import React, { useMemo, useState } from 'react';
import { TEMPLATES } from '../../../shared/templates.js';
import { defaultData } from '../../../shared/model.js';
import { Button, Icon, Modal, Segmented } from '../ui.jsx';
import { TemplateFrame, DeviceStage } from '../Preview.jsx';
import { useApp } from '../App.jsx';

export function sampleProject(templateId) {
  const d = defaultData(templateId);
  d.event.date = '2027-06-12';
  d.venues.ceremony = { ...d.venues.ceremony, name: 'Усадьба «Архангельское»', address: 'Красногорск, Ильинское ш., 1' };
  d.venues.party = { ...d.venues.party, name: 'Ресторан «Белый сад»', address: 'Москва, Садовая ул., 12' };
  d.photos = [{ id: 'a', src: '@demo/couple-1.jpg', x: 50, y: 40 }, { id: 'b', src: '@demo/couple-2.jpg', x: 50, y: 40 }];
  return { id: 'sample-' + templateId, templateId, data: d };
}

export function TemplatesPage() {
  const { nav } = useApp();
  const [view, setView] = useState(null);
  const [device, setDevice] = useState('phone');
  const sample = useMemo(() => view && sampleProject(view), [view]);
  const choose = id => { try { sessionStorage.setItem('wn.tpl', id); } catch {} setView(null); nav('new'); };
  return (
    <div className="page">
      <header className="page-head">
        <div><p className="eyebrow">Коллекция</p><h1>Шаблоны <em>приглашений</em></h1>
          <p className="lead">Каждый шаблон оживает при прокрутке. Тексты, фото, план дня, палитра и анкета настраиваются в конструкторе.</p></div>
      </header>
      <div className="tpl-gallery">
        {TEMPLATES.map(t => (
          <article key={t.id} className="tpl-card">
            <button type="button" className="tpl-card-cover" onClick={() => setView(t.id)} aria-label={`Пролистать «${t.name}»`}>
              <span className="phone"><img src={t.cover} alt="" loading="lazy" /></span>
            </button>
            <div className="tpl-card-body">
              <div className="chips">{t.premium ? <span className="chip chip-pro">Премиум</span> : <span className="chip chip-free">Бесплатно</span>}{t.mood.map(m => <span key={m} className="chip">{m}</span>)}</div>
              <h3>{t.name}</h3>
              <p className="tpl-tagline">{t.tagline}</p>
              <p className="muted">{t.description}</p>
              <p className="small muted">Фото: {t.photos.slots.length} · {t.photos.slots.slice(0, 2).join(', ').toLowerCase()}{t.photos.slots.length > 2 ? '…' : ''}</p>
              <div className="tpl-card-foot">
                <Button variant="outline" icon="eye" onClick={() => setView(t.id)}>Пролистать</Button>
                <Button variant="primary" onClick={() => choose(t.id)}>Выбрать</Button>
              </div>
            </div>
          </article>
        ))}
      </div>
      <Modal open={!!view} onClose={() => setView(null)} size="xl" className="modal-stage"
        title={view && TEMPLATES.find(t => t.id === view).name} subtitle="Пример с демо-данными. Прокрутите приглашение, чтобы увидеть анимацию."
        footer={view && <>
          <Segmented value={device} onChange={setDevice} options={[{ value: 'phone', icon: 'phone', label: 'Телефон' }, { value: 'desktop', icon: 'monitor', label: 'Компьютер' }]} />
          <span className="grow" />
          <Button variant="primary" onClick={() => choose(view)}>Выбрать этот шаблон</Button>
        </>}>
        {sample && <div className="stage-modal"><DeviceStage device={device}><TemplateFrame project={sample} mode="public" fill /></DeviceStage></div>}
      </Modal>
    </div>
  );
}
