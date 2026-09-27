const { MessageFlags } = require('discord.js');
const logger = require('./logger');

const truncate = (s, n = 1024) => {
  s = String(s ?? '');
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};
const fmtNum = (n) => Number(n || 0).toLocaleString('de-DE');
const pad4 = (n) => String(n).padStart(4, '0');
const ts = (d, style = 'f') => `<t:${Math.floor(new Date(d).getTime() / 1000)}:${style}>`;
const isSnowflake = (s) => /^\d{17,20}$/.test(String(s));
const isHttpUrl = (s) => {
  try { const u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; }
};
const parseHex = (s) => {
  if (typeof s === 'number') return s;
  const m = /^#?([0-9a-f]{6})$/i.exec(String(s || '').trim());
  return m ? parseInt(m[1], 16) : null;
};
const escapeHtml = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const UNITS = { w: 604800000, d: 86400000, h: 3600000, m: 60000, s: 1000 };
function parseDuration(str) {
  const s = String(str || '').toLowerCase().replace(/\s+/g, '');
  if (!/^(\d+[wdhms])+$/.test(s)) return null;
  let total = 0;
  for (const [, n, u] of s.matchAll(/(\d+)([wdhms])/g)) total += Number(n) * UNITS[u];
  return total;
}
function fmtDuration(ms) {
  const parts = [];
  let rest = Math.floor(ms / 1000);
  for (const [sec, label] of [[86400, 'Tg.'], [3600, 'Std.'], [60, 'Min.'], [1, 'Sek.']]) {
    const n = Math.floor(rest / sec);
    if (n) { parts.push(`${n} ${label}`); rest -= n * sec; }
  }
  return parts.join(' ') || '0 Sek.';
}
function progressBar(into, need, len = 12) {
  const filled = Math.max(0, Math.min(len, Math.round((into / Math.max(1, need)) * len)));
  return '▰'.repeat(filled) + '▱'.repeat(len - filled);
}

// Ist der Channel (oder seine Kategorie) in der Ignorier-Liste?
function isIgnoredChannel(list, channel) {
  if (!list?.length || !channel) return false;
  return list.includes(channel.id)
    || (channel.parentId && list.includes(channel.parentId))
    || (channel.parent?.parentId && list.includes(channel.parent.parentId));
}

/**
 * Antwortet passend zum Zustand der Interaction (reply / editReply / followUp).
 * Standardmäßig unsichtbar für andere (ephemeral).
 */
async function respond(i, payload, { ephemeral = true } = {}) {
  const p = typeof payload === 'string' ? { content: payload } : { ...payload };
  if (i.replied) return i.followUp(ephemeral ? { ...p, flags: MessageFlags.Ephemeral } : p);
  if (i.deferred) { delete p.flags; return i.editReply(p); }
  if (ephemeral) p.flags = MessageFlags.Ephemeral;
  return i.reply(p);
}

// Sendet in einen Kanal (per ID), ohne bei Fehlern abzustürzen
async function postTo(guild, channelId, payload) {
  const ch = channelId && guild.channels.cache.get(channelId);
  if (!ch || !ch.isTextBased()) return null;
  if (!ch.permissionsFor(guild.members.me)?.has(['ViewChannel', 'SendMessages'])) return null;
  try { return await ch.send(payload); } catch (e) { logger.warn(`Senden in #${ch.name} fehlgeschlagen: ${e.message}`); return null; }
}

async function dmUser(user, payload) {
  try { await user.send(typeof payload === 'string' ? { content: payload } : payload); return true; } catch { return false; }
}

module.exports = {
  truncate, fmtNum, pad4, ts, isSnowflake, isHttpUrl, parseHex, escapeHtml,
  parseDuration, fmtDuration, progressBar, isIgnoredChannel, respond, postTo, dmUser,
};
