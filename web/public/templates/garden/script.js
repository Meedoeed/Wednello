/* Сад: длина штрихов для анимации «рисования» ветвей */
(() => {
  document.querySelectorAll('.draw').forEach(p => { try { p.style.setProperty('--len', Math.ceil(p.getTotalLength() + 2)); } catch {} });
  requestAnimationFrame(() => setTimeout(() => document.querySelectorAll('.g-branch').forEach(b => b.classList.add('drawn')), 250));
})();
