// Клиент API. Если рядом есть Node-сервер — ходит в него; если нет (статический хостинг, превью) —
// запускает то же ядро прямо в браузере поверх IndexedDB (демо-режим).
import { createCore, emptyDb } from '../../shared/core.js';
import { seedDemo } from '../../shared/seed.js';

let mode = null, local = null, token = null, seenRev = null;
const readRev = () => { try { return localStorage.getItem('wednello.rev'); } catch { return null; } };
const TOKEN_KEY = 'wednello.token';
try { token = localStorage.getItem(TOKEN_KEY); } catch {}
export const getToken = () => token;
export function setToken(t) { token = t; try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {} }
export const getMode = () => mode;

/* ───────── браузерное хранилище ───────── */
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('wednello', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function idbGet(key) {
  const d = await idb();
  return new Promise((res, rej) => { const q = d.transaction('kv').objectStore('kv').get(key); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
}
async function idbSet(key, val) {
  const d = await idb();
  return new Promise((res, rej) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(val, key); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
}
async function sha(s) {
  if (globalThis.crypto?.subtle) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('wednello:' + s));
    return Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join('');
  }
  let h = 5381; for (const c of 'wednello:' + s) h = (h * 33) ^ c.charCodeAt(0); return 'w' + (h >>> 0).toString(16);
}

async function startLocal() {
  let data = null, persistent = true;
  try { data = await idbGet('db'); } catch { persistent = false; }
  if (!data) {
    try { const raw = localStorage.getItem('wednello.db'); if (raw) data = JSON.parse(raw); } catch {}
  }
  let timer = 0;
  const store = {
    data: data || emptyDb(),
    save() {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          if (persistent) await idbSet('db', store.data); else localStorage.setItem('wednello.db', JSON.stringify(store.data));
          seenRev = String(Date.now()) + Math.random().toString(36).slice(2, 6);
          try { localStorage.setItem('wednello.rev', seenRev); } catch {}
        } catch (e) { console.warn('Не удалось сохранить данные демо', e); }
      }, 120);
    },
  };
  seenRev = readRev();
  // другая вкладка (например, гостевая страница) изменила данные — перечитываем
  store.refresh = async () => {
    const r = readRev();
    if (!r || r === seenRev) return;
    try { const fresh = persistent ? await idbGet('db') : JSON.parse(localStorage.getItem('wednello.db') || 'null'); if (fresh) store.data = fresh; seenRev = r; } catch {}
  };
  const hash = p => sha(p);
  const core = createCore({ store, hashPassword: hash, verifyPassword: async (p, h) => (await sha(p)) === h, isDemo: true });
  await seedDemo({ store, core, hashPassword: hash });
  return { core, store };
}

export async function initApi() {
  if (mode) return mode;
  try {
    const r = await fetch('api/health', { headers: { Accept: 'application/json' } });
    const j = r.ok ? await r.json() : null;
    if (j && j.app === 'wednello') mode = 'server';
  } catch {}
  if (!mode) { mode = 'demo'; local = await startLocal(); }
  return mode;
}

export class ApiError extends Error { constructor(status, data) { super(data?.error || 'Ошибка'); this.status = status; this.data = data; } }

export async function api(method, path, body, query) {
  if (!mode) await initApi();
  let res;
  if (mode === 'demo') {
    await local.store.refresh();
    res = await local.core.handle({ method, path, body: body === undefined ? undefined : JSON.parse(JSON.stringify(body)), query: query || {}, token });
    res = { status: res.status, data: JSON.parse(JSON.stringify(res.data ?? null)) };
  } else {
    const qs = query ? '?' + new URLSearchParams(query) : '';
    const r = await fetch('/api' + path + qs, {
      method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    res = { status: r.status, data: await r.json().catch(() => ({ error: 'Сервер ответил без данных' })) };
  }
  if (res.status >= 400) throw new ApiError(res.status, res.data);
  return res.data;
}
export const get = (p, q) => api('GET', p, undefined, q);
export const post = (p, b) => api('POST', p, b ?? {});
export const patch = (p, b) => api('PATCH', p, b);
export const put = (p, b) => api('PUT', p, b);
export const del = p => api('DELETE', p);

/* ───────── ссылки ───────── */
const base = () => location.href.split('#')[0];
export function inviteUrl(slug, guestToken) {
  if (mode === 'server') return `${location.origin}/i/${slug}${guestToken ? '?g=' + guestToken : ''}`;
  return `${base()}#invite-${slug}${guestToken ? '--' + guestToken : ''}`;
}
export function coupleUrl(token) {
  return mode === 'server' ? `${location.origin}/#couple-${token}` : `${base()}#couple-${token}`;
}
/** Адрес картинки для интерфейса конструктора */
export const appAsset = src => (src && src.startsWith('@demo/') ? 'templates/_demo/' + src.slice(6) : src || '');
/** Адрес картинки изнутри шаблона (templates/<id>/index.html) */
export const tplAsset = src => (src && src.startsWith('@demo/') ? '../_demo/' + src.slice(6) : src || '');

/* ───────── загрузка файлов ───────── */
export function readFile(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(file); });
}
export async function resizeImage(file, max = 1600, quality = 0.85) {
  const url = await readFile(file);
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  const g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}
export async function uploadImage(file, max) {
  const dataUrl = await resizeImage(file, max);
  return (await post('/uploads', { dataUrl, name: file.name })).url;
}
export async function uploadAudio(file) {
  if (file.size > 12 * 1024 * 1024) throw new Error('Файл больше 12 МБ — сожмите трек или возьмите фрагмент');
  const dataUrl = await readFile(file);
  return (await post('/uploads', { dataUrl, name: file.name })).url;
}

/** Скачать файл (на статическом хостинге в песочнице может не сработать — поэтому рядом всегда есть «Скопировать») */
export function download(name, text, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob(['﻿' + text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
