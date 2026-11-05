(() => {
'use strict';

/* Настройки, тексты, фото и анкета управляются конструктором (../_runtime/runtime.js) */

/* ═══════════ утилиты ═══════════ */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const byId = id => document.getElementById(id);
const clamp = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (p, a, b) => clamp((p - a) / (b - a));
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOut = t => 1 - Math.pow(1 - t, 3);
const RAD = Math.PI / 180;

/* ═══════════ геометрия ═══════════ */
const PW = 520, PH = 780, TH = 168;                          // страница и толщина книги (условные единицы)
const SH = { w: 894, h: 1126, gx: 335, gy: 424, gw: 129, gh: 246 };   // шкаф и проём в нём (px картинки)
const WALL = { h: 1199, ext: 700, wide: 2712, floor: 1152, textX: 905 };
const LEAN = 13;                                             // наклон корешка в проёме, градусы

/* ═══════════ элементы ═══════════ */
const cinema = byId('cinema'), stage = byId('stage');
const shelfScene = byId('shelfScene'), wallwide = byId('wallwide'), shelfBox = byId('shelfBox'), gapback = byId('gapback');
const shelfDim = byId('shelfDim'), tableScene = byId('tableScene'), tworld = byId('tworld'), bshadow = byId('bshadow');
const bookfx = byId('bookfx'), persp = byId('persp'), bk = byId('bk'), spineFace = byId('spineFace');
const lfBase = byId('lfBase'), lfMid = byId('lfMid'), lfCover = byId('lfCover');
const leaves = [lfBase, lfMid, lfCover];
const midFront = $('.front', lfMid), baseFront = $('.front', lfBase), coverBack = $('.back', lfCover);
const pol1 = byId('pol1'), pol2 = byId('pol2'), cap1 = $('.cap span', pol1), cap2 = $('.cap span', pol2);
const words = $$('#words > *'), inv = $$('#inv > *');
const hint = byId('hint'), caption = byId('caption'), skip = byId('skip'), dust = byId('dust');

/* ═══════════ раскладка под размер экрана ═══════════ */
let G = {};
function layout() {
  const vw = stage.clientWidth, vh = stage.clientHeight;
  const portrait = vw / vh < .9;
  const sw = vh / WALL.h;

  const shelfH = portrait ? Math.min(.46 * vh, vw * .9 * SH.h / SH.w) : .66 * vh;
  const ss = shelfH / SH.h, shelfW = SH.w * ss;
  const shelfT = WALL.floor * sw - shelfH;
  const shelfL = portrait ? (vw - shelfW) / 2 : vw * .34 - shelfW / 2;
  const wallLeft = (portrait ? vw / 2 : vw * .745) - WALL.textX * sw;

  Object.assign(wallwide.style, { width: WALL.wide * sw + 'px', height: vh + 'px', left: (wallLeft - WALL.ext * sw) + 'px', top: '0px' });
  Object.assign(shelfBox.style, { left: shelfL + 'px', top: shelfT + 'px', width: shelfW + 'px', height: shelfH + 'px' });
  Object.assign(gapback.style, { left: SH.gx * ss + 'px', top: SH.gy * ss + 'px', width: SH.gw * ss + 'px', height: SH.gh * ss + 'px' });

  /* камера у шкафа */
  const Gx = shelfL + (SH.gx + SH.gw / 2) * ss, Gy = shelfT + (SH.gy + SH.gh / 2) * ss;
  const H0 = SH.gh * ss, T0 = H0 * TH / PH, th = LEAN * RAD;
  const Zg = (portrait ? .42 : .5) * vh / H0;
  const brx = shelfL + (SH.gx + SH.gw) * ss - H0 * Math.sin(th), bry = shelfT + (SH.gy + SH.gh) * ss;
  const P0 = {
    x: brx + (-T0 / 2 * Math.cos(th) + H0 / 2 * Math.sin(th)),
    y: bry + (-T0 / 2 * Math.sin(th) - H0 / 2 * Math.cos(th))
  };
  shelfScene.style.transformOrigin = `${Gx}px ${Gy}px`;

  /* виды на книгу */
  const kF = Math.min(.92 * vh / PH, vw * .98 / PW);
  const kC = portrait ? Math.min(vw * .6 / PW, .5 * vh / PH) : .6 * vh / PH;
  const kS = Math.min(vw * .94 / (2 * PW + 30), vh * .86 / PH);
  const kP = Math.min(vw * .96 / PW, vh * .9 / PH);                     // одна страница крупно (телефон)
  const kD = Math.min(vw * .56 / PW, vh * .95 / PH);                    // приглашение крупно (компьютер)
  const keys = portrait
    ? [[.29, kF, PW / 2], [.38, kC, PW / 2], [.50, kS, 0], [.54, kS, 0], [.57, kP, -PW / 2], [.63, kP, -PW / 2], [.66, kP, PW / 2],
       [.70, kP, PW / 2], [.725, kS, 0], [.90, kS, 0], [.95, kP, PW / 2], [1, kP, PW / 2]]
    : [[.29, kF, PW / 2], [.38, kC, PW / 2], [.50, kS, 0], [.90, kS * 1.03, 0], [.96, kD, PW / 2], [1, kD, PW / 2]];

  const tm = portrait
    ? { d1: [.54, .60], c1: [.59, .63], d2: [.64, .68], c2: [.67, .70] }
    : { d1: [.50, .57], c1: [.56, .61], d2: [.56, .63], c2: [.62, .67] };

  G = { vw, vh, portrait, Gx, Gy, H0, Zg, P0, kF, keys, tm };
  readScroll();
  if (reduced) render(.985);
}

function camAt(p) {
  const ks = G.keys;
  if (p <= ks[0][0]) return { k: ks[0][1], cx: ks[0][2] };
  for (let i = 1; i < ks.length; i++) {
    if (p <= ks[i][0]) {
      const t = ease(seg(p, ks[i - 1][0], ks[i][0]));
      return { k: lerp(ks[i - 1][1], ks[i][1], t), cx: lerp(ks[i - 1][2], ks[i][2], t) };
    }
  }
  const l = ks[ks.length - 1];
  return { k: l[1], cx: l[2] };
}

/* ═══════════ прокрутка ═══════════ */
let target = 0, cur = 0, inView = true;
function readScroll() {
  const r = cinema.getBoundingClientRect();
  const total = Math.max(1, cinema.offsetHeight - stage.clientHeight);
  target = clamp(-r.top / total);
  inView = r.bottom > -50 && r.top < innerHeight + 50;
}

/* ═══════════ один кадр по прогрессу p ═══════════ */
let lastCap = '';
function render(p) {
  const g = G; if (!g.vw) return;
  const { vw, vh, Gx, Gy, H0, Zg, P0, kF, tm } = g;

  /* камера у шкафа */
  const e1 = ease(seg(p, .035, .14));
  const Z = lerp(1, Zg, e1);
  const dx = (vw / 2 - Gx) * e1, dy = (vh / 2 - Gy) * e1;
  shelfScene.style.transform = `translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px) scale(${Z.toFixed(4)})`;
  shelfScene.style.opacity = (1 - seg(p, .27, .31)).toFixed(3);
  shelfScene.style.display = p > .315 ? 'none' : 'block';
  shelfDim.style.display = p > .315 ? 'none' : 'block';
  tableScene.style.visibility = p < .2 ? 'hidden' : 'visible';
  shelfDim.style.opacity = (seg(p, .15, .27) * .82).toFixed(3);
  tableScene.style.opacity = ease(seg(p, .22, .30)).toFixed(3);

  /* состояние книги */
  let sx, sy, k, turn = 0, rz = 0;
  const eo = ease(seg(p, .38, .50));                    // обложка открыта
  if (p < .29) {
    const ax = Gx + Z * (P0.x - Gx) + dx, ay = Gy + Z * (P0.y - Gy) + dy;
    let kA = H0 * Z / PH;
    kA *= 1 + .06 * ease(seg(p, .13, .17));
    const pt = ease(seg(p, .16, .29));
    sx = lerp(ax, vw / 2 - kF * PW / 2, pt); sy = lerp(ay, vh / 2, pt);
    k = lerp(kA, kF, pt) * (1 + .05 * Math.sin(Math.PI * pt));
    turn = 90 * (1 - ease(seg(p, .19, .285)));
    rz = LEAN * (1 - ease(seg(p, .15, .24)));
  } else {
    const c = camAt(p);
    const settle = 1 - ease(seg(p, .29, .38));
    k = c.k; sx = vw / 2 - k * c.cx + 36 * settle; sy = vh / 2;
    rz = -3 * settle;
  }

  /* листы */
  const aC = 180 * eo;
  const aM = 180 * ease(seg(p, .72, .84));
  const zc = TH / 2 * (1 - eo);
  const put = (el, z, a, sh) => { el.style.transform = `translateZ(${z.toFixed(2)}px) rotateY(${(-a).toFixed(2)}deg)`; el.style.setProperty('--sh', sh.toFixed(3)); };
  put(lfCover, aC < 90 ? zc + 1.2 : .3, aC, .5 * Math.sin(aC * RAD));
  put(lfMid, aM < 90 ? .6 : 1.5, aM, .5 * Math.sin(aM * RAD));
  put(lfBase, -zc, 0, 0);
  const cr = a => a < 90 ? Math.sin(a * RAD) : 0, cl = a => a > 90 ? Math.sin(a * RAD) : 0;
  midFront.style.setProperty('--cs', cr(aC).toFixed(3));
  baseFront.style.setProperty('--cs', cr(aM).toFixed(3));
  coverBack.style.setProperty('--cs', cl(aM).toFixed(3));
  const showLeaves = turn < 86;
  leaves.forEach(l => { l.style.visibility = showLeaves ? 'visible' : 'hidden'; });
  spineFace.style.visibility = turn > 2 ? 'visible' : 'hidden';

  bookfx.style.transform = `translate(${sx.toFixed(2)}px,${sy.toFixed(2)}px)`;
  bk.style.transform = `rotateZ(${rz.toFixed(2)}deg) scale3d(${k.toFixed(4)},${k.toFixed(4)},${k.toFixed(4)}) rotateY(${turn.toFixed(2)}deg)`;
  persp.style.perspectiveOrigin = `${(k * PW / 2 * (1 - eo) * (1 - turn / 90)).toFixed(1)}px 0px`;

  /* тень книги и мир стола */
  const s = Math.sin(turn * RAD), cT = Math.cos(turn * RAD);
  const bl = sx + k * (-TH / 2 * s - PW * eo), br = sx + k * (PW * cT + TH / 2 * s);
  Object.assign(bshadow.style, {
    transform: `translate(${bl.toFixed(1)}px,${(sy - k * PH / 2).toFixed(1)}px) rotate(${rz.toFixed(2)}deg) scale(${((br - bl) / 100).toFixed(4)},${(k * PH / 100).toFixed(4)})`,
    opacity: (.62 * seg(p, .13, .22)).toFixed(3)
  });
  tworld.style.transform = `translate(${sx.toFixed(2)}px,${sy.toFixed(2)}px) scale(${k.toFixed(4)}) rotate(${rz.toFixed(2)}deg)`;

  /* фото проявляются, подписи «пишутся» */
  pol1.style.setProperty('--d', ease(seg(p, tm.d1[0], tm.d1[1])).toFixed(3));
  pol2.style.setProperty('--d', ease(seg(p, tm.d2[0], tm.d2[1])).toFixed(3));
  cap1.style.setProperty('--w', seg(p, tm.c1[0], tm.c1[1]).toFixed(3));
  cap2.style.setProperty('--w', seg(p, tm.c2[0], tm.c2[1]).toFixed(3));

  /* слова слева на втором развороте и приглашение справа */
  words.forEach((el, i) => el.style.setProperty('--o', easeOut(seg(p, .82 + i * .012, .86 + i * .012)).toFixed(3)));
  inv.forEach((el, i) => {
    const u = easeOut(seg(p, .85 + i * .011, .89 + i * .011));
    el.style.opacity = u.toFixed(3);
    el.style.transform = `translateY(${((1 - u) * 10).toFixed(1)}px)`;
  });

  /* подписи, подсказка, пропуск */
  let cap = '', co = 0;
  if (p > .14 && p < .29) { cap = 'Достаём книгу'; co = seg(p, .14, .17) * (1 - seg(p, .27, .29)); }
  else if (p > .30 && p < .37) { cap = 'Кладём на стол'; co = seg(p, .30, .32) * (1 - seg(p, .35, .37)); }
  else if (p > .40 && p < .50) { cap = 'Открываем'; co = seg(p, .40, .42) * (1 - seg(p, .47, .50)); }
  else if (p > .72 && p < .84) { cap = 'Переворачиваем страницу'; co = seg(p, .72, .74) * (1 - seg(p, .81, .84)); }
  else if (p > .975) { cap = 'Листайте дальше'; co = seg(p, .975, .995); }
  if (cap && cap !== lastCap) { caption.textContent = cap; lastCap = cap; }
  caption.style.opacity = co.toFixed(3);
  hint.style.opacity = (1 - seg(p, .02, .06)).toFixed(3);
  skip.style.opacity = (1 - seg(p, .94, .98)).toFixed(3);
  skip.style.pointerEvents = p > .96 ? 'none' : 'auto';
}

/* ═══════════ цикл ═══════════ */
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let lastR = -1;
function frame(now) {
  cur += (target - cur) * .16;
  if (Math.abs(target - cur) < 1e-5) cur = target;
  if (inView && cur !== lastR) { lastR = cur; render(cur); }
  requestAnimationFrame(frame);
}

addEventListener('scroll', readScroll, { passive: true });
let rsT = 0, lastW = 0, lastH = 0;
addEventListener('resize', () => { clearTimeout(rsT); rsT = setTimeout(() => { if (stage.clientWidth !== lastW || stage.clientHeight !== lastH) { lastW = stage.clientWidth; lastH = stage.clientHeight; lastR = -1; layout(); } }, 200); });
addEventListener('load', () => { lastW = stage.clientWidth; lastH = stage.clientHeight; lastR = -1; layout(); });
if (reduced) document.body.classList.add('reduced');
layout();
if (!reduced) requestAnimationFrame(frame);
window.__setP = p => { target = cur = p; lastR = p; render(p); };   // для отладки

skip.addEventListener('click', () => {
  scrollTo({ top: cinema.offsetTop + cinema.offsetHeight, behavior: reduced ? 'auto' : 'smooth' });
});

/* ═══════════ обычная часть сайта ═══════════ */
const io = new IntersectionObserver(es => es.forEach(e => {
  if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}), { threshold: .1 });
$$('.reveal').forEach(el => io.observe(el));

})();
