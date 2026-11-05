/* Полночь: звёздное небо на canvas, падающие звёзды, восходящая луна и искры по касанию */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cv = document.querySelector('.n-sky'); if (!cv) return;
  const g = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1, stars = [], shoot = null, last = 0, scrollY0 = 0;
  const resize = () => {
    dpr = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(Math.min(420, (W * H) / 3200));
    stars = Array.from({ length: n }, () => ({ x: Math.random() * W, y: Math.random() * H * 1.6, r: Math.random() ** 3 * 1.6 + 0.3, a: Math.random() * 6.28, s: 0.6 + Math.random() * 1.8, d: 0.15 + Math.random() * 0.5, gold: Math.random() < 0.08 }));
  };
  const draw = t => {
    const dt = Math.min(64, t - last); last = t;
    g.clearRect(0, 0, W, H);
    for (const s of stars) {
      const y = ((s.y - scrollY0 * s.d) % (H * 1.6) + H * 1.6) % (H * 1.6);
      if (y > H + 4) continue;
      const tw = reduce ? 0.8 : 0.55 + 0.45 * Math.sin(s.a + t * 0.001 * s.s);
      g.globalAlpha = tw; g.fillStyle = s.gold ? '#f4dca6' : '#ffffff';
      g.beginPath(); g.arc(s.x, y, s.r, 0, 6.283); g.fill();
    }
    if (!reduce) {
      if (!shoot && Math.random() < dt / 5200) shoot = { x: Math.random() * W * 0.8 + W * 0.2, y: Math.random() * H * 0.4, l: 0, v: 0.9 + Math.random() * 0.6 };
      if (shoot) {
        shoot.l += dt * shoot.v;
        const x = shoot.x - shoot.l, y = shoot.y + shoot.l * 0.45;
        const grd = g.createLinearGradient(x, y, x + 120, y - 54);
        grd.addColorStop(0, 'rgba(255,240,210,.95)'); grd.addColorStop(1, 'rgba(255,240,210,0)');
        g.globalAlpha = Math.max(0, 1 - shoot.l / 700); g.strokeStyle = grd; g.lineWidth = 1.4;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + 120, y - 54); g.stroke();
        if (shoot.l > 700) shoot = null;
      }
    }
    g.globalAlpha = 1;
    if (!reduce) requestAnimationFrame(draw);
  };
  resize(); addEventListener('resize', resize);
  requestAnimationFrame(draw);

  const moon = document.querySelector('.n-moon-wrap');
  let raf = 0;
  addEventListener('scroll', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0; scrollY0 = scrollY;
      if (moon && !reduce) moon.style.setProperty('--rise', `${-Math.min(scrollY, innerHeight) * 0.35}px`);
      if (reduce) draw(performance.now());
    });
  }, { passive: true });

  if (!reduce) addEventListener('pointerdown', e => {
    if (e.target.closest('input,textarea,select,button,a,label')) return;
    for (let i = 0; i < 7; i++) {
      const s = document.createElement('i'); s.className = 'n-spark';
      const a = Math.random() * 6.28, d = 30 + Math.random() * 50;
      s.style.left = e.clientX + 'px'; s.style.top = e.clientY + 'px';
      s.style.setProperty('--dx', Math.cos(a) * d + 'px'); s.style.setProperty('--dy', Math.sin(a) * d + 'px');
      document.body.append(s); setTimeout(() => s.remove(), 1100);
    }
  });
})();
