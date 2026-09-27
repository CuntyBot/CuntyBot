const { EmbedBuilder } = require('discord.js');
const { getConfig, getUser, peekUser, guildUsers, save } = require('../../database');
const { COLORS } = require('../../config/constants');
const { fmtNum, truncate, progressBar, isIgnoredChannel } = require('../../utils/helpers');
const { sendLog } = require('../logging');
const { syncLevelRoles } = require('../levelRoles');
const { KINDS, levelFromXp } = require('./kinds');
const logger = require('../../utils/logger');

const todayKey = () => new Date().toISOString().slice(0, 10);

/* ---------- Level-Up ---------- */
async function announceLevelUp(guild, member, kind, level, xp, channel) {
  const K = KINDS[kind];
  const c = getConfig(guild.id)[K.cfg];
  if (c.levelUpMode === 'off') return;
  const text = String(c.levelUpMessage || '')
    .replaceAll('{user}', member.toString())
    .replaceAll('{username}', member.user.username)
    .replaceAll('{level}', String(level))
    .replaceAll('{xp}', fmtNum(xp))
    .replaceAll('{type}', K.label);
  if (!text) return;

  if (c.levelUpMode === 'dm') { await member.send(text).catch(() => {}); return; }
  const target = c.levelUpMode === 'channel' ? guild.channels.cache.get(c.levelUpChannel) : channel;
  if (target?.isTextBased() && target.permissionsFor(guild.members.me)?.has(['ViewChannel', 'SendMessages'])) {
    await target.send({ content: text, allowedMentions: { users: [member.id] } }).catch(() => {});
  }
}

/**
 * Vergibt XP (Anti-Spam: Tageslimit). Gibt {amount, level} zurück oder null, wenn nichts vergeben wurde.
 */
async function grantXp(guild, member, kind, amount, { channel = null } = {}) {
  const K = KINDS[kind];
  const c = getConfig(guild.id)[K.cfg];
  const u = getUser(guild.id, member.id);
  const day = todayKey();
  if (u.daily.date !== day) u.daily = { date: day, text: 0, voice: 0 };

  amount = Math.floor(amount);
  if (c.dailyCap > 0) amount = Math.min(amount, c.dailyCap - u.daily[K.daily]);
  if (amount <= 0) return null;

  const before = u[K.level];
  u[K.xp] += amount;
  u.daily[K.daily] += amount;
  const after = levelFromXp(u[K.xp]).level;
  u[K.level] = after;
  save();

  if (after > before) {
    try {
      await syncLevelRoles(guild, member, kind);
      await announceLevelUp(guild, member, kind, after, u[K.xp], channel);
      await sendLog(guild, 'levelUp', {
        description: `${K.emoji} **${K.label}-Level-Up**`,
        fields: [
          { name: 'User', value: `${member} (\`${member.id}\`)`, inline: true },
          { name: 'Altes Level', value: String(before), inline: true },
          { name: 'Neues Level', value: String(after), inline: true },
          { name: 'XP', value: fmtNum(u[K.xp]), inline: true },
        ],
      });
    } catch (e) { logger.warn(`Level-Up-Verarbeitung fehlgeschlagen: ${e.message}`); }
  }
  return { amount, level: after };
}

/* ---------- Text-XP pro Nachricht ---------- */
const cooldowns = new Map(); // "guild:user" -> Zeitstempel
const lastContent = new Map(); // "guild:user" -> letzter Text

async function handleMessage(message) {
  if (!message.guild || message.author.bot || message.webhookId || message.system) return;
  const c = getConfig(message.guild.id).xp;
  if (!c.enabled) return;

  const content = message.content.trim();
  if (content.length < c.minLength) return;
  if (new Set(content.toLowerCase()).size < 3) return; // "aaaaaa"
  if (isIgnoredChannel(c.ignoredChannels, message.channel)) return;

  const member = message.member;
  if (!member) return;
  if (member.roles.cache.some((r) => c.ignoredRoles.includes(r.id))) return;

  const key = `${message.guild.id}:${message.author.id}`;
  const now = Date.now();
  if (now - (cooldowns.get(key) || 0) < c.cooldownSec * 1000) return;
  const norm = content.toLowerCase();
  if (lastContent.get(key) === norm) return; // gleicher Text wie zuvor -> keine XP
  cooldowns.set(key, now);
  lastContent.set(key, norm);

  const min = Math.min(c.minXp, c.maxXp);
  const max = Math.max(c.minXp, c.maxXp);
  let amount = min + Math.floor(Math.random() * (max - min + 1));
  const mults = Object.entries(c.multipliers || {})
    .filter(([rid]) => member.roles.cache.has(rid)).map(([, m]) => Number(m) || 1);
  amount *= Math.max(1, ...mults);
  await grantXp(message.guild, member, 'text', amount, { channel: message.channel });
}

