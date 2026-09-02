function parseJson(value) {
  if (Buffer.isBuffer(value)) value = value.toString('utf8');
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeStreamerBotEvent(value) {
  const payload = parseJson(value);
  const source = String(payload?.event?.source || '').toLowerCase();
  const type = String(payload?.event?.type || '').toLowerCase();
  if (source === 'twitch' && type === 'chatmessage') {
    return normalizeTwitch(payload.data || {});
  }
  if (source === 'youtube' && type === 'message') {
    return normalizeYouTube(payload.data || {});
  }
  return null;
}

function normalizeTwitch(data) {
  if (data.meta?.isMe === true || data.meta?.internal === true) return null;
  const user = data.user || {};
  const broadcaster = data.broadcaster || {};
  const id = stringFirst(user.id, data.userId);
  const username = stringFirst(user.login, user.name, data.userLogin, data.userName);
  const text = messageText(data);
  const profileImageUrl = stringFirst(
    user.profileImageUrl,
    user.profileImageURL,
    user.avatarUrl,
    data.userProfileUrl,
    data.profileImageUrl,
  );
  if (!username || !text) return null;

  const badgeNames = new Set(
    (Array.isArray(user.badges) ? user.badges : [])
      .map((badge) => String(badge?.name || badge?.id || '').toLowerCase()),
  );
  const roles = [];
  if (
    badgeNames.has('broadcaster')
    || user.isBroadcaster === true
    || (id && String(broadcaster.id || '') === id)
  ) roles.push('broadcaster');
  if (badgeNames.has('moderator') || badgeNames.has('mod') || user.isModerator === true) roles.push('moderator');
  if (badgeNames.has('vip') || user.isVip === true || user.isVIP === true) roles.push('vip');
  if (badgeNames.has('subscriber') || user.subscribed === true || user.isSubscriber === true) roles.push('subscriber');
  // Twitch ChatMessage does not reliably include follower status, so it is not inferred.

  return chatEvent('twitch', id, username, roles, text, data.messageId, profileImageUrl);
}

function normalizeYouTube(data) {
  if (data.meta?.isMe === true || data.meta?.internal === true) return null;
  const user = data.user || data.author || {};
  const broadcaster = data.broadcaster || {};
  const id = stringFirst(user.id, user.userId, user.channelId, data.userId);
  const username = stringFirst(user.name, user.displayName, user.userName, data.userName, data.authorName);
  const text = messageText(data);
  const profileImageUrl = stringFirst(
    user.profileImageUrl,
    user.profileImageURL,
    user.imageUrl,
    user.avatarUrl,
    data.userProfileUrl,
    data.profileImageUrl,
  );
  if (!username || !text) return null;

  const roles = [];
  if (
    explicitTrue(data, user, ['isOwner', 'isBroadcaster'])
    || (id && String(broadcaster.id || broadcaster.userId || '') === id)
  ) roles.push('broadcaster');
  if (explicitTrue(data, user, ['isModerator'])) roles.push('moderator');
  if (explicitTrue(data, user, ['isMember', 'isSponsor', 'isChannelMember'])) roles.push('member');
  if (explicitTrue(data, user, ['isSubscriber'])) roles.push('subscriber');
  if (explicitTrue(data, user, ['isViewer'])) roles.push('viewer');

  return chatEvent('youtube', id, username, roles, text, data.messageId || data.id, profileImageUrl);
}

function normalizeTikfinityEvents(value) {
  const parsed = parseJson(value);
  const envelopes = Array.isArray(parsed) ? parsed : [parsed];
  return envelopes.map(normalizeTikfinityEnvelope).filter(Boolean);
}

function normalizeTikfinityEnvelope(envelope) {
  if (!envelope || String(envelope.event || '').toLowerCase() !== 'chat') return null;
  const data = envelope.data || {};
  const user = data.user || {};
  const id = stringFirst(user.userId, user.id, data.userId);
  const username = stringFirst(user.uniqueId, user.username, data.uniqueId, data.username, user.nickname, data.nickname);
  const text = stringFirst(data.comment, data.message, data.text);
  const profileImageUrl = stringFirst(
    user.profilePictureUrl,
    user.profileImageUrl,
    user.avatarUrl,
    data.profilePictureUrl,
    data.profilePicturUrl,
  );
  if (!username || !text) return null;

  const roles = [];
  if (explicitTrue(data, user, ['isHost', 'isBroadcaster'])) roles.push('broadcaster');
  if (explicitTrue(data, user, ['isModerator'])) roles.push('moderator');
  if (explicitTrue(data, user, ['isSubscriber'])) roles.push('subscriber');
  if (explicitTrue(data, user, ['isFanClubMember']) || Number(user.teamMemberLevel || data.teamMemberLevel) > 0) {
    roles.push('fan-club');
  }
  if (explicitTrue(data, user, ['isFollower'])) roles.push('follower');
  // followRole is intentionally not interpreted because its meaning is not
  // reliably documented for every TikFinity/TikTok event version.

  return chatEvent('tiktok', id, username, roles, text, data.msgId || data.messageId || data.id, profileImageUrl);
}

function chatEvent(platform, id, username, roles, text, messageId, profileImageUrl) {
  return {
    platform,
    messageId: messageId ? String(messageId) : '',
    text: String(text).trim(),
    user: {
      id: id || '',
      username: String(username).trim(),
      profileImageUrl: String(profileImageUrl || '').trim(),
      roles: [...new Set(roles)],
    },
  };
}

function explicitTrue(data, user, keys) {
  return keys.some((key) => data[key] === true || user[key] === true);
}

function messageText(data) {
  if (typeof data.text === 'string') return data.text;
  if (typeof data.message === 'string') return data.message;
  if (typeof data.message?.message === 'string') return data.message.message;
  if (typeof data.message?.text === 'string') return data.message.text;
  return '';
}

function stringFirst(...values) {
  const found = values.find((value) => value !== undefined && value !== null && String(value).trim());
  return found === undefined ? '' : String(found).trim();
}

module.exports = {
  normalizeStreamerBotEvent,
  normalizeTikfinityEvents,
};
