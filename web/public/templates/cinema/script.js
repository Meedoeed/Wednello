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

/* ═══════════ элементы сцены ═══════════ */
const cinema = byId('cinema'), stage = byId('stage');
const hall = byId('hall'), hallDim = byId('hallDim'), cast = byId('cast');
const screen = byId('screen'), sInner = byId('sInner'), sweep = byId('sweep');
const count = byId('count'), countNum = byId('countNum'), leader = $('.leader');
const slides = $$('.slide'), invite = byId('invite'), sDim = byId('sDim'), sScratch = byId('sScratch');
const fore = byId('fore'), proj = byId('proj'), table = byId('table');
const reelA = $('#reelA img'), reelB = $('#reelB img');
const lampGlow = byId('lampGlow'), ventGlow = byId('ventGlow');
const beam = byId('beam'), tickets = $$('.ticket'), ticketsBox = byId('tickets');
const hint = byId('hint'), skip = byId('skip'), dust = byId('dust');

const inviteParts = [
  ['.i-kick', .800, .822], ['.i-title', .812, .852], ['.i-orn', .842, .866],
  ['.i-names', .852, .877], ['.i-date', .868, .892]
].map(([sel, a, b]) => ({ el: $(sel, invite), a, b }));

/* экран в картинке зала (доли изображения) */
const SCR = { x: .79, y: .343, w: .314, h: .372 };

/* ═══════════ раскладка ═══════════ */
let G = {};
function layout() {
  const vw = stage.clientWidth, vh = stage.clientHeight;
  const portrait = vw / vh < .9;
  const W = Math.max(vw, vh * 16 / 9), H = W * 9 / 16;
  const s0 = Math.min(1, (portrait ? .86 : .92) * vw / (SCR.w * W));

  /* проектор. На телефоне он крупнее и стоит посередине кадра, луч идёт строго вправо */
  const Wp = portrait ? Math.min(vw * .9, vh * .54) : Math.min(vw * .46, vh * .88);
  const hp = Wp * 1086 / 1448;
  const pLeft = vw * (portrait ? .05 : .03);
  let tableH, pBottom;
  if (portrait) { pBottom = vh * .44 - hp / 2; tableH = pBottom + hp * .03; }
  else { tableH = vh * .09; pBottom = tableH * .5; }
  table.style.height = tableH + 'px';
  proj.style.width = Wp + 'px'; proj.style.left = pLeft + 'px'; proj.style.bottom = pBottom + 'px';
  const lensX = pLeft + Wp * .948;
  const lensY = vh - pBottom - hp + hp * .422;

  /* зал: на телефоне экран стоит справа за краем кадра на высоте объектива */
  let cx = vw / 2, cy = vh / 2, panDist = 0;
  if (portrait) {
    const x0 = lensX + vw * .75;
    panDist = x0 - vw / 2;
    cx = x0 - (SCR.x - .5) * W * s0;
    cy = lensY - (SCR.y - .5) * H * s0;
  }
  hall.style.width = W + 'px'; hall.style.height = H + 'px';
  hall.style.left = (cx - W / 2) + 'px'; hall.style.top = (cy - H / 2) + 'px';

  let endW, endH, ex = vw / 2, ey = vh / 2;
  if (portrait) { endW = vw * .94; endH = Math.min(vh * .72, endW * 1.45); ey = vh * .48; }
  else { endW = Math.min(vw * .92, vh * .86 * 1.5); endH = endW / 1.5; }
  const s1 = endW / (SCR.w * W);

  const tw = Math.min(vw * (portrait ? .94 : .64), vh * .72);
  ticketsBox.style.setProperty('--tw', tw + 'px');

  G = { vw, vh, W, H, s0, s1, cx, cy, ex, ey, endW, endH, lensX, lensY, portrait, panDist,
        tH: tw / 2.409 };
  readScroll();
  if (reduced) render(1);
}

/* ═══════════ прокрутка ═══════════ */
let target = 0, cur = 0, inView = true;
function readScroll() {
  const r = cinema.getBoundingClientRect();
  const total = Math.max(1, cinema.offsetHeight - stage.clientHeight);
  target = clamp(-r.top / total);
  inView = r.bottom > -50 && r.top < innerHeight + 50;
}

/* ═══════════ один кадр сцены по прогрессу p (0…1) ═══════════ */
let flk = 1;
const weave = { x: 0, y: 0 };