// Speicher aufräumen
setInterval(() => {
  const limit = Date.now() - 10 * 60 * 1000;
  for (const [k, t] of cooldowns) if (t < limit) { cooldowns.delete(k); lastContent.delete(k); }
}, 10 * 60 * 1000).unref();

/* ---------- Admin-Änderungen ---------- */
async function adminModify(guild, moderator, targetUser, kind, mode, amount) {
  const K = KINDS[kind];
  const u = getUser(guild.id, targetUser.id);
  const before = u[K.xp];
  const levelBefore = u[K.level];
  let next = before;
  if (mode === 'add') next = before + amount;
  else if (mode === 'remove') next = before - amount;
  else if (mode === 'set') next = amount;
  else if (mode === 'reset') next = 0;
  next = Math.max(0, Math.floor(next));
  u[K.xp] = next;
  u[K.level] = levelFromXp(next).level;
  save();

  const member = await guild.members.fetch(targetUser.id).catch(() => null);
  if (member) await syncLevelRoles(guild, member, kind).catch((e) => logger.warn(e.message));
  await sendLog(guild, 'xp', {
    description: `${K.emoji} **${K.label}-XP geändert** (${mode})`,
    fields: [
      { name: 'User', value: `${targetUser} (\`${targetUser.id}\`)`, inline: true },
      { name: 'Von', value: `${moderator}`, inline: true },
      { name: 'XP', value: `${fmtNum(before)} → ${fmtNum(next)}`, inline: true },
      { name: 'Level', value: `${levelBefore} → ${u[K.level]}`, inline: true },
    ],
  });
  return { before, next, levelBefore, levelAfter: u[K.level] };
}

/* ---------- Anzeige ---------- */
function rankOf(guildId, userId, kind) {
  const K = KINDS[kind];
  const list = guildUsers(guildId).filter((u) => u[K.xp] > 0).sort((a, b) => b[K.xp] - a[K.xp]);
  const idx = list.findIndex((u) => u.userId === userId);
  return { rank: idx >= 0 ? idx + 1 : null, total: list.length };
}

function statsEmbed(guild, user, kind) {
  const K = KINDS[kind];
  const xp = peekUser(guild.id, user.id)?.[K.xp] || 0;
  const info = levelFromXp(xp);
  const { rank, total } = rankOf(guild.id, user.id, kind);
  return new EmbedBuilder().setColor(COLORS.primary)
    .setAuthor({ name: `${K.emoji} ${K.label}-XP von ${user.username}`, iconURL: user.displayAvatarURL() })
    .addFields(
      { name: 'XP', value: fmtNum(xp), inline: true },
      { name: 'Level', value: String(info.level), inline: true },
      { name: 'Rang', value: rank ? `#${rank} von ${total}` : '—', inline: true },
      { name: 'Fortschritt', value: `${progressBar(info.into, info.need)}\n${fmtNum(info.into)} / ${fmtNum(info.need)} XP` },
    );
}

function levelEmbed(guild, user, kind) {
  const K = KINDS[kind];
  const xp = peekUser(guild.id, user.id)?.[K.xp] || 0;
  const info = levelFromXp(xp);
  return new EmbedBuilder().setColor(COLORS.primary)
    .setAuthor({ name: `${K.emoji} ${K.label}-Level von ${user.username}`, iconURL: user.displayAvatarURL() })
    .setDescription(`**Level ${info.level}**\n${progressBar(info.into, info.need)}\n${fmtNum(info.into)} / ${fmtNum(info.need)} XP bis Level ${info.level + 1}`);
}

function leaderboardEmbed(guild, kind, page = 1, mode = 'xp') {
  const K = KINDS[kind];
  const list = guildUsers(guild.id).filter((u) => u[K.xp] > 0).sort((a, b) => b[K.xp] - a[K.xp]);
  const pages = Math.max(1, Math.ceil(list.length / 10));
  page = Math.min(Math.max(1, page), pages);
  const rows = list.slice((page - 1) * 10, page * 10).map((u, i) => {
    const pos = (page - 1) * 10 + i + 1;
    const medal = ['🥇', '🥈', '🥉'][pos - 1] || `**${pos}.**`;
    return `${medal} <@${u.userId}> — Level ${levelFromXp(u[K.xp]).level} — ${fmtNum(u[K.xp])} XP`;
  });
  const title = mode === 'level' ? `🏆 ${K.label}-Level-Leaderboard` : `🏆 ${K.label}-XP-Leaderboard`;
  return new EmbedBuilder().setColor(COLORS.warning).setTitle(title)
    .setDescription(truncate(rows.join('\n') || 'Noch keine Daten.', 4000))
    .setFooter({ text: `Seite ${page}/${pages}` });
}

module.exports = {
  grantXp, handleMessage, adminModify, rankOf, statsEmbed, levelEmbed, leaderboardEmbed,
};
