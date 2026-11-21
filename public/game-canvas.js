/* Both broadcast overlays use the same logical canvas, including admin previews. */
(() => {
  document.querySelectorAll('[data-game-canvas]').forEach(canvas => {
    const viewport = canvas.parentElement;
    const fit = () => {
      if (!canvas.offsetWidth || !canvas.offsetHeight) return;
      const scale = Math.min(viewport.clientWidth / canvas.offsetWidth, viewport.clientHeight / canvas.offsetHeight);
      canvas.style.transform = `translate(-50%, -50%) scale(${scale})`;
    };
    new ResizeObserver(fit).observe(viewport);
    fit();
  });
})();
