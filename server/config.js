// Настройки из переменных окружения (и из файла .env рядом с package.json, если он есть).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile) && typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(envFile); } catch (e) { console.warn('Не удалось прочитать .env:', e.message); }
}

const env = (k, d = '') => (process.env[k] ?? d).toString().trim();
const flag = (k, d) => { const v = env(k); return v === '' ? d : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase()); };
const production = env('NODE_ENV') === 'production';

export const config = {
  production,
  port: +env('PORT', '3000') || 3000,
  host: env('HOST', '0.0.0.0'),
  dataDir: path.resolve(env('DATA_DIR', path.join(ROOT, 'data'))),
  distDir: path.join(ROOT, 'dist'),
  publicUrl: env('PUBLIC_URL', `http://localhost:${env('PORT', '3000')}`).replace(/\/$/, ''),
  demo: flag('DEMO', !production),
  trustProxy: flag('TRUST_PROXY', production),
  adminEmails: env('ADMIN_EMAILS').split(',').map(s => s.trim()).filter(Boolean),
  backupsKeep: +env('BACKUPS_KEEP', '14') || 14,
  smtp: {
    host: env('SMTP_HOST'),
    port: +env('SMTP_PORT', '465') || 465,
    secure: flag('SMTP_SECURE', (+env('SMTP_PORT', '465') || 465) === 465),
    user: env('SMTP_USER'),
    pass: env('SMTP_PASS'),
    from: env('MAIL_FROM', env('SMTP_USER')),
    fromName: env('MAIL_FROM_NAME', 'WEDNELLO'),
  },
  yookassa: {
    shopId: env('YOOKASSA_SHOP_ID'),
    secretKey: env('YOOKASSA_SECRET_KEY'),
    receipt: flag('YOOKASSA_RECEIPT', false),
    vatCode: +env('YOOKASSA_VAT_CODE', '1') || 1,
    taxSystemCode: env('YOOKASSA_TAX_SYSTEM') ? +env('YOOKASSA_TAX_SYSTEM') : null,
  },
  metrikaId: env('METRIKA_ID').replace(/\D/g, ''),
  legal: {
    brand: env('LEGAL_BRAND', 'WEDNELLO'),
    name: env('LEGAL_NAME', '[ФИО ИП или название организации]'),
    inn: env('LEGAL_INN', '[ИНН]'),
    ogrn: env('LEGAL_OGRN', '[ОГРН / ОГРНИП]'),
    address: env('LEGAL_ADDRESS', '[Адрес]'),
    email: env('LEGAL_EMAIL', env('MAIL_FROM', 'hello@example.com')),
    phone: env('LEGAL_PHONE', ''),
    telegram: env('SUPPORT_TELEGRAM', ''),
  },
};

export function configWarnings() {
  const w = [];
  if (config.production) {
    if (config.demo) w.push('DEMO=1 в продакшене: демо-кабинет с общим паролем открыт всем. Поставьте DEMO=0.');
    if (!/^https:\/\//.test(config.publicUrl)) w.push('PUBLIC_URL должен начинаться с https:// — от него строятся ссылки в письмах и возврат после оплаты.');
    if (!config.smtp.host) w.push('SMTP не настроен: письма для сброса пароля и уведомления не отправляются.');
    if (!config.yookassa.shopId) w.push('ЮKassa не настроена: оплата Премиума недоступна.');
    if (config.legal.inn.startsWith('[')) w.push('Не заполнены реквизиты (LEGAL_*): они нужны в оферте и для модерации ЮKassa.');
    if (!config.adminEmails.length) w.push('ADMIN_EMAILS пуст: раздел статистики никому не доступен.');
  }
  return w;
}
