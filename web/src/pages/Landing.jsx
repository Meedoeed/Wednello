import React, { useEffect, useMemo, useState } from 'react';
import { TEMPLATES } from '../../../shared/templates.js';
import { Icon, Modal, Segmented } from '../ui.jsx';
import { TemplateFrame, DeviceStage } from '../Preview.jsx';
import { SiteHeader, Logo, useApp } from '../App.jsx';
import { sampleProject } from './Templates.jsx';
import { PricingCards } from './Pricing.jsx';
import { appConfig } from '../api.js';

const FEATURES = [
  { img: 'img/f-guests.webp', title: 'Личное приглашение каждому', text: 'У каждого гостя своя ссылка. Открывая её, он видит обращение по имени, а в анкете уже стоят его имя и число мест.' },
  { img: 'img/f-rsvp.webp', title: 'Ответы собираются сами', text: 'Кто придёт, сколько человек, что с питанием и аллергиями. Видно даже, кто открыл приглашение и пока молчит.' },
  { img: 'img/f-plan.webp', title: 'План дня без лишних звонков', text: 'Сбор гостей, церемония, ужин, первый танец. Перетащите пункты в нужном порядке, гости увидят расписание с обратным отсчётом.' },
  { img: 'img/f-dress.webp', title: 'Палитра праздника', text: 'Покажите гостям цвета, в которых им будет красиво на фото. Готовые палитры или свои оттенки.' },
];
const FAQ = [
  ['Гостям нужно что-то устанавливать?', 'Нет. Приглашение открывается по ссылке в любом браузере на телефоне или компьютере. Отправить ссылку можно в Telegram, WhatsApp или напечатать QR-код на карточке.'],
  ['Можно ли поменять шаблон, когда всё уже заполнено?', 'Да. Имена, дата, места, план дня, фото, палитра и анкета переходят в новый шаблон. Тексты у каждого шаблона свои, и ваши правки в них сохраняются.'],
  ['Мы хотим редактировать вдвоём', 'Отправьте партнёру ссылку для совместного редактирования. Регистрироваться ему не нужно: он увидит то же приглашение, список гостей и ответы.'],
  ['Что если планы изменятся после рассылки?', 'Поправьте приглашение и нажмите «Опубликовать изменения». Ссылки у гостей останутся прежними, а содержимое обновится.'],
  ['Как гости отвечают?', 'Внизу приглашения есть короткая анкета: придут ли, сколько человек, пожелания по еде и ваши собственные вопросы, например про трансфер. Все ответы приходят в ваш кабинет.'],
  ['Сколько это стоит?', 'Создать приглашение, добавить до 40 гостей и собрать ответы можно бесплатно. Премиум оплачивается один раз, без подписки: все анимированные шаблоны, музыка, гости без ограничений, выгрузка в Excel и без нашей отметки.'],
  ['Можно ли вернуть деньги?', 'Да. Если в течение 14 дней после оплаты вы не опубликовали приглашение на премиум-шаблоне, вернём всю сумму — просто напишите нам.'],
  ['Можно ли добавить музыку?', 'Да. Загрузите трек, и в углу приглашения появится кнопка с нотой. Включается она по нажатию гостя: браузеры не дают сайтам запускать звук сами.'],
];

