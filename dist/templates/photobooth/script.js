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
const pulse = (p, c, w) => { const d = 1 - Math.abs(p - c) / w; return d > 0 ? d * d : 0; };

/* ═══════════ геометрия мира (в пикселях картинки будки 1086×1448) ═══════════ */
const BW = 1086, BH = 1448;
const ARM = { k: .55, w: 1000, h: 724, pinch: [150, 296] };   // точка «щипка» на кисти
const P = [300, 780];                                         // где рука держит полоску
const ARM_L = P[0] - ARM.pinch[0] * ARM.k, ARM_T = P[1] - ARM.pinch[1] * ARM.k;
const CLIP_R = 770, X0 = CLIP_R - ARM_L + 20;                 // на сколько рука спрятана внутри
const STRIP = { w: 724, h: 2172, held: 100 / 724 };
const WIN = [[84, 260, 637, 689], [84, 730, 637, 1134], [84, 1175, 637, 1542], [84, 1579, 637, 1944]];
const WIN_C = WIN.map(w => (w[1] + w[3]) / 2);
const CURT = { x0: 145, x1: 875, rod: 117, bot: 1458, L: 452, R: 792, rodW: 300, botW: 1370 };

/* ═══════════ элементы ═══════════ */
const cinema = byId('cinema'), stage = byId('stage');
const wall = byId('wall'), lamp = byId('lamp'), world = byId('world');
const signGlow = byId('signGlow'), cabinGlow = byId('cabinGlow'), flashGlow = byId('flashGlow');
const booth = byId('booth'), armClip = byId('armClip'), arm = byId('arm');
const rod = byId('rod'), cloth = byId('cloth'), strip = byId('strip');
const dim = byId('dim'), flash = byId('flash'), dust = byId('dust');
const count = byId('count'), countNum = byId('countNum'), caption = byId('caption');
const hint = byId('hint'), skip = byId('skip');
const wins = $$('.win', strip);
const invParts = $$('#invIn > *').map((el, i) => ({ el, a: .93 + i * .0105, b: .955 + i * .0105 }));

/* статическая геометрия */
arm.style.left = ARM_L + 'px'; arm.style.top = ARM_T + 'px';
arm.style.width = ARM.w * ARM.k + 'px'; arm.style.height = ARM.h * ARM.k + 'px';

const cSx = (CURT.R - CURT.L) / (CURT.x1 - CURT.x0);
const cSy = (CURT.botW - CURT.rodW) / (CURT.bot - CURT.rod);
[rod, cloth].forEach(el => {
  el.style.left = (CURT.L - CURT.x0 * cSx) + 'px'; el.style.top = (CURT.rodW - CURT.rod * cSy) + 'px';
  el.style.width = 1024 * cSx + 'px'; el.style.height = 1536 * cSy + 'px';
});
cloth.style.transformOrigin = (CURT.x1 / 1024 * 100) + '% 0';

wins.forEach((w, i) => {
  const [x0, y0, x1, y1] = WIN[i];
  w.style.left = x0 / STRIP.w * 100 + '%'; w.style.top = y0 / STRIP.h * 100 + '%';
  w.style.width = (x1 - x0) / STRIP.w * 100 + '%'; w.style.height = (y1 - y0) / STRIP.h * 100 + '%';
  w.style.setProperty('--d', 0);
});

/* ═══════════ раскладка ═══════════ */
let G = {};
function layout() {
  const vw = stage.clientWidth, vh = stage.clientHeight;
  const portrait = vw / vh < .9;
  const Wb = portrait ? Math.min(vw * .8, vh * .5 * BW / BH) : Math.min(vw * .34, vh * .64 * BW / BH);
  const S0 = Wb / BW;

  /* стена */
  let H, floorY, Wm, left, top;
  if (portrait) { H = vh; floorY = vh * .775; Wm = H * 1199 / 1312; left = vw / 2 - .62 * Wm; top = 0; }
  else { H = vh / .72; floorY = vh * .925; Wm = H * 1199 / 1312; left = vw / 2 - .5 * Wm; top = floorY - .775 * H; }
  const Yb = floorY + vh * (portrait ? .035 : .025);
  wall.style.width = Wm + 'px'; wall.style.height = H + 'px';
  wall.style.left = left + 'px'; wall.style.top = top + 'px';
  wall.style.transformOrigin = `${vw / 2 - left}px ${Yb - top}px`;
  const m = Wm < vw ? 'linear-gradient(90deg,transparent,#000 17%,#000 83%,transparent)' : 'none';
  wall.style.webkitMaskImage = wall.style.maskImage = m;

  /* камера */
  const Z1 = Math.min(vw / (S0 * 560), vh / (S0 * 620), 1.25 / S0);
  const F1 = [430, 760];
  const f0 = [BW / 2, BH / 2], s0 = [vw / 2, Yb - S0 * BH / 2];
  const s1 = [vw / 2, vh * (portrait ? .52 : .5)];

  /* обратный отсчёт над будкой */
  const cs = portrait ? Math.min(vw * .3, 130) : Math.min(vh * .2, 170);
  const boothTop = Yb - S0 * BH;
  count.style.setProperty('--cs', cs + 'px');
  count.style.setProperty('--cy', Math.max(vh * .06, boothTop - cs * 1.05));

  /* финальная полоска на экране */
  const sw = portrait ? vw * .94 : Math.min(vw * .42, vh * .6);
  const sc = sw / STRIP.w;
  const M4 = Math.max(1, Math.min(.92 * vw / (553 * sc), .84 * vh / (365 * sc)));

  G = { vw, vh, portrait, S0, Yb, Z1, F1, f0, s0, s1, sc, M4 };
  readScroll();
  if (reduced) render(.992);
}

