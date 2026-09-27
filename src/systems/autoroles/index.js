const { PermissionFlagsBits: P } = require('discord.js');
const { getConfig } = require('../../database');
const { roleId, canBotManageRole } = require('../../utils/permissions');
const { sendLog } = require('../logging');
const logger = require('../../utils/logger');

const DANGEROUS = [
  P.Administrator, P.ManageGuild, P.ManageRoles, P.ManageChannels, P.ManageWebhooks, P.BanMembers,
  P.KickMembers, P.ModerateMembers, P.ManageMessages, P.MentionEveryone, P.ManageNicknames,
];

/**
 * Prüft, ob eine Rolle beim JOIN vergeben werden darf.
 * Verboten: Team-Rollen, Member-Rolle (nur nach Verifizierung!), verwaltete Rollen, Rollen mit Mod-/Admin-Rechten.
 */
function validateJoinRole(guild, role) {
  if (!role) return 'Rolle nicht gefunden.';
  if (role.id === guild.id) return '@everyone kann nicht verwendet werden.';
  if (role.managed) return 'Diese Rolle wird von einer Integration verwaltet.';
  for (const key of ['OWNER', 'ADMIN', 'TICKETS', 'MODERATOR', 'MEMBER']) {
    if (role.id === roleId(guild.id, key)) {
      return key === 'MEMBER'
        ? 'Die Member-Rolle darf nicht beim Join vergeben werden – sie gibt es erst nach der Verifizierung.'
        : 'Team-Rollen dürfen nicht automatisch vergeben werden.';
    }
  }
  if (DANGEROUS.some((perm) => role.permissions.has(perm))) return 'Diese Rolle besitzt Moderations-/Admin-Rechte und darf nicht automatisch vergeben werden.';
  if (!canBotManageRole(guild, role)) return 'Ich kann diese Rolle nicht vergeben (Bot-Rolle muss höher stehen + Recht „Rollen verwalten“).';
  return null;
}

async function safeAdd(member, role, reason) {
  if (member.roles.cache.has(role.id)) return;
  if (!canBotManageRole(member.guild, role)) {
    logger.warn(`Rolle "${role.name}" konnte nicht vergeben werden (Hierarchie/Rechte).`);
    await sendLog(member.guild, 'botActions', { description: `⚠️ Rolle **${role.name}** konnte ${member} nicht gegeben werden (Bot-Rolle zu niedrig oder Recht fehlt).` });
    return;
  }
  await member.roles.add(role, reason);
}

/**
 * Beim Join:
 *  - Bots bekommen die Bot-Rolle
 *  - Neue User bekommen "Unverified" (NIE "Member") + zusätzliche Auto-Rollen
 */
async function assignJoinRoles(member) {
  const guild = member.guild;
  const cfg = getConfig(guild.id);
  const memberRoleId = roleId(guild.id, 'MEMBER');

  try {
    if (member.user.bot) {
      const role = guild.roles.cache.get(roleId(guild.id, 'BOT'));
      if (role && !role.managed) await safeAdd(member, role, 'Auto-Rolle: Bot');
      return;
    }
    if (cfg.verification.assignUnverified) {
      const role = guild.roles.cache.get(roleId(guild.id, 'UNVERIFIED'));
      if (role) await safeAdd(member, role, 'Auto-Rolle: Unverified');
    }
    for (const id of cfg.autoroles.onJoin) {
      if (id === memberRoleId) continue; // Sicherheitsnetz
      const role = guild.roles.cache.get(id);
      if (role && !validateJoinRole(guild, role)) await safeAdd(member, role, 'Auto-Rolle');
    }
  } catch (e) {
    logger.error(`Auto-Rollen fehlgeschlagen für ${member.user.username}:`, e.message);
  }
}

module.exports = { assignJoinRoles, validateJoinRole };
