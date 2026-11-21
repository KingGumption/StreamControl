(async function () {
  const banner = document.createElement('p');
  banner.setAttribute('role','status');
  banner.style.cssText='padding:12px;border:1px solid #4ecdc4;border-radius:8px;margin:12px 0';
  (document.querySelector('main') || document.body).prepend(banner);
  let previous = '';
  function setReadOnly(readOnly) {
    document.querySelectorAll('button,input,select,textarea,fieldset').forEach(control => {
      if (control.closest('.eng-shell, [data-overlay-setup], form[action="/admin/logout"]') || control.readOnly) return;
      control.inert = readOnly;
      if (readOnly) control.setAttribute('aria-disabled','true');
      else control.removeAttribute('aria-disabled');
      if (control.matches('input,select,textarea')) control.disabled = readOnly;
    });
  }
  const moderator = document.body.hasAttribute('data-sections');
  if (moderator) setReadOnly(true);
  async function refresh() {
    try {
      const response = await fetch('/admin/games/session',{cache:'no-store'});
      if (response.status===401) { location.assign('/admin/login?returnTo='+encodeURIComponent(location.pathname+location.search)); return; }
      if (!response.ok) throw Error('Game access unavailable');
      const {user,handoff} = await response.json();
      const signature = JSON.stringify([user,handoff]);
      if (signature === previous) return;
      previous = signature;
      document.querySelectorAll('[data-overlay-setup]').forEach(el=>{el.hidden=user.role!=='owner';});
      if (user.role === 'games') {
        banner.textContent = handoff.enabled ? `Signed in as ${user.username}. Game controls enabled.` : `Signed in as ${user.username}. Moderator game controls are disabled.`;
        setReadOnly(!handoff.enabled);
      } else {
        banner.replaceChildren(document.createTextNode(handoff.enabled ? 'Moderator game control is enabled. ' : 'You have control. Moderator game controls are off. '));
        const link = document.createElement('a'); link.href='/admin/moderators'; link.textContent='Manage moderators'; banner.append(link);
      }
    } catch { previous=''; if (moderator) setReadOnly(true); banner.textContent = 'Unable to check game access. Reconnecting…'; }
  }
  await refresh(); setInterval(refresh,5000);
})();
