async function sendToDiscord(webhookUrl, image, filename, redeemerName, settings) {
  if (!settings.enabled || !webhookUrl) return { skipped: true, attachmentUrl: '' };

  const content = String(settings.message || '').replaceAll('{redeemer}', redeemerName).slice(0, 2000);
  const form = new FormData();
  form.append('payload_json', JSON.stringify({
    content,
    username: settings.username || 'Stream Polaroid Booth',
    allowed_mentions: { parse: [] },
    attachments: [{ id: 0, filename, description: `Polaroid taken by ${redeemerName}` }],
  }));
  form.append('files[0]', new Blob([image], { type: 'image/jpeg' }), filename);

  let response;
  try {
    const deliveryUrl = new URL(webhookUrl);
    deliveryUrl.searchParams.set('wait', 'true');
    response = await fetch(deliveryUrl, { method: 'POST', body: form });
  } catch (error) {
    const cause = error.cause?.message || error.cause?.code || '';
    throw new Error(`Could not reach Discord${cause ? ` (${cause})` : ''}`);
  }
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Discord webhook returned ${response.status}: ${body.slice(0, 300)}`);
  }
  const message = await response.json();
  return { skipped: false, attachmentUrl: String(message.attachments?.[0]?.url || '') };
}

module.exports = { sendToDiscord };
