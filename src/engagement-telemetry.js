const crypto = require('node:crypto');
const {
  addEngagementEvent,
  addViewerSnapshot,
  closeStreamSession,
  openStreamSession,
} = require('./db');

const STREAMERBOT_TELEMETRY_SUBSCRIPTIONS = {
  Twitch: [
    'StreamOnline', 'StreamOffline', 'StreamUpdate', 'ViewerCountUpdate',
    'Follow', 'Sub', 'ReSub', 'GiftSub', 'GiftBomb', 'Raid',
  ],
  YouTube: [
    'BroadcastStarted', 'BroadcastEnded', 'StatisticsUpdated',
    'NewSubscriber', 'NewSponsor', 'MembershipGift',
  ],
};

class EngagementTelemetry {
  constructor({ store = { addEngagementEvent, addViewerSnapshot, closeStreamSession, openStreamSession } } = {}) {
    this.store = store;
    this.currentSessions = new Map();
    this.obsStreaming = null;
  }

  handleStreamerBot(payload) {
    const platform = String(payload?.event?.source || '').toLowerCase();
    const type = String(payload?.event?.type || '').toLowerCase();
    const data = payload?.data || {};
    const timestamp = validTimestamp(payload?.timeStamp) || validTimestamp(data.createdAt) || new Date().toISOString();

    if (platform === 'twitch') {
      if (type === 'streamonline') return this.startSession('twitch', {
        timestamp: validTimestamp(data.startedAt) || timestamp,
        externalId: data.id,
        title: data.status,
        category: data.game?.name || data.game?.Name,
        source: 'streamerbot',
        metadata: { tags: data.tags || [], isTest: Boolean(data.isTest) },
      });
      if (type === 'streamoffline') return this.stopSession('twitch', validTimestamp(data.endedAt) || timestamp, 'streamerbot');
      if (type === 'viewercountupdate') return this.viewerSnapshot('twitch', timestamp, firstNumber(data.viewerCount), null, 'streamerbot');
      if (type === 'streamupdate') return this.record('stream', 'stream_updated', 'twitch', timestamp, {
        title: data.status,
        category: data.game?.name || data.game?.Name,
        oldTitle: data.oldStatus,
        oldCategory: data.oldGame?.name || data.oldGame?.Name,
      });
      if (type === 'follow') return this.viewerOutcome('follow', 'twitch', timestamp, data.targetUser || data.user, data);
      if (['sub', 'resub', 'giftsub', 'giftbomb'].includes(type)) return this.viewerOutcome('subscription', 'twitch', timestamp, data.user || data.recipient || data.gifter, { ...data, subtype: type });
      if (type === 'raid') return this.viewerOutcome('raid_received', 'twitch', timestamp, data.user || data.raider || data.fromBroadcaster, data);
    }

    if (platform === 'youtube') {
      if (type === 'broadcaststarted') {
        const broadcast = data.broadcast || data;
        return this.startSession('youtube', {
          timestamp: validTimestamp(broadcast.actualStartTime) || timestamp,
          externalId: broadcast.id,
          title: broadcast.title,
          category: broadcast.categoryId,
          source: 'streamerbot',
          metadata: { liveChatId: broadcast.liveChatId, privacy: broadcast.privacy },
        });
      }
      if (type === 'broadcastended') {
        const broadcast = data.broadcast || data;
        return this.stopSession('youtube', validTimestamp(broadcast.actualEndTime) || timestamp, 'streamerbot');
      }
      if (type === 'statisticsupdated') {
        return this.viewerSnapshot('youtube', timestamp, firstNumber(
          data.viewerCount, data.concurrentViewers, data.viewers,
          data.statistics?.viewerCount, data.statistics?.concurrentViewers,
          data.broadcast?.viewerCount, data.broadcast?.concurrentViewers,
        ), firstNumber(data.totalViewers, data.statistics?.viewCount, data.viewCount), 'streamerbot');
      }
      if (type === 'newsubscriber') return this.viewerOutcome('follow', 'youtube', timestamp, data.user || data.subscriber, data);
      if (['newsponsor', 'membershipgift'].includes(type)) return this.viewerOutcome('subscription', 'youtube', timestamp, data.user || data.sponsor || data.recipient, { ...data, subtype: type });
    }
    return null;
  }

  handleTikfinity(envelope) {
    const type = String(envelope?.event || envelope?.data?.type || '').toLowerCase();
    const data = envelope?.data || {};
    const timestamp = timestampFromMilliseconds(data.createTime || data.timestamp || data.timestampMs) || new Date().toISOString();
    if (['roomuser', 'roomuserseq', 'viewer_count'].includes(type)) {
      return this.viewerSnapshot('tiktok', timestamp, firstNumber(data.viewerCount, data.userCount), firstNumber(data.totalViewers, data.totalUser), 'tikfinity');
    }
    if (type === 'follow' || (type === 'social' && String(data.action || '').toLowerCase().includes('follow'))) {
      return this.viewerOutcome('follow', 'tiktok', timestamp, data.user, data);
    }
    if (type === 'subscribe') return this.viewerOutcome('subscription', 'tiktok', timestamp, data.user, data);
    if (type === 'share' || (type === 'social' && String(data.action || '').toLowerCase().includes('share'))) {
      return this.viewerOutcome('share', 'tiktok', timestamp, data.user, data);
    }
    return null;
  }

