import React, { useEffect, useState } from 'react';
import { DEFAULT_PLANS } from '../../../shared/core.js';
import { TEMPLATES } from '../../../shared/templates.js';
import { get, post, appConfig } from '../api.js';
import { Button, Icon, Badge, useToast, rub, fmtDate, plural } from '../ui.jsx';
import { useApp } from '../App.jsx';

export const plansList = () => (appConfig().plans || DEFAULT_PLANS).filter(p => p.active !== false).slice().sort((a, b) => a.order - b.order);

const FREE_TPL = TEMPLATES.filter(t => !t.premium).map(t => t.name);
const PREMIUM_TPL = TEMPLATES.filter(t => t.premium).map(t => t.name);

/** Что входит в тариф — человеческим языком */
export function planPerks(p) {
  const f = p.features || {}, l = p.limits || {};
  return [
    { ok: true, text: f.allTemplates ? `Все ${TEMPLATES.length} шаблонов, включая анимированные «${PREMIUM_TPL.join('», «')}»` : `Шаблоны «${FREE_TPL.join('», «')}»` },
    { ok: true, text: `${l.guests >= 1000 ? 'Гостей без ограничений' : `До ${l.guests} ${plural(l.guests, 'гостя', 'гостей', 'гостей')}`} с личными ссылками` },
    { ok: true, text: 'Анкета гостя, план дня, дресс-код, календарь' },
    { ok: true, text: `${l.projects > 1 ? `До ${l.projects} приглашений` : '1 приглашение'}, редактирование вдвоём` },
    { ok: !!f.music, text: 'Музыка в приглашении' },
    { ok: !!f.export, text: 'Выгрузка гостей и ответов в Excel' },
    { ok: !!f.removeBadge, text: 'Без отметки «Создано в WEDNELLO»' },
    { ok: !!f.support, text: 'Личная помощь с текстами и настройкой' },
  ];
}

export function PricingCards({ current, onChoose, busy, ctaFree = 'Начать бесплатно', ctaPaid = 'Выбрать Премиум' }) {
  const plans = plansList();
  return (
    <div className={'pricing pricing-' + plans.length}>
      {plans.map(p => {
        const isCurrent = current === p.id;
        return (
          <article key={p.id} className={'price-card' + (p.highlight ? ' hl' : '')}>
            {p.highlight && <span className="price-flag"><Icon name="star" size={13} />Выбирают чаще</span>}
            <h3>{p.name}</h3>
            <p className="price-desc">{p.description}</p>
            <div className="price-num">
              <b>{p.price ? rub(p.price) : '0 ₽'}</b>
              <span>{p.price ? <>{p.period}{p.durationDays ? <><br />доступ на {p.durationDays >= 365 ? 'год' : `${p.durationDays} дн.`}</> : null}</> : 'навсегда'}</span>
            </div>
            <ul className="price-perks">
              {planPerks(p).map(x => <li key={x.text} className={x.ok ? '' : 'off'}><Icon name={x.ok ? 'check' : 'x'} size={15} />{x.text}</li>)}
            </ul>
            {onChoose && (isCurrent
              ? <Button variant="outline" disabled>Ваш тариф</Button>
              : <Button variant={p.price ? 'primary' : 'outline'} size="lg" loading={busy === p.id} onClick={() => onChoose(p)}>{p.price ? ctaPaid : ctaFree}</Button>)}
          </article>
        );
      })}
    </div>
  );
}

/** Запуск оплаты: создаёт платёж и уводит на страницу ЮKassa (в демо — активирует сразу) */
export function useCheckout() {
  const { setMe } = useApp();
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const checkout = async plan => {
    setBusy(plan.id);
    try {
      const r = await post('/billing/checkout', { planId: plan.id });
      if (r.confirmationUrl) { location.href = r.confirmationUrl; return; }
      if (r.me) setMe(r.me);
      toast(r.demo ? `Демо: тариф «${plan.name}» подключён без оплаты` : 'Тариф подключён');
      setBusy('');
    } catch (e) { toast(e.message, 'error', 7000); setBusy(''); }
  };
  return { checkout, busy };
}