function render(p) {
  const { vw, vh, W, H, s0, s1, cx, cy, ex, ey, endW, endH, lensX, lensY, tH, portrait, panDist } = G;
  if (!vw) return;

  const lamp = ease(seg(p, .03, portrait ? .09 : .10));              // лампа разгорается
  const pan  = portrait ? ease(seg(p, .10, .22)) : 0;                // телефон: камера едет по лучу вправо
  const lit  = ease(portrait ? seg(p, .15, .22) : seg(p, .09, .15)); // экран загорается
  const k    = ease(portrait ? seg(p, .22, .29) : seg(p, .13, .28)); // наезд камеры на экран
  const out  = portrait ? 0 : ease(seg(p, .16, .26));                // компьютер: проектор уходит вниз
  const shiftX = -panDist * pan;

  /* зал */
  const s = lerp(s0, s1, k);
  const psx = cx + shiftX + s * (SCR.x - .5) * W, psy = cy + s * (SCR.y - .5) * H;
  const tx = k * (ex - psx), ty = k * (ey - psy);
  hall.style.transform = `translate(${tx}px,${ty}px) scale(${s})`;
  const pcx = psx + tx, pcy = psy + ty;
  hallDim.style.opacity = ((1 - lit) * .3 + seg(p, portrait ? .24 : .2, portrait ? .32 : .3) * .62).toFixed(3);
  cast.style.opacity = (lit * .65 * (1 - k * .6) * flk).toFixed(3);

  /* экран */
  const sw = lerp(SCR.w * W * s, endW, k) * 1.01, sh = lerp(SCR.h * H * s, endH, k) * 1.01;
  screen.style.width = sw + 'px'; screen.style.height = sh + 'px';
  screen.style.left = (pcx - sw / 2) + 'px'; screen.style.top = (pcy - sh / 2) + 'px';
  screen.style.opacity = (lit * (.94 + .06 * flk)).toFixed(3);
  const sc = Math.max(sw / 1448, sh / 1086);
  sInner.style.setProperty('--cd', (715 * sc).toFixed(1) + 'px');

  /* проектор, свет, луч */
  fore.style.opacity = (1 - out).toFixed(3);
  fore.style.transform = portrait ? `translateX(${shiftX.toFixed(1)}px)` : `translateY(${(out * 9).toFixed(2)}%)`;
  fore.style.visibility = (portrait ? pan >= 1 : out >= 1) ? 'hidden' : 'visible';
  lampGlow.style.opacity = (lamp * flk).toFixed(3);
  ventGlow.style.opacity = (lamp * .55 * flk).toFixed(3);

  const bi = lamp * (1 - (portrait ? seg(p, .26, .31) : seg(p, .15, .25))) * flk;
  const lx = lensX + shiftX;
  const dx = pcx - lx, dy = pcy - lensY;
  const len = Math.hypot(dx, dy) * 1.2;
  const bh = portrait ? Math.max(len * .46, sh * 1.25) : len * .46;
  beam.style.width = len + 'px'; beam.style.height = bh + 'px';
  beam.style.transform = `translate(${lx}px,${lensY - bh * .487}px) rotate(${Math.atan2(dy, dx)}rad)`;
  beam.style.opacity = bi.toFixed(3);
  beam.style.visibility = bi <= .001 ? 'hidden' : 'visible';

  /* отсчёт 5…1 */
  const c = seg(p, .27, .39);
  const step = Math.min(4, Math.floor(c * 5));
  const frac = c >= 1 ? 1 : c * 5 - step;
  countNum.textContent = 5 - step;
  sweep.style.setProperty('--a', (frac * 360).toFixed(1) + 'deg');
  count.style.setProperty('--sc', (1 + .14 * (1 - easeOut(clamp(frac * 2.5)))).toFixed(3));
  const leaderOp = 1 - seg(p, .385, .41);
  const countOp = seg(p, .255, .28) * (1 - seg(p, .382, .395));
  count.style.opacity = countOp.toFixed(3);
  sweep.style.opacity = countOp.toFixed(3);
  leader.style.opacity = leaderOp.toFixed(3);

  /* 5 кадров */
  slides.forEach((el, i) => {
    const t = (p - (.39 + .08 * i)) / .08;
    let op = 0;
    if (t > -.06 && t < 1.06) {
      op = seg(t, -.04, .14);
      op *= i < 4 ? 1 - seg(t, .9, 1.04) : 1 - seg(p, .775, .80);
    }
    el.style.opacity = (op * (.96 + .04 * flk)).toFixed(3);
    el.style.visibility = op <= .001 ? 'hidden' : 'visible';
    if (op > .001) {
      const tt = clamp(t), dir = i % 2 ? -1 : 1;
      $('.media', el).style.transform =
        `translate(${(weave.x + dir * (tt - .5) * 1.6).toFixed(2)}%,${(weave.y + (.5 - tt) * .6).toFixed(2)}%) scale(${(1 + .06 * tt).toFixed(4)})`;
      const cap = $('figcaption', el);
      const co = seg(t, .12, .28) * (1 - seg(t, .78, .9));
      cap.style.opacity = co.toFixed(3);
      cap.style.transform = `translateY(${((1 - seg(t, .12, .3)) * 5).toFixed(2)}cqh)`;
    }
  });

  /* «Приглашаем вас на нашу свадьбу» */
  const invOp = seg(p, .795, .812) * (1 - seg(p, .905, .935));
  invite.style.opacity = invOp.toFixed(3);
  invite.style.visibility = invOp <= .001 ? 'hidden' : 'visible';
  inviteParts.forEach(({ el, a, b }) => {
    const t = easeOut(seg(p, a, b));
    el.style.opacity = t.toFixed(3);
    el.style.transform = `translateY(${((1 - t) * 14).toFixed(1)}px)`;
    el.style.filter = t < 1 ? `blur(${((1 - t) * 7).toFixed(1)}px)` : 'none';
  });
  sDim.style.opacity = (seg(p, .9, .94) * .82).toFixed(3);

  /* билеты */
  const fin = [{ r: -3.2, x: -.02 }, { r: 1.8, x: .018 }, { r: -1.2, x: -.006 }];
  tickets.forEach((el, i) => {
    const a = .905 + .028 * i;
    const t = easeOut(seg(p, a, a + .05));
    const fy = (i - 1) * tH * .97;
    const y = lerp(vh * .85 + tH, fy, t);
    const rot = lerp(i % 2 ? 14 : -14, fin[i].r, t);
    el.style.opacity = seg(t, 0, .25).toFixed(3);
    el.style.transform = `translate(-50%,-50%) translate(${(fin[i].x * vw).toFixed(1)}px,${y.toFixed(1)}px) rotate(${rot.toFixed(2)}deg)`;
  });

  /* прочее */
  hint.style.opacity = (1 - seg(p, .005, .035)).toFixed(3);
  skip.style.opacity = (1 - seg(p, .93, .97)).toFixed(3);
  skip.style.pointerEvents = p > .95 ? 'none' : 'auto';
  dust.style.opacity = (.2 + .3 * lit).toFixed(3);
  sScratch.style.opacity = (.35 + .35 * lit).toFixed(3);
}

