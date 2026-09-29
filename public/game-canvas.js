/* Both broadcast overlays use the same logical canvas, including admin previews. */
(() => {
  document.querySelectorAll('[data-game-canvas]').forEach(canvas => {
    const viewport = canvas.parentElement;
    const fit = () => {
      const scale = Math.min(viewport.clientWidth / 1080, viewport.clientHeight / 640);
      canvas.style.transform = `translate(-50%, -50%) scale(${scale})`;
    };
    new ResizeObserver(fit).observe(viewport);
    fit();
  });
})();