export function PlansPage() {
  const { me, nav } = useApp();
  const { checkout, busy } = useCheckout();
  const [billing, setBilling] = useState(null);
  useEffect(() => { get('/billing').then(setBilling).catch(() => {}); }, [me?.plan?.id]);
  const paid = me.plan.price > 0;
  const support = appConfig().support || {};
  return (
    <div className="page">
      <header className="page-head center-head">
        <div>
          <p className="eyebrow">Тарифы</p>
          <h1>Одна оплата — <em>на всю свадьбу</em></h1>
          <p className="lead">Без подписки и автосписаний. Собирайте приглашение бесплатно, а Премиум подключайте, когда будете готовы к рассылке.</p>
        </div>
      </header>
      {paid && <div className="alert alert-gold plan-active"><Icon name="crown" size={18} /><div>У вас тариф <b>«{me.plan.name}»</b>{me.planUntil ? <> до {fmtDate(me.planUntil.slice(0, 10))}</> : null}. Спасибо, что выбрали нас! Если что-то нужно — <a href={support.telegram ? `https://t.me/${support.telegram.replace(/^@/, '')}` : `mailto:${support.email || ''}`}>напишите</a>.</div></div>}
      <PricingCards current={me.plan.id} busy={busy} onChoose={p => (p.price ? checkout(p) : nav('dashboard'))} ctaFree="Остаться на бесплатном" ctaPaid={paid ? 'Продлить ещё на год' : 'Оплатить Премиум'} />
      <div className="pay-notes">
        <p><Icon name="shield" size={16} />Оплата картой, через СБП и другими способами на защищённой странице ЮKassa. Чек придёт на почту.</p>
        <p><Icon name="refresh" size={16} />Передумали в течение 14 дней и не опубликовали премиум-шаблон — вернём деньги полностью. <a href="/legal/terms" target="_blank" rel="noopener">Условия</a></p>
        <p><Icon name="heart" size={16} />Опубликованные приглашения продолжают работать и после окончания срока.</p>
      </div>
      {billing?.payments?.length > 0 && <section className="card mt-lg">
        <h3><Icon name="card" size={16} />История платежей</h3>
        <table className="pay-table"><tbody>
          {billing.payments.map(p => <tr key={p.id}><td>{fmtDate(p.createdAt.slice(0, 10))}</td><td>{p.planName}</td><td className="num">{rub(p.amount)}</td><td><PayStatus s={p.status} /></td></tr>)}
        </tbody></table>
      </section>}
    </div>
  );
}

export function PayStatus({ s }) {
  const map = { succeeded: ['ok', 'Оплачен'], pending: ['warn', 'Ожидает оплаты'], waiting_for_capture: ['warn', 'Обрабатывается'], canceled: ['neutral', 'Отменён'], mismatch: ['danger', 'Ошибка суммы'] };
  const [tone, label] = map[s] || ['neutral', s];
  return <Badge tone={tone} dot>{label}</Badge>;
}

/** Возврат со страницы оплаты: сверяем платёж, пока он не завершится */
export function BillingReturn({ paymentId }) {
  const { nav, setMe } = useApp();
  const [pay, setPay] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let n = 0, stop = false;
    const tick = async () => {
      try {
        const r = await post(`/billing/payments/${paymentId}/sync`);
        if (stop) return;
        setPay(r.payment); setMe(r.me);
        if (r.payment.status === 'pending' && ++n < 20) setTimeout(tick, n < 5 ? 1500 : 4000);
      } catch (e) { if (!stop) setErr(e.message); }
    };
    tick();
    return () => { stop = true; };
  }, [paymentId]);
  const ok = pay?.status === 'succeeded';
  const canceled = pay?.status === 'canceled';
  return (
    <div className="page page-narrow center billing-return">
      {err ? <><Icon name="alert" size={36} /><h1>Не удалось проверить платёж</h1><p className="muted">{err}</p></>
        : !pay || pay.status === 'pending' ? <><span className="spin spin-lg" /><h1>Проверяем <em>оплату</em>…</h1><p className="muted">Обычно это занимает несколько секунд. Если вы закрыли страницу оплаты, платёж можно повторить на странице тарифов.</p></>
          : ok ? <><span className="big-ok"><Icon name="check" size={34} /></span><h1>Премиум <em>подключён</em></h1><p className="muted">Спасибо! Теперь доступны все шаблоны, музыка и гости без ограничений. Чек отправлен на почту.</p></>
            : canceled ? <><Icon name="info" size={36} /><h1>Оплата не прошла</h1><p className="muted">Платёж отменён, деньги не списаны. Попробуйте ещё раз или выберите другой способ оплаты.</p></>
              : <><Icon name="alert" size={36} /><h1>Нужна проверка</h1><p className="muted">С платежом что-то не так. Напишите нам — разберёмся.</p></>}
      <div className="row gap center-row mt">
        <Button variant="primary" onClick={() => nav('dashboard', true)}>К приглашениям</Button>
        {!ok && <Button variant="outline" onClick={() => nav('plans', true)}>К тарифам</Button>}
      </div>
    </div>
  );
}

/** Плашка-пейвол внутри интерфейса */
export function Paywall({ title, children, compact }) {
  const { nav } = useApp();
  const premium = plansList().find(p => p.price > 0);
  return (
    <div className={'paywall' + (compact ? ' paywall-sm' : '')}>
      <span className="paywall-ico"><Icon name="crown" size={20} /></span>
      <div>
        <b>{title}</b>
        {children && <p>{children}</p>}
      </div>
      <Button variant="primary" onClick={() => nav('plans')}>{premium ? `Премиум за ${rub(premium.price)}` : 'Тарифы'}</Button>
    </div>
  );
}