  handleObsStreamState(data = {}, { snapshot = false } = {}) {
    const active = Boolean(data.outputActive);
    if (this.obsStreaming === active) return null;
    if (this.obsStreaming === null && !active) {
      this.obsStreaming = false;
      return null;
    }
    this.obsStreaming = active;
    const timestamp = new Date().toISOString();
    if (active) return this.startSession('obs', {
      timestamp,
      externalId: null,
      source: snapshot ? 'obs-status' : 'obs-event',
      metadata: { outputState: data.outputState || '', detectedAfterConnect: snapshot },
    });
    return this.stopSession('obs', timestamp, snapshot ? 'obs-status' : 'obs-event');
  }

  startSession(platform, details) {
    const sessionId = `${platform}:${details.externalId || crypto.randomUUID()}`;
    this.currentSessions.set(platform, sessionId);
    this.store.openStreamSession({ id: sessionId, platform, ...details, startedAt: details.timestamp });
    this.store.addEngagementEvent({
      timestamp: details.timestamp,
      tool: 'stream',
      eventType: 'stream_started',
      platform,
      sessionId,
      correlationId: sessionId,
      metadata: { title: details.title || '', category: details.category || '', source: details.source, ...(details.metadata || {}) },
    });
    return sessionId;
  }

  stopSession(platform, timestamp, source) {
    const knownId = this.currentSessions.get(platform);
    const sessionId = this.store.closeStreamSession({ id: knownId, platform, endedAt: timestamp, metadata: { endSource: source } });
    this.currentSessions.delete(platform);
    this.store.addEngagementEvent({
      timestamp,
      tool: 'stream',
      eventType: 'stream_stopped',
      platform,
      sessionId,
      correlationId: sessionId,
      metadata: { source },
    });
    return sessionId;
  }

  viewerSnapshot(platform, timestamp, viewerCount, totalViewers, source) {
    if (!Number.isFinite(viewerCount)) return null;
    return this.store.addViewerSnapshot({
      timestamp,
      platform,
      sessionId: this.currentSessions.get(platform),
      viewerCount,
      totalViewers,
      source,
    });
  }

  viewerOutcome(eventType, platform, timestamp, user, data) {
    const normalizedUser = extractUser(user, data);
    return this.store.addEngagementEvent({
      timestamp,
      tool: 'stream',
      eventType,
      platform,
      userId: normalizedUser.id,
      username: normalizedUser.username,
      roles: normalizedUser.roles,
      sessionId: this.currentSessions.get(platform),
      metadata: sanitizeOutcomeMetadata(eventType, data),
    });
  }

  record(tool, eventType, platform, timestamp, metadata) {
    return this.store.addEngagementEvent({ tool, eventType, platform, timestamp, sessionId: this.currentSessions.get(platform), metadata });
  }
}

function extractUser(user = {}, data = {}) {
  const badges = Array.isArray(user?.badges) ? user.badges.map((badge) => String(badge?.name || badge?.id || '').toLowerCase()) : [];
  const roles = [];
  if (badges.includes('broadcaster') || user?.isBroadcaster) roles.push('broadcaster');
  if (badges.includes('moderator') || badges.includes('mod') || user?.isModerator) roles.push('moderator');
  if (badges.includes('vip') || user?.isVip || user?.isVIP) roles.push('vip');
  if (badges.includes('subscriber') || user?.subscribed || user?.isSubscriber) roles.push('subscriber');
  if (user?.isMember || user?.isSponsor) roles.push('member');
  return {
    id: firstText(user?.id, user?.userId, user?.channelId, data.userId, data.user_id, data.channelId),
    username: firstText(user?.login, user?.name, user?.displayName, user?.uniqueId, data.userName, data.user_name, data.displayName),
    roles,
  };
}

function sanitizeOutcomeMetadata(eventType, data) {
  if (eventType === 'raid_received') return { viewerCount: firstNumber(data.viewerCount, data.viewers), subtype: data.subtype || '' };
  if (eventType === 'subscription') return { subtype: data.subtype || '', tier: data.subTier || data.tier || '', months: firstNumber(data.durationMonths, data.months) || null };
  return { subtype: data.subtype || data.action || '' };
}

function firstNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return NaN;
}

function firstText(...values) {
  const found = values.find((value) => value !== undefined && value !== null && String(value).trim());
  return found === undefined ? '' : String(found).trim();
}

function validTimestamp(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function timestampFromMilliseconds(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  const milliseconds = number < 100000000000 ? number * 1000 : number;
  return validTimestamp(milliseconds);
}

const engagementTelemetry = new EngagementTelemetry();

module.exports = {
  EngagementTelemetry,
  STREAMERBOT_TELEMETRY_SUBSCRIPTIONS,
  engagementTelemetry,
};
