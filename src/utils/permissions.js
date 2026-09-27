/**
 * Berechtigungssystem: prüft die konfigurierten Bot-Rollen (Owner/Admin/Tickets/Moderator/...)
 * UND die Discord-Rechte des Bots (Hierarchie, "Rollen verwalten" usw.).
 * Der Server-Eigentümer zählt immer als Owner (Schutz vor Aussperren).
 */
const { PermissionFlagsBits, PermissionsBitField } = require('discord.js');
const { ROLES } = require('../config/roles');
const { getConfig } = require('../database');
const { respond } = require('./helpers');

const roleId = (guildId, key) => getConfig(guildId).roles[key] || ROLES[key];
const hasRole = (m, key) => m.roles.cache.has(roleId(m.guild.id, key));

const isGuildOwner = (m) => m.guild.ownerId === m.id;
const isOwner = (m) => isGuildOwner(m) || hasRole(m, 'OWNER');
const isAdmin = (m) => isOwner(m) || hasRole(m, 'ADMIN');
const isTicketTeam = (m) => isAdmin(m) || hasRole(m, 'TICKETS');
const isMod = (m) => isAdmin(m) || hasRole(m, 'MODERATOR');
const isStaff = (m) => isTicketTeam(m) || hasRole(m, 'MODERATOR');
// "Unverified" ohne Member-Rolle => darf nur die Verifizierung nutzen
const isRestricted = (m) => hasRole(m, 'UNVERIFIED') && !hasRole(m, 'MEMBER') && !isStaff(m);
const isMember = (m) => !isRestricted(m);

const LEVELS = {
  any: { check: () => true, label: 'jeder' },
  member: { check: isMember, label: 'Member' },
  staff: { check: isStaff, label: 'Team' },
  ticket: { check: isTicketTeam, label: 'Ticket-Team' },
  mod: { check: isMod, label: 'Moderator' },
  admin: { check: isAdmin, label: 'Admin oder Owner' },
  owner: { check: isOwner, label: 'Owner' },
};

async function requireLevel(i, level) {
  const l = LEVELS[level];
  if (l.check(i.member)) return true;
  await respond(i, `⛔ Dafür brauchst du die Rolle **${l.label}**.`);
  return false;
}

const permName = (p) => new PermissionsBitField(p).toArray()[0] ?? String(p);

// Gibt die Namen fehlender Bot-Rechte zurück (leer = alles da)
function missingBotPerms(guild, perms, channel = null) {
  const me = guild.members.me;
  const have = channel ? channel.permissionsFor(me) : me.permissions;
  return perms.filter((p) => !have?.has(p)).map(permName);
}

// Kann der Bot diese Rolle vergeben/entfernen?
function canBotManageRole(guild, role) {
  const me = guild.members.me;
  return Boolean(
    role && role.id !== guild.id && !role.managed
    && me.permissions.has(PermissionFlagsBits.ManageRoles)
    && role.position < me.roles.highest.position,
  );
}

module.exports = {
  roleId, hasRole, isGuildOwner, isOwner, isAdmin, isTicketTeam, isMod, isStaff, isRestricted, isMember,
  LEVELS, requireLevel, missingBotPerms, canBotManageRole, permName,
};
