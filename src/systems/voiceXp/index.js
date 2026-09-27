/**
 * Voice-XP: Jede Minute wird geprüft, wer gerade in einem Voice-Channel ist.
 * Es gibt keinen Session-Status -> nach einem Neustart läuft alles sofort korrekt weiter.
 * Anti-AFK: AFK-Channel, Mindestpersonen, ignorierte Channels/Rollen, Bots, Mute/Deaf, Tageslimit.
 */
const { getConfig } = require('../../database');
const { isIgnoredChannel } = require('../../utils/helpers');
const { grantXp } = require('../xp');
const logger = require('../../utils/logger');

let running = false;
let handle = null;

async function processGuild(guild) {
  const c = getConfig(guild.id).voice;
  if (!c.enabled) return;

  const groups = new Map(); // channelId -> [{member, channel}]
  for (const vs of guild.voiceStates.cache.values()) {
    const member = vs.member;
    const ch = vs.channel;
    if (!member || !ch || member.user.bot) continue;
    if (c.ignoreAfkChannel && ch.id === guild.afkChannelId) continue;
    if (isIgnoredChannel(c.ignoredChannels, ch)) continue;
    if (c.ignoreDeafened && (vs.deaf || vs.selfDeaf)) continue;
    if (c.ignoreMuted && (vs.mute || vs.selfMute)) continue;
    if (vs.suppress) continue; // Stage-Zuhörer
    if (member.roles.cache.some((r) => c.ignoredRoles.includes(r.id))) continue;
    if (!groups.has(ch.id)) groups.set(ch.id, []);
    groups.get(ch.id).push({ member, ch });
  }

  for (const list of groups.values()) {
    if (list.length < c.minMembers) continue; // zu wenige aktive Personen
    for (const { member, ch } of list) {
      await grantXp(guild, member, 'voice', c.xpPerMinute, { channel: ch });
    }
  }
}

async function tick(client) {
  if (running) return; // kein Überlappen
  running = true;
  try {
    for (const guild of client.guilds.cache.values()) {
      try { await processGuild(guild); } catch (e) { logger.error(`Voice-XP-Fehler (${guild.name}):`, e); }
    }
  } finally { running = false; }
}

function start(client) {
  if (handle) return;
  handle = setInterval(() => tick(client), 60 * 1000);
  handle.unref?.();
}

module.exports = { start };
