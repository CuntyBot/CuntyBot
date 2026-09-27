const { EmbedBuilder } = require('discord.js');
const db = require('../../database');
const { COLORS } = require('../../config/constants');
const { sendLog } = require('../logging');
const { isGuildOwner, isOwner, isAdmin, hasRole, permName } = require('../../utils/permissions');
const { dmUser, truncate, fmtDuration } = require('../../utils/helpers');

/* Merkt sich Aktionen des Bots kurz, damit Events (Ban/Timeout/Kick) nicht doppelt geloggt werden */
const recent = new Map();
function markAction(key) {
  recent.set(key, Date.now());
  setTimeout(() => recent.delete(key), 20000).unref();
}
const wasAction = (key) => recent.has(key);

const auditReason = (mod, reason) => truncate(`${reason} | von ${mod.username ?? mod.user?.username}`, 500);

/**
 * Darf der ausführende Moderator dieses Ziel moderieren?
 * Prüft Bot-Rollen-Hierarchie UND Discord-Rollenhierarchie UND das Discord-Recht des Bots.
 */
function checkTarget(executor, target, botPerm = null) {
  const guild = executor.guild;
  const me = guild.members.me;
  if (target.id === executor.id) return 'Du kannst das nicht bei dir selbst tun.';
  if (target.id === me.id) return 'Das kann ich bei mir selbst nicht ausführen.';
  if (target.id === guild.ownerId) return 'Der Serverbesitzer kann nicht moderiert werden.';
  if (!isGuildOwner(executor)) {
    if (isOwner(target)) return 'Owner können nicht moderiert werden.';
    if (isAdmin(target) && !isOwner(executor)) return 'Admins können nur vom Owner moderiert werden.';
    if (hasRole(target, 'MODERATOR') && !isAdmin(executor)) return 'Moderatoren können nur von Admins moderiert werden.';
    if (target.roles.highest.position >= executor.roles.highest.position) return 'Diese Person hat eine gleich hohe oder höhere Rolle als du.';
  }
  if (target.roles.highest.position >= me.roles.highest.position) return 'Diese Person hat eine höhere oder gleiche Rolle wie ich – ich kann sie nicht moderieren.';
  if (botPerm && !me.permissions.has(botPerm)) return `Mir fehlt das Discord-Recht **${permName(botPerm)}**.`;
  return null;
}

const modEmbed = (color, title, lines) => new EmbedBuilder().setColor(color).setTitle(title).setDescription(lines.join('\n')).setTimestamp();

async function notify(guild, user, title, reason, extra = []) {
  if (!db.getConfig(guild.id).moderation.dmOnAction) return false;
  return dmUser(user, { embeds: [modEmbed(COLORS.orange, title, [`**Server:** ${guild.name}`, ...extra, `**Grund:** ${reason}`])] });
}

/* ---------- Warnungen ---------- */
async function warn(guild, moderator, user, reason) {
  const w = db.createWarning({
    guildId: guild.id, id: db.nextId(guild.id, 'warn'), userId: user.id,
    moderatorId: moderator.id, reason, createdAt: Date.now(),
  });
  const count = db.userWarnings(guild.id, user.id).length;
  await notify(guild, user, '⚠️ Du wurdest verwarnt', reason, [`**Warnung Nr.:** ${count}`]);
  await sendLog(guild, 'moderation', {
    title: '⚠️ Warnung',
    fields: [
      { name: 'User', value: `${user} (\`${user.id}\`)`, inline: true },
      { name: 'Moderator', value: `${moderator}`, inline: true },
      { name: 'Warn-ID', value: `#${w.id} (gesamt: ${count})`, inline: true },
      { name: 'Grund', value: reason },
    ],
  });

  // Automatische Strafe bei Erreichen der Warn-Schwelle
  const mc = db.getConfig(guild.id).moderation;
  let autoTimeout = false;
  if (mc.warnThreshold > 0 && count >= mc.warnThreshold) {
    const member = await guild.members.fetch(user.id).catch(() => null);
    const me = guild.members.me;
    if (member && member.moderatable && me.permissions.has('ModerateMembers')) {
      try {
        markAction(`timeout:${guild.id}:${user.id}`);
        await member.timeout(mc.warnTimeoutMinutes * 60000, `Auto: ${count} Warnungen`);
        autoTimeout = true;
        await sendLog(guild, 'timeout', {
          description: `${user} wurde automatisch für ${mc.warnTimeoutMinutes} Min. stummgeschaltet (${count} Warnungen).`,
        });
      } catch { /* ignorieren */ }
    }
  }
  return { warning: w, count, autoTimeout };
}

/* ---------- Timeout ---------- */
async function timeoutMember(guild, moderator, member, ms, reason) {
  markAction(`timeout:${guild.id}:${member.id}`);
  await member.timeout(ms, auditReason(moderator, reason));
  await notify(guild, member.user, '⏳ Du hast einen Timeout erhalten', reason, [`**Dauer:** ${fmtDuration(ms)}`]);
  await sendLog(guild, 'timeout', {
    fields: [
      { name: 'User', value: `${member} (\`${member.id}\`)`, inline: true },
      { name: 'Moderator', value: `${moderator}`, inline: true },
      { name: 'Dauer', value: fmtDuration(ms), inline: true },
      { name: 'Grund', value: reason },
    ],
  });
}

async function removeTimeout(guild, moderator, member) {
  markAction(`timeout:${guild.id}:${member.id}`);
  await member.timeout(null, auditReason(moderator, 'Timeout aufgehoben'));
  await sendLog(guild, 'moderation', { description: `⏳ Timeout von ${member} aufgehoben durch ${moderator}.` });
}

/* ---------- Kick / Ban / Unban ---------- */
async function kickMember(guild, moderator, member, reason) {
  await notify(guild, member.user, '👢 Du wurdest gekickt', reason);
  markAction(`kick:${guild.id}:${member.id}`);
  await member.kick(auditReason(moderator, reason));
  await sendLog(guild, 'kick', {
    fields: [
      { name: 'User', value: `${member.user} (\`${member.id}\`)`, inline: true },
      { name: 'Moderator', value: `${moderator}`, inline: true },
      { name: 'Grund', value: reason },
    ],
  });
}

async function banUser(guild, moderator, user, reason, deleteDays = 0) {
  await notify(guild, user, '🔨 Du wurdest gebannt', reason);
  markAction(`ban:${guild.id}:${user.id}`);
  await guild.members.ban(user.id, { reason: auditReason(moderator, reason), deleteMessageSeconds: deleteDays * 86400 });
  await sendLog(guild, 'ban', {
    fields: [
      { name: 'User', value: `${user} (\`${user.id}\`)`, inline: true },
      { name: 'Moderator', value: `${moderator}`, inline: true },
      { name: 'Grund', value: reason },
    ],
  });
}

async function unbanUser(guild, moderator, userId, reason) {
  const ban = await guild.bans.fetch(userId); // wirft Fehler, wenn nicht gebannt
  markAction(`unban:${guild.id}:${userId}`);
  await guild.bans.remove(userId, auditReason(moderator, reason));
  await sendLog(guild, 'unban', {
    fields: [
      { name: 'User', value: `${ban.user.username} (\`${userId}\`)`, inline: true },
      { name: 'Moderator', value: `${moderator}`, inline: true },
      { name: 'Grund', value: reason },
    ],
  });
  return ban.user;
}

module.exports = { markAction, wasAction, checkTarget, warn, timeoutMember, removeTimeout, kickMember, banUser, unbanUser };
