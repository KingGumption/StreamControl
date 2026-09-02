function firstText(...values) {
  const value = values.find((candidate) => typeof candidate === 'string' && candidate.trim());
  return value ? value.trim() : '';
}

function simplify(value) {
  return String(value || '').trim().toLocaleLowerCase();
}

function eventId(data) {
  return firstText(data?.redemption?.id, data?.redemptionId, data?.eventId, data?.messageId, data?.id);
}

function profileImageUrl(data) {
  return firstText(
    data?.user?.profileImageUrl,
    data?.user?.profileImageURL,
    data?.user?.avatarUrl,
    data?.user?.avatar,
    data?.profileImageUrl,
    data?.profileImageURL,
    data?.userProfileImageUrl,
    data?.targetUserProfileImageUrl,
    data?.targetUserProfileImageURL,
    data?.avatarUrl,
    data?.avatar,
  );
}

function redeemerName(data) {
  return firstText(
    data?.user?.displayName,
    data?.user?.display,
    data?.user?.userName,
    data?.user?.username,
    data?.user?.login,
    data?.user?.name,
    data?.userDisplayName,
    data?.displayName,
    data?.display_name,
    data?.userName,
    data?.user_name,
    data?.user_login,
    data?.username,
    typeof data?.user === 'string' ? data.user : '',
  );
}

function redeemerId(data) {
  return firstText(data?.user?.id, data?.user?.userId, data?.userId, data?.targetUserId);
}

function redeemerRoles(data) {
  const user = data?.user && typeof data.user === 'object' ? data.user : {};
  const badges = new Set((Array.isArray(user.badges) ? user.badges : []).map((badge) => simplify(badge?.name || badge?.id)));
  const roles = [];
  if (badges.has('broadcaster') || user.isBroadcaster === true) roles.push('broadcaster');
  if (badges.has('moderator') || badges.has('mod') || user.isModerator === true) roles.push('moderator');
  if (badges.has('vip') || user.isVip === true || user.isVIP === true) roles.push('vip');
  if (badges.has('subscriber') || user.subscribed === true || user.isSubscriber === true) roles.push('subscriber');
  return roles;
}

function parseStreamerBotMessage(raw, settings) {
  let message;
  try {
    message = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
  if (!message?.event || !message?.data) return null;

  const source = simplify(message.event.source);
  const type = simplify(message.event.type);
  const data = message.data || {};
  if (source === 'twitch' && type === 'rewardredemption') {
    const title = firstText(data?.reward?.title, data?.reward?.name, data?.rewardTitle, data?.rewardName, data?.title);
    const id = firstText(data?.reward?.id, data?.rewardId);
    const titleMatches = settings.rewardTitle && simplify(title) === simplify(settings.rewardTitle);
    const idMatches = settings.rewardId && id === settings.rewardId;
    if (!titleMatches && !idMatches) return null;
    const name = redeemerName(data);
    return name ? {
      redeemerName: name,
      profileImageUrl: profileImageUrl(data),
      userId: redeemerId(data),
      roles: redeemerRoles(data),
      eventId: eventId(data),
      source: 'Twitch',
    } : null;
  }

  if (source === 'custom' && type === 'event') {
    const name = firstText(data.eventName, data.name);
    if (simplify(name) !== simplify(settings.customEventName)) return null;
    const payload = data.args || data.data || data;
    const user = redeemerName(payload);
    return user ? {
      redeemerName: user,
      profileImageUrl: profileImageUrl(payload),
      userId: redeemerId(payload),
      roles: redeemerRoles(payload),
      eventId: eventId(payload),
      source: 'Custom',
    } : null;
  }
  return null;
}

function safeRedeemerName(value) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50);
}

function safeFilePart(value) {
  const cleaned = safeRedeemerName(value)
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return cleaned || 'viewer';
}

module.exports = { parseStreamerBotMessage, safeFilePart, safeRedeemerName };