/* ═══════════ прокрутка ═══════════ */
let target = 0, cur = 0, inView = true;
function readScroll() {
  const r = cinema.getBoundingClientRect();
  const total = Math.max(1, cinema.offsetHeight - stage.clientHeight);
  target = clamp(-r.top / total);
  inView = r.bottom > -50 && r.top < innerHeight + 50;
}

/* ═══════════ кадр сцены ═══════════ */
const FL = [.12, .20, .28];          // моменты вспышек
const NUMS = [[.055, .114, '3'], [.135, .194, '2'], [.215, .274, '1']];
const shake = { x: 0, y: 0 }, flick = { v: 1 };
const fadeEls = [booth, rod, cloth, armClip];

function render(p) {
  const g = G; if (!g.vw) return;
  const { vw, vh, S0, Z1, F1, f0, s0, s1, sc, M4 } = g;

  /* вспышки */
  const pl = Math.max(pulse(p, FL[0], .03), pulse(p, FL[1], .03), pulse(p, FL[2], .03));

  /* камера: медленный наезд, потом плотный наезд на дверь */
  const zA = 1 + .1 * ease(seg(p, .05, .30));
  const kc = ease(seg(p, .33, .46));
  const Z = zA * Math.pow(Z1 / zA, kc), S = S0 * Z;
  let tx = lerp(s0[0], s1[0], kc) - S * lerp(f0[0], F1[0], kc);
  let ty = lerp(s0[1], s1[1], kc) - S * lerp(f0[1], F1[1], kc);
  tx += shake.x * pl; ty += shake.y * pl;
  world.style.transform = `translate(${tx.toFixed(2)}px,${ty.toFixed(2)}px) scale(${S.toFixed(4)})`;
  wall.style.transform = `scale(${(1 + .2 * clamp(Math.log(Z) / Math.log(Z1))).toFixed(4)})`;

  /* шторка и свет */
  const oc = ease(seg(p, .36, .45));
  const fo = ease(seg(p, .64, .71));           // всё лишнее уходит в тень
  cloth.style.transform = `scaleX(${(1 - .84 * oc).toFixed(3)})`;
  const lit = pl * (1 - oc);
  cloth.style.filter = lit > .01 ? `brightness(${(1 + 1.7 * lit).toFixed(2)}) saturate(${(1 - .45 * lit).toFixed(2)})` : 'none';
  flashGlow.style.opacity = (lit * .95 * (1 - fo)).toFixed(3);
  cabinGlow.style.opacity = (oc * .9 * (1 - fo)).toFixed(3);
  signGlow.style.opacity = ((.2 + .15 * flick.v + .75 * pl) * (1 - fo)).toFixed(3);
  fadeEls.forEach(el => { el.style.opacity = (1 - fo).toFixed(3); });
  booth.style.visibility = fo >= 1 ? 'hidden' : 'visible';
  dim.style.opacity = (.82 * fo).toFixed(3);

  /* вспышка на весь экран */
  flash.style.opacity = (pl * .9).toFixed(3);
  if (pl > .01) {
    flash.style.setProperty('--fx', ((tx + S * 620) / vw * 100).toFixed(1) + '%');
    flash.style.setProperty('--fy', ((ty + S * 800) / vh * 100).toFixed(1) + '%');
  }
  lamp.style.opacity = (.7 + .3 * flick.v + .8 * pl).toFixed(3);

  /* отсчёт и подписи */
  let num = '', no = 0;
  NUMS.forEach(([a, b, t]) => {
    if (p >= a && p <= b) {
      const u = (p - a) / (b - a);
      num = t; no = seg(u, 0, .15) * (1 - seg(u, .8, 1));
      count.style.transform = `scale(${(1.25 - .25 * easeOut(seg(u, 0, .35))).toFixed(3)})`;
    }
  });
  if (num) countNum.textContent = num;
  count.style.opacity = no.toFixed(3);

  let cap = '', co = 0;
  if (p > .06 && p < .31) { cap = 'Смотрите в камеру'; co = seg(p, .06, .09) * (1 - seg(p, .29, .31)); }
  else if (p > .47 && p < .62) { cap = 'Ваши кадры готовы'; co = seg(p, .47, .5) * (1 - seg(p, .59, .62)); }
  else if (p > .975) { cap = 'Листайте дальше'; co = seg(p, .975, .995); }
  if (cap && caption.textContent !== cap) caption.textContent = cap;
  caption.style.opacity = co.toFixed(3);

  /* рука */
  const sl = ease(seg(p, .45, .55)), ar = ease(seg(p, .60, .67));
  const slide = X0 * (1 - sl + ar);
  arm.style.transform = `translateX(${slide.toFixed(1)}px)`;
  armClip.style.visibility = slide >= X0 - 1 || fo >= 1 ? 'hidden' : 'visible';

  /* полоска: в руке → летит к зрителю → листается */
  const held = STRIP.held;
  const rel = ease(seg(p, .58, .60));
  const hpx = P[0] + 3 + slide, hpy = P[1] - 6 + rel * 34;
  const sway = 3.2 * Math.sin((p - .45) * 150) * (1 - seg(p, .50, .585)) * seg(p, .45, .47);
  const t = seg(p, .595, .69), e = ease(t);

  const pan1 = ease(seg(p, .75, .78)), pan2 = ease(seg(p, .83, .86)), pan3 = ease(seg(p, .91, .945));
  const yc = WIN_C[0] + (WIN_C[1] - WIN_C[0]) * pan1 + (WIN_C[2] - WIN_C[1]) * pan2 + (WIN_C[3] - WIN_C[2]) * pan3;
  const m = 1 + (M4 - 1) * pan3;
  const Ys = vh * .5 - yc * sc * m;
  const fpx = (vw / 2 - tx) / S, fpy = (Ys - ty) / S, fk = sc * m / S;

  const arc = Math.sin(Math.PI * t) * vh * .06 / S;
  const px = lerp(hpx, fpx, e), py = lerp(hpy, fpy, e) - arc;
  const k = held * Math.pow(fk / held, e);
  const rot = sway * (1 - e);
  strip.style.transform = `translate(${(px - STRIP.w / 2).toFixed(2)}px,${py.toFixed(2)}px) rotate(${rot.toFixed(2)}deg) scale(${k.toFixed(4)})`;
  strip.style.zIndex = p < .585 ? 3 : 9;
  strip.style.visibility = (e > 0 || (p > .44 && hpx < 745)) ? 'visible' : 'hidden';

  /* проявка снимков и приглашение */
  const D = [ease(seg(p, .70, .75)), ease(seg(p, .78, .83)), ease(seg(p, .86, .91)), ease(seg(p, .90, .93))];
  wins.forEach((w, i) => w.style.setProperty('--d', D[i].toFixed(3)));
  invParts.forEach(({ el, a, b }) => {
    const u = easeOut(seg(p, a, b));
    el.style.opacity = u.toFixed(3);
    el.style.transform = `translateY(${((1 - u) * 14).toFixed(1)}px)`;
    el.style.filter = u < 1 ? `blur(${((1 - u) * 7).toFixed(1)}px)` : 'none';
  });

  /* прочее */
  hint.style.opacity = (1 - seg(p, .012, .04)).toFixed(3);
  skip.style.opacity = (1 - seg(p, .93, .97)).toFixed(3);
  skip.style.pointerEvents = p > .95 ? 'none' : 'auto';
  dust.style.opacity = (.16 + .2 * pl).toFixed(3);
}

