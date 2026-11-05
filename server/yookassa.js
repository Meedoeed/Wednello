// Приём оплаты через ЮKassa (API v3): создание платежа с редиректом и проверка статуса.
// Вебхук не доверяет телу запроса: статус всегда перепроверяется запросом к API.
import crypto from 'node:crypto';

const API = 'https://api.yookassa.ru/v3';

export function createYooKassa({ shopId, secretKey, receipt, vatCode, taxSystemCode }, { publicUrl }) {
  if (!shopId || !secretKey) return null;
  const auth = 'Basic ' + Buffer.from(`${shopId}:${secretKey}`).toString('base64');

  async function call(method, path, body, idempotenceKey) {
    const res = await fetch(API + path, {
      method,
      headers: {
        Authorization: auth, 'Content-Type': 'application/json',
        ...(idempotenceKey ? { 'Idempotence-Key': idempotenceKey } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error('Платёжная система: ' + (data.description || `HTTP ${res.status}`));
      err.status = 502; throw err;
    }
    return data;
  }

  return {
    async createPayment({ payment, plan, user }) {
      const value = (Math.round(payment.amount * 100) / 100).toFixed(2);
      const description = `WEDNELLO: тариф «${plan.name}»${plan.durationDays ? ` на ${plan.durationDays} дн.` : ''}`.slice(0, 128);
      const body = {
        amount: { value, currency: 'RUB' },
        capture: true,
        confirmation: { type: 'redirect', return_url: `${publicUrl}/#billing-${payment.id}` },
        description,
        metadata: { paymentId: payment.id, workspaceId: payment.workspaceId, planId: plan.id },
      };
      if (receipt) {
        body.receipt = {
          customer: { email: user.email },
          items: [{
            description: description.slice(0, 128), quantity: '1.00', amount: { value, currency: 'RUB' },
            vat_code: vatCode, payment_mode: 'full_payment', payment_subject: 'service',
          }],
          ...(taxSystemCode ? { tax_system_code: taxSystemCode } : {}),
        };
      }
      const r = await call('POST', '/payments', body, payment.id);
      return { providerId: r.id, status: r.status, confirmationUrl: r.confirmation?.confirmation_url || null };
    },
    async fetchPayment(id) {
      if (!/^[\w-]{10,64}$/.test(id)) return null;
      return call('GET', '/payments/' + encodeURIComponent(id));
    },
  };
}

/** Диапазоны IP, с которых ЮKassa шлёт уведомления (https://yookassa.ru/developers/using-api/webhooks) */
const RANGES = ['185.71.76.0/27', '185.71.77.0/27', '77.75.153.0/25', '77.75.156.11/32', '77.75.156.35/32', '77.75.154.128/25', '2a02:5180::/32'];
function inCidr(ip, cidr) {
  const [range, bits] = cidr.split('/');
  if (net4(ip) !== null && net4(range) !== null) {
    const mask = bits === '0' ? 0 : (~0 << (32 - +bits)) >>> 0;
    return (net4(ip) & mask) === (net4(range) & mask);
  }
  if (ip.includes(':') && range.includes(':')) return ip.toLowerCase().startsWith(range.split('::')[0].toLowerCase() + ':');
  return false;
}
function net4(ip) {
  const m = /^(?:::ffff:)?(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip || '');
  return m ? ((+m[1] << 24) | (+m[2] << 16) | (+m[3] << 8) | +m[4]) >>> 0 : null;
}
export const isYooKassaIp = ip => RANGES.some(r => inCidr(ip, r));
export const randomKey = () => crypto.randomUUID();
