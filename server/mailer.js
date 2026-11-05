// Минимальный SMTP-клиент без зависимостей: SMTPS (465) или STARTTLS (587), AUTH LOGIN/PLAIN.
// Подходит для Яндекс 360, Mail.ru, Unisender Go SMTP, Postmark, SendGrid и т. п.
import net from 'node:net';
import tls from 'node:tls';
import os from 'node:os';
import crypto from 'node:crypto';

const b64 = s => Buffer.from(String(s), 'utf8').toString('base64');
const encodeHeader = s => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);
const wrap = s => s.replace(/.{1,76}/g, '$&\r\n');

function buildMessage({ from, fromName, to, subject, text, html }) {
  const boundary = 'wn_' + crypto.randomBytes(12).toString('hex');
  const domain = (from.split('@')[1] || 'localhost').replace(/[^a-z0-9.-]/gi, '');
  const headers = [
    `From: ${encodeHeader(fromName)} <${from}>`,
    `To: <${to}>`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${domain}>`,
    'MIME-Version: 1.0',
  ];
  const part = (type, body) => `--${boundary}\r\nContent-Type: ${type}; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap(b64(body))}`;
  const htmlDoc = html && `<!doctype html><html><body style="font:15px/1.55 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#2b2724;background:#faf7f2;padding:24px"><div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;padding:28px">${html}<p style="margin-top:28px;color:#a08a6a;letter-spacing:.2em;font-size:12px">WEDNELLO</p></div></body></html>`;
  const body = htmlDoc
    ? [`Content-Type: multipart/alternative; boundary="${boundary}"`, '', part('text/plain', text || ''), part('text/html', htmlDoc), `--${boundary}--`, ''].join('\r\n')
    : ['Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '', wrap(b64(text || ''))].join('\r\n');
  return headers.join('\r\n') + '\r\n' + body;
}

class Conn {
  constructor(socket) { this.attach(socket); }
  attach(socket) {
    this.socket = socket; this.buf = ''; this.waiters = []; this.lines = [];
    socket.setEncoding('utf8');
    socket.on('data', d => { this.buf += d; this.drain(); });
    socket.on('error', e => { this.error = e; this.waiters.splice(0).forEach(w => w.reject(e)); });
    socket.on('close', () => { const e = this.error || new Error('SMTP: соединение закрыто'); this.waiters.splice(0).forEach(w => w.reject(e)); });
  }
  drain() {
    let i;
    while ((i = this.buf.indexOf('\r\n')) >= 0) {
      const line = this.buf.slice(0, i); this.buf = this.buf.slice(i + 2);
      this.lines.push(line);
      if (/^\d{3} /.test(line) || /^\d{3}$/.test(line)) {
        const lines = this.lines; this.lines = [];
        const w = this.waiters.shift();
        if (w) w.resolve({ code: +line.slice(0, 3), text: lines.join('\n') });
      }
    }
  }
  read() { return new Promise((resolve, reject) => this.waiters.push({ resolve, reject })); }
  async cmd(line, expect) {
    if (line !== null) this.socket.write(line + '\r\n');
    const r = await this.read();
    if (expect && !expect.includes(r.code)) throw new Error(`SMTP ${r.code}: ${r.text.slice(0, 200)}`);
    return r;
  }
}

export function createMailer(smtp) {
  if (!smtp.host) return null;
  return async function sendMail({ to, subject, text, html }) {
    const timeout = 20000;
    const raw = await new Promise((resolve, reject) => {
      const s = smtp.secure ? tls.connect({ host: smtp.host, port: smtp.port, servername: smtp.host }) : net.connect({ host: smtp.host, port: smtp.port });
      s.setTimeout(timeout, () => s.destroy(new Error('SMTP: таймаут')));
      s.once(smtp.secure ? 'secureConnect' : 'connect', () => resolve(s));
      s.once('error', reject);
    });
    let c = new Conn(raw);
    try {
      await c.cmd(null, [220]);
      const host = os.hostname() || 'localhost';
      let ehlo = await c.cmd(`EHLO ${host}`, [250]);
      if (!smtp.secure && /STARTTLS/i.test(ehlo.text)) {
        await c.cmd('STARTTLS', [220]);
        raw.removeAllListeners('data');
        const secured = await new Promise((resolve, reject) => {
          const t = tls.connect({ socket: raw, servername: smtp.host }, () => resolve(t));
          t.once('error', reject);
        });
        c = new Conn(secured);
        ehlo = await c.cmd(`EHLO ${host}`, [250]);
      }
      if (smtp.user) {
        if (/AUTH[^\n]*PLAIN/i.test(ehlo.text)) await c.cmd('AUTH PLAIN ' + b64(`\0${smtp.user}\0${smtp.pass}`), [235]);
        else { await c.cmd('AUTH LOGIN', [334]); await c.cmd(b64(smtp.user), [334]); await c.cmd(b64(smtp.pass), [235]); }
      }
      await c.cmd(`MAIL FROM:<${smtp.from}>`, [250]);
      await c.cmd(`RCPT TO:<${to}>`, [250, 251]);
      await c.cmd('DATA', [354]);
      const msg = buildMessage({ from: smtp.from, fromName: smtp.fromName, to, subject, text, html }).replace(/\r\n\./g, '\r\n..');
      await c.cmd(msg + '\r\n.', [250]);
      c.cmd('QUIT').catch(() => {});
    } finally {
      setTimeout(() => c.socket.destroy(), 500);
    }
  };
}

export { buildMessage };
