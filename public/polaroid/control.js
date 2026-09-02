const statusElement = document.querySelector('#status');
const form = document.querySelector('#test-form');
const submit = document.querySelector('#submit');
const result = document.querySelector('#result');
const latest = document.querySelector('#latest');
const overlayUrl = document.querySelector('#overlay-url');

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function card(label, value, tone = '') {
  return `<div class="status-card"><span>${escapeHtml(label)}</span><strong class="${tone}">${escapeHtml(value)}</strong></div>`;
}

async function updateStatus() {
  try {
    const response = await fetch('/admin/polaroid/status', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Status failed (${response.status})`);
    const status = await response.json();
    statusElement.innerHTML = [
      card('OBS', status.obsConnected ? 'Connected' : 'Waiting', status.obsConnected ? 'ok' : 'warn'),
      card('Streamer.bot', status.streamerBotConnected ? 'Connected' : 'Waiting', status.streamerBotConnected ? 'ok' : 'warn'),
      card('Discord', status.discordConfigured ? 'Configured' : 'Needs webhook', status.discordConfigured ? 'ok' : 'warn'),
      card('Twitch chat', status.twitchChatConfigured ? 'Enabled' : 'Not enabled', status.twitchChatConfigured ? 'ok' : 'warn'),
      card('Profile pictures', status.avatarResolverConfigured ? 'Enabled' : 'Needs helper action', status.avatarResolverConfigured ? 'ok' : 'warn'),
      card('Camera source', status.cameraSource),
      card('Reward', status.rewardTitle),
      card('Queue', `${status.queueLength}${status.processing ? ' (working)' : ''}`),
    ].join('');
    overlayUrl.textContent = status.overlayUrl;
    if (status.lastError) {
      result.dataset.serviceError = 'true';
      result.textContent = `Last error: ${status.lastError}`;
    } else if (result.dataset.serviceError === 'true') {
      delete result.dataset.serviceError;
      result.textContent = '';
    }
    if (status.lastCapture?.imageUrl && latest.hidden) {
      latest.src = status.lastCapture.imageUrl;
      latest.hidden = false;
    }
  } catch {
    statusElement.innerHTML = card('Service', 'Disconnected', 'bad');
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  submit.disabled = true;
  result.textContent = 'Capturing the OBS camera source…';
  try {
    const response = await fetch('/admin/polaroid/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ redeemerName: document.querySelector('#name').value }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    delete result.dataset.serviceError;
    result.textContent = `Done — Polaroid taken by ${data.redeemerName}.`;
    latest.src = `${data.imageUrl}?v=${Date.now()}`;
    latest.hidden = false;
  } catch (error) {
    result.dataset.serviceError = 'true';
    result.textContent = `Failed: ${error.message}`;
  } finally {
    submit.disabled = false;
    await updateStatus();
  }
});

updateStatus();
setInterval(updateStatus, 2000);