/* ═══════════ цикл ═══════════ */
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let last = performance.now(), lastJ = 0, reel = 0;

function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  const prev = cur;
  cur += (target - cur) * (1 - Math.pow(.0006, dt));
  if (Math.abs(target - cur) < 1e-5) cur = target;

  if (inView) {
    /* дрожание плёнки и пыль ~12 раз в секунду */
    if (now - lastJ > 80) {
      lastJ = now;
      flk = .9 + Math.random() * .1;
      weave.x = (Math.random() - .5) * .35; weave.y = (Math.random() - .5) * .35;
      const j = () => ((Math.random() - .5) * 4).toFixed(2);
      const f = Math.random() < .5 ? -1 : 1;
      dust.style.transform = `translate(${j()}%,${j()}%) scaleX(${f})`;
      sScratch.style.transform = `translate(${j()}%,${j()}%) scaleX(${-f})`;
    }
    /* бобины: крутятся, пока работает проектор, и ускоряются от прокрутки */
    const spin = seg(cur, .03, .09) * (1 - (G.portrait ? seg(cur, .15, .22) : seg(cur, .2, .26)));
    reel += dt * spin * 150 + Math.abs(cur - prev) * 2400 * spin;
    reelA.style.transform = `rotate(${(-reel).toFixed(2)}deg)`;
    reelB.style.transform = `rotate(${(-reel * 1.25).toFixed(2)}deg)`;
    render(cur);
  }
  requestAnimationFrame(frame);
}

addEventListener('scroll', readScroll, { passive: true });
addEventListener('resize', layout);
addEventListener('load', layout);
byId('projImg').addEventListener('load', layout);
if (reduced) document.body.classList.add('reduced');
layout();
if (!reduced) requestAnimationFrame(frame);

skip.addEventListener('click', () => {
  const y = cinema.offsetTop + cinema.offsetHeight;
  scrollTo({ top: y, behavior: reduced ? 'auto' : 'smooth' });
});

/* ═══════════ обычная часть сайта ═══════════ */

/* появление блоков */
const io = new IntersectionObserver(es => es.forEach(e => {
  if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}), { threshold: .12 });
$$('.reveal').forEach(el => io.observe(el));

})();