/* ═══════════ цикл ═══════════ */
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let last = performance.now(), lastJ = 0;

function frame(now) {
  last = now;
  cur += (target - cur) * .16;
  if (Math.abs(target - cur) < 1e-5) cur = target;
  if (inView) {
    if (now - lastJ > 80) {              // дрожание и пыль ~12 раз в секунду
      lastJ = now;
      flick.v = Math.random();
      shake.x = (Math.random() - .5) * 8; shake.y = (Math.random() - .5) * 8;
      const j = () => ((Math.random() - .5) * 4).toFixed(2);
      dust.style.transform = `translate(${j()}%,${j()}%) scaleX(${Math.random() < .5 ? -1 : 1})`;
    }
    render(cur);
  }
  requestAnimationFrame(frame);
}

addEventListener('scroll', readScroll, { passive: true });
addEventListener('resize', layout);
addEventListener('load', layout);
if (reduced) document.body.classList.add('reduced');
layout();
if (!reduced) requestAnimationFrame(frame);

skip.addEventListener('click', () => {
  scrollTo({ top: cinema.offsetTop + cinema.offsetHeight, behavior: reduced ? 'auto' : 'smooth' });
});

/* ═══════════ обычная часть сайта ═══════════ */
const io = new IntersectionObserver(es => es.forEach(e => {
  if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}), { threshold: .12 });
$$('.reveal').forEach(el => io.observe(el));

})();
