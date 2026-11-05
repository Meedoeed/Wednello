/* Минимализм: фото на заставке проявляется в цвет и «отъезжает» при прокрутке */
(() => {
  const img = document.querySelector('.m-photo');
  if (!img || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let raf = 0;
  const upd = () => {
    raf = 0;
    const r = img.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, 1 - r.top / innerHeight));
    img.style.setProperty('--z', (1.12 - p * 0.12).toFixed(3));
    img.style.setProperty('--g', (1 - Math.min(1, p * 1.6)).toFixed(3));
  };
  addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(upd); }, { passive: true });
  addEventListener('resize', upd); upd();
})();
