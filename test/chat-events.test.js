const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeStreamerBotEvent,
  normalizeTikfinityEvents,
} = require('../src/chat-events');

test('normalizes documented Twitch chat fields and badges', () => {
  const event = normalizeStreamerBotEvent({
    event: { source: 'Twitch', type: 'ChatMessage' },
    data: {
      text: '!song The Chain Fleetwood Mac',
      messageId: 'm1',
      broadcaster: { id: 'owner-id' },
      user: {
        id: 'user-id',
        login: 'ExampleUser',
        profileImageUrl: 'https://static-cdn.jtvnw.net/example.png',
        subscribed: true,
        badges: [{ name: 'moderator' }, { name: 'vip' }],
      },
    },
  });

  assert.equal(event.platform, 'twitch');
  assert.equal(event.user.username, 'ExampleUser');
  assert.equal(event.user.profileImageUrl, 'https://static-cdn.jtvnw.net/example.png');
  assert.deepEqual(event.user.roles.sort(), ['moderator', 'subscriber', 'vip']);
  assert.equal(event.text, '!song The Chain Fleetwood Mac');
});

test('normalizes only explicit YouTube role flags', () => {
  const event = normalizeStreamerBotEvent({
    event: { source: 'YouTube', type: 'Message' },
    data: {
      message: ' !playlist ',
      user: { id: 'yt-1', name: 'Member', profileImageUrl: 'https://yt3.ggpht.com/avatar', isSponsor: true, isModerator: false },
    },
  });

  assert.deepEqual(event.user.roles, ['member']);
  assert.equal(event.user.profileImageUrl, 'https://yt3.ggpht.com/avatar');
  assert.equal(event.text, '!playlist');
});

test('ignores Streamer.bot messages sent by this application', () => {
  assert.equal(normalizeStreamerBotEvent({
    event: { source: 'Twitch', type: 'ChatMessage' },
    data: { text: '!song loop', meta: { isMe: true }, user: { login: 'bot' } },
  }), null);
});

test('normalizes TikFinity chat arrays without guessing follower role', () => {
  const events = normalizeTikfinityEvents(JSON.stringify([{
    event: 'chat',
    data: {
      comment: '!song Dreams Cranberries',
      user: {
        userId: 'tt-1',
        uniqueId: 'TikUser',
        profilePictureUrl: 'https://p16-sign.tiktokcdn-us.com/avatar.jpeg',
        isModerator: true,
        isSubscriber: true,
        teamMemberLevel: 2,
        followRole: 1,
      },
    },
  }]));

  assert.equal(events.length, 1);
  assert.deepEqual(events[0].user.roles.sort(), ['fan-club', 'moderator', 'subscriber']);
  assert.equal(events[0].user.roles.includes('follower'), false);
  assert.equal(events[0].user.profileImageUrl, 'https://p16-sign.tiktokcdn-us.com/avatar.jpeg');
});
