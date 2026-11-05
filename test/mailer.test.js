import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { createMailer } from '../server/mailer.js';

test('SMTP: авторизация и отправка письма с кириллицей', async () => {
  const got = { lines: [] };
  const srv = net.createServer(sock => {
    sock.setEncoding('utf8');
    let data = false, buf = '';
    sock.write('220 test ESMTP\r\n');
    sock.on('data', chunk => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (data) { if (line === '.') { data = false; sock.write('250 queued\r\n'); } else got.lines.push(line); continue; }
        if (/^EHLO/.test(line)) sock.write('250-test\r\n250 AUTH LOGIN PLAIN\r\n');
        else if (/^AUTH PLAIN/.test(line)) { got.auth = Buffer.from(line.slice(11), 'base64').toString(); sock.write('235 ok\r\n'); }
        else if (/^MAIL FROM/.test(line)) { got.from = line; sock.write('250 ok\r\n'); }
        else if (/^RCPT TO/.test(line)) { got.to = line; sock.write('250 ok\r\n'); }
        else if (line === 'DATA') { data = true; sock.write('354 go\r\n'); }
        else if (line === 'QUIT') { sock.write('221 bye\r\n'); sock.end(); }
      }
    });
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const send = createMailer({ host: '127.0.0.1', port: srv.address().port, secure: false, user: 'u@w.ru', pass: 'p', from: 'u@w.ru', fromName: 'WEDNELLO' });
  await send({ to: 'guest@x.ru', subject: 'Новый ответ гостя', text: 'Привет', html: '<p>Привет</p>' });
  srv.close();
  assert.equal(got.auth, '\0u@w.ru\0p');
  assert.equal(got.to, 'RCPT TO:<guest@x.ru>');
  const raw = got.lines.join('\n');
  assert.match(raw, /Subject: =\?UTF-8\?B\?/);
  assert.match(raw, /multipart\/alternative/);
});