export function Landing() {
  const { nav, me, demo, mode } = useApp();
  const [view, setView] = useState(null);
  const [device, setDevice] = useState('phone');
  const [faq, setFaq] = useState(0);
  const sample = useMemo(() => view && sampleProject(view), [view]);
  useEffect(() => { document.title = 'WEDNELLO — онлайн-приглашения на свадьбу'; }, []);
  const start = () => nav('new');

  return (
    <div className="landing">
      <SiteHeader />

      <section className="hero">
        <picture className="hero-bg">
          <source media="(max-width: 760px)" srcSet="img/hero-m.webp" />
          <img src="img/hero.webp" alt="Конверт из хлопковой бумаги, сургучная печать, перьевая ручка и телефон с открытым приглашением" />
        </picture>
        <div className="hero-copy">
          <p className="eyebrow">Онлайн-приглашения на свадьбу</p>
          <h1>Приглашение, которое <em>хочется открыть</em> как письмо</h1>
          <p className="hero-lead">Выберите живой шаблон, впишите вашу историю и отправьте каждому гостю личную ссылку. Ответы, меню и рассадка соберутся в одном месте.</p>
          <div className="hero-cta">
            <button type="button" className="btn btn-primary btn-lg" onClick={start}>Создать приглашение</button>
            <button type="button" className="btn btn-outline btn-lg" onClick={() => document.getElementById('templates').scrollIntoView({ behavior: 'smooth' })}>Смотреть шаблоны</button>
          </div>
          <p className="hero-note">Регистрация понадобится только чтобы сохранить приглашение</p>
        </div>
      </section>

      <section className="facts" aria-label="Коротко о сервисе">
        <div className="wrap facts-in">
          <div><b>{TEMPLATES.length}</b><span>шаблонов, три из них с оживающей заставкой</span></div>
          <div><b>1</b><span>личная ссылка и обращение для каждого гостя</span></div>
          <div><b>30</b><span>минут от первого шага до готового приглашения</span></div>
          <div><b>0</b><span>приложений, которые гостю нужно устанавливать</span></div>
        </div>
      </section>

      <section className="showcase" id="templates">
        <div className="wrap">
          <header className="sec-head center">
            <p className="eyebrow">Коллекция</p>
            <h2>Разные истории, <em>одна ваша</em></h2>
            <p className="sec-lead">Шаблоны оживают при прокрутке: загорается проектор, мерцают звёзды, рисуются ветви, раскрывается книга или конверт. Нажмите, чтобы пролистать вживую.</p>
          </header>
        </div>
        <div className="showcase-stage">
          <img className="showcase-bg" src="img/showcase.webp" alt="" />
          <div className="showcase-row">
            {TEMPLATES.map((t, i) => (
              <button key={t.id} type="button" className="phone-card" style={{ '--i': i }} onClick={() => setView(t.id)}>
                <span className="phone"><img src={t.cover} alt="" loading="lazy" /></span>
                <span className="phone-cap"><b>{t.name}{t.premium && <i className="pro-tag">Премиум</i>}</b><small>{t.tagline}</small></span>
                <span className="phone-open"><Icon name="eye" size={15} />Пролистать</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="how" id="how">
        <div className="wrap how-in">
          <figure className="how-photo"><img src="img/couple.webp" alt="Пара вместе выбирает приглашение в телефоне" loading="lazy" /></figure>
          <div className="how-copy">
            <p className="eyebrow">Как это работает</p>
            <h2>Один вечер <em>вдвоём</em></h2>
            <ol className="steps">
              <li><span className="step-n">I</span><div><h3>Выберите шаблон</h3><p>Кино, звёздное небо, сад, книга или письмо. Сменить можно в любой момент, ничего не потеряв.</p></div></li>
              <li><span className="step-n">II</span><div><h3>Расскажите о дне</h3><p>Имена, дата, место, план дня, фото и палитра. Справа сразу видно, как это увидит гость.</p></div></li>
              <li><span className="step-n">III</span><div><h3>Разошлите ссылки</h3><p>Вставьте список гостей одним текстом и отправляйте личные ссылки в мессенджеры. Ответы придут к вам.</p></div></li>
            </ol>
            <button type="button" className="btn btn-primary" onClick={start}>Начать</button>
          </div>
        </div>
      </section>

      <section className="features" id="features">
        <div className="wrap">
          <header className="sec-head">
            <p className="eyebrow">Возможности</p>
            <h2>Всё, о чём <em>спросят гости</em></h2>
          </header>
          <div className="feature-grid">
            {FEATURES.map(f => (
              <article key={f.title} className="feature">
                <div className="feature-img"><img src={f.img} alt="" loading="lazy" /></div>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="guest-sec">
        <div className="wrap guest-in">
          <div className="guest-copy">
            <img className="sprig sprig-guest" src="img/sprig-olive.webp" alt="" />
            <p className="eyebrow">Глазами гостя</p>
            <h2>«Дорогие Ольга и Сергей!»</h2>
            <p>Гость открывает ссылку и видит своё имя. Узнаёт дату и место, строит маршрут, добавляет праздник в календарь и отвечает за минуту. Вам не придётся собирать ответы в переписках.</p>
            <ul className="ticks">
              <li><Icon name="check" size={16} />Обращение «Дорогой», «Дорогая» или «Дорогие» подбирается по имени</li>
              <li><Icon name="check" size={16} />Анкета заполнена заранее: имя и число мест</li>
              <li><Icon name="check" size={16} />Вы видите, кто открыл приглашение и кто ещё не ответил</li>
            </ul>
          </div>
          <figure className="guest-photo"><img src="img/guest.webp" alt="Гостья открывает персональное приглашение в телефоне" loading="lazy" /></figure>
        </div>
      </section>

      <section className="pricing-sec" id="pricing">
        <div className="wrap">
          <header className="sec-head center">
            <p className="eyebrow">Цены</p>
            <h2>Платите один раз — <em>когда будете готовы</em></h2>
            <p className="sec-lead">Без подписки. Соберите приглашение бесплатно, посмотрите его глазами гостя, а Премиум подключите перед рассылкой.</p>
          </header>
          <PricingCards onChoose={() => start()} ctaFree="Начать бесплатно" ctaPaid="Создать приглашение" />
          <p className="center small muted mt">Оплата через ЮKassa · чек на e-mail · возврат в течение 14 дней</p>
        </div>
      </section>

      <section className="faq" id="faq">
        <div className="wrap faq-in">
          <header className="sec-head">
            <p className="eyebrow">Вопросы</p>
            <h2>Коротко <em>о главном</em></h2>
          </header>
          <div className="faq-list">
            {FAQ.map(([q, a], i) => (
              <div key={q} className={'faq-item' + (faq === i ? ' open' : '')}>
                <button type="button" onClick={() => setFaq(faq === i ? -1 : i)} aria-expanded={faq === i}>
                  <span>{q}</span><Icon name="plus" size={18} />
                </button>
                <div className="faq-a"><p>{a}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="cta">
        <img className="cta-bg" src="img/cta.webp" alt="" loading="lazy" />
        <div className="wrap cta-in">
          <h2>Пусть ваш день начнётся <em>с красивого приглашения</em></h2>
          <div className="hero-cta">
            <button type="button" className="btn btn-light btn-lg" onClick={start}>Создать приглашение</button>
            {mode === 'demo' && !me && <button type="button" className="btn btn-ghost-light btn-lg" onClick={demo}>Открыть демо-кабинет</button>}
          </div>
        </div>
      </section>

      <footer className="site-foot">
        <div className="wrap site-foot-in">
          <Logo />
          <p>Онлайн-приглашения на свадьбу с анкетой для гостей</p>
          <span className="grow" />
          <nav className="foot-links" aria-label="Документы">
            <a href="/legal/terms">Оферта</a>
            <a href="/legal/privacy">Конфиденциальность</a>
            <a href="/legal/contacts">Контакты</a>
            {appConfig().support?.telegram && <a href={`https://t.me/${appConfig().support.telegram.replace(/^@/, '')}`} target="_blank" rel="noopener">Telegram</a>}
          </nav>
          <button type="button" className="link-btn" onClick={() => nav(me ? 'dashboard' : 'login')}>{me ? 'Мои приглашения' : 'Войти'}</button>
        </div>
      </footer>

      <Modal open={!!view} onClose={() => setView(null)} size="xl" className="modal-stage"
        title={view && TEMPLATES.find(t => t.id === view).name} subtitle="Пример с демо-данными. Прокрутите приглашение, чтобы увидеть анимацию."
        footer={view && <>
          <Segmented value={device} onChange={setDevice} options={[{ value: 'phone', icon: 'phone', label: 'Телефон' }, { value: 'desktop', icon: 'monitor', label: 'Компьютер' }]} />
          <span className="grow" />
          <button type="button" className="btn btn-primary" onClick={() => { const t = view; setView(null); try { sessionStorage.setItem('wn.tpl', t); } catch {} nav('new'); }}>Выбрать этот шаблон</button>
        </>}>
        {sample && <div className="stage-modal"><DeviceStage device={device}><TemplateFrame project={sample} mode="public" fill /></DeviceStage></div>}
      </Modal>
    </div>
  );
}

/** Короткое уведомление о cookie — показывается, только если включена Метрика */
export function CookieNote() {
  const [hidden, setHidden] = useState(() => { try { return !appConfig().metrika || localStorage.getItem('wn.cookie') === '1'; } catch { return true; } });
  if (hidden) return null;
  return (
    <div className="cookie-note" role="status">
      <span>Мы используем cookie и Яндекс Метрику, чтобы сервис работал лучше. <a href="/legal/privacy" target="_blank" rel="noopener">Подробнее</a></span>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => { try { localStorage.setItem('wn.cookie', '1'); } catch {} setHidden(true); }}>Хорошо</button>
    </div>
  );
}
