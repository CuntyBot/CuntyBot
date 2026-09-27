const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits: P } = require('discord.js');
const db = require('../../database');
const { COLORS } = require('../../config/constants');
const { sendLog } = require('../logging');
const { syncLevelRoles } = require('../levelRoles');
const { markAction } = require('../moderation');
const { roleId, hasRole, canBotManageRole } = require('../../utils/permissions');
const { dmUser, truncate } = require('../../utils/helpers');
const logger = require('../../utils/logger');

/**
 * Freigabe: Member-Rolle ZUERST hinzufügen, danach Unverified entfernen
 * (so ist der User nie ohne Rolle), Status speichern, loggen, DM.
 */
async function approve(guild, target, moderator, { ticket = null } = {}) {
  const memberRole = guild.roles.cache.get(roleId(guild.id, 'MEMBER'));
  const unverified = guild.roles.cache.get(roleId(guild.id, 'UNVERIFIED'));
  if (!memberRole) return { error: 'Die Member-Rolle existiert nicht. Prüfe `/config roles`.' };
  if (!canBotManageRole(guild, memberRole)) return { error: 'Ich kann die Member-Rolle nicht vergeben. Meine Bot-Rolle muss **über** der Member-Rolle stehen und das Recht „Rollen verwalten“ haben.' };
  if (unverified && target.roles.cache.has(unverified.id) && !canBotManageRole(guild, unverified)) {
    return { error: 'Ich kann die Unverified-Rolle nicht entfernen (Bot-Rolle muss darüber stehen).' };
  }

  const reason = `Verifiziert durch ${moderator.user?.username ?? moderator.username}`;
  if (!target.roles.cache.has(memberRole.id)) await target.roles.add(memberRole, reason);
  if (unverified && target.roles.cache.has(unverified.id)) await target.roles.remove(unverified, reason);

  const u = db.getUser(guild.id, target.id);
  u.verification = { status: 'verified', by: moderator.id, at: Date.now(), reason: null, ticket: ticket?.number ?? null };
  db.save();

  for (const kind of ['text', 'voice']) await syncLevelRoles(guild, target, kind).catch(() => {});

  await sendLog(guild, 'verification', {
    title: '✅ Verifizierung freigegeben',
    color: COLORS.success,
    fields: [
      { name: 'User', value: `${target} (\`${target.id}\`)`, inline: true },
      { name: 'Bearbeiter', value: `${moderator}`, inline: true },
      ...(ticket ? [{ name: 'Ticket', value: `#${String(ticket.number).padStart(4, '0')}`, inline: true }] : []),
    ],
  });
  if (db.getConfig(guild.id).verification.dmOnResult) {
    await dmUser(target.user, { embeds: [new EmbedBuilder().setColor(COLORS.success).setTitle('✅ Verifiziert').setDescription(`Du wurdest auf **${guild.name}** verifiziert. Willkommen!`)] });
  }
  return { ok: true };
}

/** Ablehnung (optional mit Kick). `target` ist GuildMember oder null (User nicht mehr da), `user` ist immer ein User. */
async function reject(guild, user, member, moderator, reason, { kick = false, ticket = null } = {}) {
  const u = db.getUser(guild.id, user.id);
  u.verification = { status: 'rejected', by: moderator.id, at: Date.now(), reason, ticket: ticket?.number ?? null };
  db.save();

  const cfg = db.getConfig(guild.id).verification;
  if (cfg.dmOnResult) {
    await dmUser(user, { embeds: [new EmbedBuilder().setColor(COLORS.danger).setTitle('❌ Verifizierung abgelehnt')
      .setDescription(`**Server:** ${guild.name}\n**Grund:** ${truncate(reason, 900)}${kick ? '\nDu wurdest zusätzlich vom Server entfernt.' : ''}`)] });
  }

  let kicked = false;
  let kickError = null;
  if (kick && member) {
    try {
      markAction(`kick:${guild.id}:${member.id}`);
      await member.kick(truncate(`Verifizierung abgelehnt: ${reason}`, 500));
      kicked = true;
    } catch (e) { kickError = e.message; }
  }
  await sendLog(guild, 'verification', {
    title: kicked ? '❌ Verifizierung abgelehnt + Kick' : '❌ Verifizierung abgelehnt',
    color: COLORS.danger,
    fields: [
      { name: 'User', value: `${user} (\`${user.id}\`)`, inline: true },
      { name: 'Bearbeiter', value: `${moderator}`, inline: true },
      { name: 'Grund', value: reason },
    ],
  });
  return { ok: true, kicked, kickError };
}

/** Status: verified | pending | rejected | unverified */
function getStatus(guild, userId, member = null) {
  const u = db.peekUser(guild.id, userId);
  const pending = db.userTickets(guild.id, userId).find((t) => t.typeId === 'verification');
  if (member && hasRole(member, 'MEMBER')) return { status: 'verified', data: u?.verification, ticket: null };
  if (pending) return { status: 'pending', data: u?.verification, ticket: pending };
  if (u?.verification?.status === 'rejected') return { status: 'rejected', data: u.verification, ticket: null };
  if (u?.verification?.status === 'verified') return { status: 'verified', data: u.verification, ticket: null };
  return { status: 'unverified', data: u?.verification, ticket: null };
}

const STATUS_LABEL = {
  verified: '✅ Verifiziert', pending: '⏳ Wartet auf Freigabe', rejected: '❌ Abgelehnt', unverified: '🔒 Nicht verifiziert',
};

/** Sendet das Verifizierungs-Panel und richtet die Rechte des Kanals ein */
async function sendPanel(guild, channel) {
  const cfg = db.getConfig(guild.id);
  const v = cfg.verification;
  const embed = new EmbedBuilder().setColor(COLORS.success).setTitle(truncate(v.panelTitle, 250)).setDescription(truncate(v.panelDescription, 4000));
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket:open:verification').setLabel(truncate(v.panelButtonLabel, 80)).setEmoji('✅').setStyle(ButtonStyle.Success),
  );
  const msg = await channel.send({ embeds: [embed], components: [row] });
  cfg.channels.VERIFICATION = channel.id;
  db.save();

  // Kanalrechte: Unverified darf nur lesen, Member sieht den Kanal nicht mehr, Team sieht ihn immer
  const warnings = [];
  try {
    if (!guild.members.me.permissions.has(P.ManageRoles) || !channel.permissionsFor(guild.members.me).has(P.ManageRoles)) {
      warnings.push('Ich konnte die Kanalrechte nicht setzen (Recht „Rollen verwalten“/„Kanäle verwalten“ fehlt).');
    } else {
      const unv = guild.roles.cache.get(roleId(guild.id, 'UNVERIFIED'));
      const mem = guild.roles.cache.get(roleId(guild.id, 'MEMBER'));
      if (unv) await channel.permissionOverwrites.edit(unv, { ViewChannel: true, ReadMessageHistory: true, SendMessages: false, AddReactions: false, CreatePublicThreads: false });
      for (const key of ['TICKETS', 'MODERATOR', 'ADMIN', 'OWNER']) {
        const r = guild.roles.cache.get(roleId(guild.id, key));
        if (r) await channel.permissionOverwrites.edit(r, { ViewChannel: true });
      }
      if (mem) await channel.permissionOverwrites.edit(mem, { ViewChannel: false });
    }
  } catch (e) {
    logger.warn(`Verifizierungs-Kanalrechte: ${e.message}`);
    warnings.push(`Kanalrechte konnten nicht vollständig gesetzt werden: ${e.message}`);
  }
  return { msg, warnings };
}

module.exports = { approve, reject, getStatus, sendPanel, STATUS_LABEL };
