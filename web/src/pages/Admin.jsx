import React, { useEffect, useState } from 'react';
import { get } from '../api.js';
import { Icon, Badge, rub, fmtDate } from '../ui.jsx';
import { PayStatus } from './Pricing.jsx';

export function AdminPage() {
  const [s, setS] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { get('/admin/stats').then(setS).catch(e => setErr(e.message)); }, []);
  if (err) return <div className="page"><div className="alert alert-error"><Icon name="alert" size={16} />{err}</div></div>;
  if (!s) return <div className="page"><div className="skeleton" /></div>;
  const max = Math.max(1, ...s.daily.map(d => d.revenue));
  const maxU = Math.max(1, ...s.daily.map(d => d.signups));
  const tiles = [
    ['Выручка за 30 дней', rub(s.revenue.month), `всего ${rub(s.revenue.total)}`],
    ['Платящих аккаунтов', s.paying, `конверсия ${s.conversion}%`],
    ['Регистраций', s.users.total, `+${s.users.week} за неделю · +${s.users.month} за месяц`],
    ['Приглашений', s.projects.total, `${s.projects.published} опубликовано`],
    ['Гостей в списках', s.guests, `${s.responses} ответов`],
  ];
  return (
    <div className="page admin">
      <header className="page-head"><div><p className="eyebrow">Администрирование</p><h1>Статистика <em>сервиса</em></h1></div></header>
      <div className="stat-tiles">{tiles.map(([l, v, sub]) => <div key={l} className="stat-tile"><span>{l}</span><b className="num">{v}</b><small>{sub}</small></div>)}</div>
      <section className="card mt">
        <h3><Icon name="chart" size={16} />Последние 30 дней</h3>
        <div className="bars" role="img" aria-label="Выручка и регистрации по дням">
          {s.daily.map(d => (
            <div key={d.date} className="bar" title={`${fmtDate(d.date)}: ${rub(d.revenue)}, регистраций ${d.signups}`}>
              <i className="bar-rev" style={{ height: `${(d.revenue / max) * 100}%` }} />
              <i className="bar-users" style={{ height: `${(d.signups / maxU) * 40}%` }} />
            </div>
          ))}
        </div>
        <p className="small muted"><span className="legend legend-rev" />выручка <span className="legend legend-users" />регистрации</p>
      </section>
      <div className="admin-grid mt">
        <section className="card">
          <h3><Icon name="card" size={16} />Платежи</h3>
          {s.recentPayments.length ? <table className="pay-table"><tbody>
            {s.recentPayments.map(p => <tr key={p.id}><td>{fmtDate(p.createdAt.slice(0, 10))}</td><td className="ellipsis">{p.email || '—'}</td><td className="num">{rub(p.amount)}</td><td><PayStatus s={p.status} /></td></tr>)}
          </tbody></table> : <p className="muted">Платежей пока нет.</p>}
        </section>
        <section className="card">
          <h3><Icon name="users" size={16} />Новые пользователи</h3>
          <table className="pay-table"><tbody>
            {s.recentUsers.map(u => <tr key={u.email}><td>{fmtDate(u.createdAt.slice(0, 10))}</td><td className="ellipsis">{u.email}</td><td>{u.projects}</td><td><Badge tone={u.plan === 'Бесплатный' ? 'neutral' : 'gold'}>{u.plan}</Badge></td></tr>)}
          </tbody></table>
        </section>
        <section className="card">
          <h3><Icon name="layers" size={16} />Популярность шаблонов</h3>
          <ul className="tpl-pop">{Object.entries(s.templates).sort((a, b) => b[1] - a[1]).map(([n, c]) => <li key={n}><span>{n}</span><b className="num">{c}</b></li>)}</ul>
        </section>
      </div>
    </div>
  );
}
