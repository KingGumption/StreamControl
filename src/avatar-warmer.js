const { resolveTwitchAvatar } = require('./avatar-resolver');
const { downloadAvatarImage } = require('./avatar-images');

// Best-effort work with bounded concurrency, backlog and retry frequency.
class AvatarWarmer {
  constructor({ resolve = resolveTwitchAvatar, download = downloadAvatarImage, now = Date.now, concurrency = 2, maxQueue = 128 } = {}) {
    Object.assign(this, { resolve, download, now, concurrency, maxQueue });
    this.queue = [];
    this.active = 0;
    this.recent = new Map();
  }
  warm(event) {
    const platform = String(event?.platform || '').toLowerCase();
    const user = event?.user || {};
    if (!['twitch', 'youtube', 'tiktok'].includes(platform)) return;
    const login = String(user.username || '').trim().replace(/^@+/, '').toLowerCase();
    const url = String(user.profileImageUrl || '');
    if (!url && (platform !== 'twitch' || !/^[a-z0-9_]{1,25}$/.test(login))) return;
    const key = JSON.stringify([platform, user.id || login, url]);
    if ((this.recent.get(key) || 0) > this.now() || this.queue.length >= this.maxQueue) return;
    this.recent.delete(key);
    this.recent.set(key, this.now() + 60000);
    while (this.recent.size > 1000) this.recent.delete(this.recent.keys().next().value);
    this.queue.push({ platform, login, url });
    this.drain();
  }
  drain() {
    while (this.active < this.concurrency && this.queue.length) {
      const job = this.queue.shift();
      this.active++;
      Promise.resolve().then(async () => {
        let url = job.url;
        if (job.platform === 'twitch' && job.login) {
          const resolved = await this.resolve(job.login, url ? { lookup: async () => url } : undefined);
          url = url || resolved;
        }
        if (url) await this.download(url);
      }).catch(() => {}).finally(() => { this.active--; this.drain(); });
    }
  }
  streamerBot(payload) {
    const platform = String(payload?.event?.source || '').toLowerCase();
    const type = String(payload?.event?.type || '').toLowerCase();
    const types = {
      twitch: ['chatmessage', 'follow', 'sub', 'resub', 'giftsub', 'giftbomb', 'raid', 'cheer', 'rewardredemption'],
      youtube: ['message', 'newsubscriber', 'newsponsor', 'membershipgift', 'superchat', 'supersticker'],
    };
    if (!types[platform]?.includes(type)) return;
    const data = payload.data || {};
    if (payload.isTest || data.isTest || data.meta?.internal || data.meta?.isMe) return;
    const user = (type === 'follow' ? data.targetUser : null) || data.user || data.author || data.gifter || data.raider || data.fromBroadcaster || data.subscriber || data.sponsor || {};
    this.warm({ platform, user: {
      id: user.id || user.userId || data.userId,
      username: user.login || user.userName || user.username || user.name || data.userLogin || data.userName,
      profileImageUrl: user.profileImageUrl || user.profileImageURL || user.avatarUrl || user.imageUrl || data.userProfileUrl || data.profileImageUrl,
    } });
  }
  tikfinity(payload) {
    const data = payload?.data || {};
    if (payload?.isTest || data.isTest) return;
    if (!['chat', 'like', 'gift', 'follow', 'subscribe', 'share', 'social', 'member'].includes(String(payload?.event || '').toLowerCase())) return;
    const user = data.user || {};
    this.warm({ platform: 'tiktok', user: {
      id: user.userId || user.id || data.userId,
      username: user.uniqueId || user.username || data.uniqueId || data.username,
      profileImageUrl: user.profilePictureUrl || user.profileImageUrl || user.avatarUrl || data.profilePictureUrl || data.profilePicturUrl,
    } });
  }
}
const avatarWarmer = new AvatarWarmer();
module.exports = { AvatarWarmer, avatarWarmer };
