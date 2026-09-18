(async function () {
  const banner = document.createElement('p');
  banner.setAttribute('role','status');
  banner.style.cssText='padding:12px;border:1px solid #4ecdc4;border-radius:8px;margin:12px 0';
  (document.querySelector('main') || document.body).prepend(banner);
  let previous = '';
  async function refresh() {
    try {
      const response = await fetch('/admin/games/session',{cache:'no-store'});
      if (!response.ok) { location.assign('/admin/login'); return; }
      const {user,handoff} = await response.json();
      const signature = JSON.stringify([user,handoff]);
      if (signature === previous) return;
      previous = signature;
      if (user.role === 'games') {
        document.querySelectorAll('a[href^="/admin"]').forEach(link => {
          if (!['/admin/games','/admin/quiz','/admin/king-of-the-hill'].includes(link.getAttribute('href'))) link.hidden = true;
        });
        banner.textContent = handoff.enabled ? `Signed in as ${user.username}. Game control available until ${new Date(handoff.expiresAt).toLocaleTimeString()}.` : `Signed in as ${user.username}. Waiting for the owner to hand over game control.`;
        // Server permissions remain authoritative, including after expiry.
        document.querySelectorAll('button').forEach(button => {
          if (button.hasAttribute('data-admin-logout') || ['openOverlay','copyUrl'].includes(button.id)) return;
          button.inert = !handoff.enabled;
          if (!handoff.enabled) button.setAttribute('aria-disabled','true');
          else button.removeAttribute('aria-disabled');
        });
      } else {
        banner.replaceChildren(document.createTextNode(handoff.enabled ? 'Moderator game control is enabled. ' : 'You have control. Moderator handoff is off. '));
        const link = document.createElement('a'); link.href='/admin/moderators'; link.textContent='Manage moderators'; banner.append(link);
      }
    } catch { banner.textContent = 'Unable to check game access. Reconnecting…'; }
  }
  await refresh(); setInterval(refresh,5000);
})();
