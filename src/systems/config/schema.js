/**
 * Beschreibt alle einstellbaren Werte. Die Konfigurations-Oberfläche (/config, /xp config, ...)
 * wird komplett aus diesem Schema erzeugt -> neue Einstellung = nur hier eine Zeile ergänzen.
 * Feld-Typen: bool | int | text | enum | role | roles | channel | channels | category
 */
const { ChannelType } = require('discord.js');
const { ROLES } = require('../../config/roles');
const { LOG_TYPES } = require('../../config/constants');
const { validateJoinRole } = require('../autoroles');
const { parseHex } = require('../../utils/helpers');
const { canBotManageRole } = require('../../utils/permissions');

const TEXT_CH = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const ANY_CH = [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice, ChannelType.GuildStageVoice, ChannelType.GuildForum, ChannelType.GuildCategory];

const ROLE_LABELS = {
  OWNER: 'Owner', ADMIN: 'Admin', TICKETS: 'Ticket-Team', MODERATOR: 'Moderator',
  MEMBER: 'Member (nach Verifizierung)', UNVERIFIED: 'Unverified (beim Join)', BOT: 'Bot-Rolle',
};

const manageable = (value, guild) => {
  const role = guild.roles.cache.get(value);
  if (!role) return 'Rolle nicht gefunden.';
  if (role.id === guild.id) return '@everyone ist nicht erlaubt.';
  return canBotManageRole(guild, role) ? null : 'Ich kann diese Rolle nicht vergeben (Bot-Rolle muss höher stehen).';
};
const notEveryone = (value, guild) => (value === guild.id ? '@everyone ist nicht erlaubt.' : null);

const levelUpFields = (p) => [
  { path: `${p}.levelUpMode`, label: 'Level-Up-Nachricht', type: 'enum', choices: [['off', 'Aus'], ['current', 'Im aktuellen Kanal'], ['channel', 'In festem Kanal'], ['dm', 'Per DM']] },
  { path: `${p}.levelUpChannel`, label: 'Level-Up-Kanal', type: 'channel' },
  { path: `${p}.levelUpMessage`, label: 'Level-Up-Text', type: 'text', max: 300, hint: 'Platzhalter: {user} {username} {level} {xp} {type}' },
];

const AREAS = {
  roles: {
    label: 'Rollen', emoji: '🎭', perm: 'owner',
    fields: Object.keys(ROLES).map((k) => ({
      path: `roles.${k}`, label: ROLE_LABELS[k], type: 'role', default: ROLES[k],
      validate: ['MEMBER', 'UNVERIFIED'].includes(k) ? manageable : notEveryone,
    })),
    note: 'Nur der Owner darf Rollen ändern. „Zurücksetzen“ stellt den Standardwert wieder her.',
  },
  channels: {
    label: 'Channels', emoji: '📺', perm: 'admin',
    fields: [
      { path: 'channels.VERIFICATION', label: 'Verifizierung', type: 'channel' },
      { path: 'channels.LOGS', label: 'Logs (Standard)', type: 'channel' },
      { path: 'channels.TICKET_LOGS', label: 'Ticket-Logs', type: 'channel' },
      { path: 'channels.TRANSCRIPTS', label: 'Transkripte', type: 'channel' },
      { path: 'channels.REPORTS', label: 'Reports', type: 'channel' },
    ],
  },
  categories: {
    label: 'Kategorien', emoji: '🗂️', perm: 'admin',
    fields: [
      { path: 'categories.VERIFICATION', label: 'Verifizierungs-Tickets', type: 'category' },
      { path: 'categories.SUPPORT', label: 'Support-Tickets', type: 'category' },
      { path: 'categories.REPORT', label: 'Report-Tickets', type: 'category' },
      { path: 'categories.APPLICATION', label: 'Bewerbungs-Tickets', type: 'category' },
      { path: 'categories.ARCHIVE', label: 'Archiv (geschlossene Tickets)', type: 'category' },
    ],
  },
  tickets: {
    label: 'Tickets', emoji: '🎫', perm: 'admin',
    fields: [
      { path: 'tickets.maxOpenPerUser', label: 'Max. offene Tickets pro User', type: 'int', min: 1, max: 10 },
      { path: 'tickets.maxOpenPerType', label: 'Max. offene Tickets pro Typ', type: 'int', min: 1, max: 5 },
      { path: 'tickets.closeMode', label: 'Beim Schließen', type: 'enum', choices: [['archive', 'In Archiv verschieben (falls gesetzt)'], ['delete', 'Kanal löschen']] },
      { path: 'tickets.deleteDelaySeconds', label: 'Lösch-Verzögerung (Sek.)', type: 'int', min: 0, max: 300 },
      { path: 'tickets.transcriptOnClose', label: 'Transkript beim Schließen', type: 'bool' },
      { path: 'tickets.dmTranscript', label: 'Transkript per DM an Ersteller', type: 'bool' },
      { path: 'tickets.userCanClose', label: 'Ersteller darf schließen', type: 'bool' },
    ],
    note: 'Tickettypen verwaltest du mit `/ticket type create|edit|delete`.',
  },
  verification: {
    label: 'Verifizierung', emoji: '✅', perm: 'admin',
    fields: [
      { path: 'verification.assignUnverified', label: 'Unverified beim Join vergeben', type: 'bool' },
      { path: 'verification.dmOnResult', label: 'DM bei Freigabe/Ablehnung', type: 'bool' },
      { path: 'verification.rejectCooldownMinutes', label: 'Sperre nach Ablehnung (Min.)', type: 'int', min: 0, max: 10080 },
      { path: 'verification.panelTitle', label: 'Panel-Titel', type: 'text', max: 200 },
      { path: 'verification.panelDescription', label: 'Panel-Text', type: 'text', max: 1000, long: true },
      { path: 'verification.panelButtonLabel', label: 'Button-Text', type: 'text', max: 60 },
    ],
    note: 'Panel senden: `/verify setup`. Textänderungen gelten für neue Panels.',
  },
  logs: {
    label: 'Logs', emoji: '📋', perm: 'admin',
    fields: Object.entries(LOG_TYPES).map(([k, d]) => ({
      path: `logs.enabled.${k}`, label: `${d.emoji} ${d.label}`, type: 'bool', default: true,
    })),
    note: 'Kanäle setzt du mit `/logs setup` bzw. `/logs channel`.',
  },
  xp: {
    label: 'XP (Text)', emoji: '📊', perm: 'admin',
    fields: [
      { path: 'xp.enabled', label: 'XP-System aktiv', type: 'bool' },
      { path: 'xp.minXp', label: 'Minimale XP pro Nachricht', type: 'int', min: 0, max: 1000 },
      { path: 'xp.maxXp', label: 'Maximale XP pro Nachricht', type: 'int', min: 0, max: 1000 },
      { path: 'xp.cooldownSec', label: 'Cooldown (Sek.)', type: 'int', min: 0, max: 3600 },
      { path: 'xp.minLength', label: 'Mindestlänge der Nachricht', type: 'int', min: 0, max: 200 },
      { path: 'xp.dailyCap', label: 'XP-Limit pro Tag (0 = aus)', type: 'int', min: 0, max: 1000000 },
      { path: 'xp.ignoredChannels', label: 'Ignorierte Channels', type: 'channels' },
      { path: 'xp.ignoredRoles', label: 'Ignorierte Rollen', type: 'roles' },
      ...levelUpFields('xp'),
      { path: 'levelRoles.mode', label: 'Level-Rollen-Modus', type: 'enum', choices: [['stack', 'Alle behalten'], ['replace', 'Nur die höchste']] },
    ],
    note: 'Multiplikatoren: `/xp multiplier add|remove|list`. Level-Rollen: `/levelrole add`.',
  },
  voice: {
    label: 'Voice-XP', emoji: '🔊', perm: 'admin',
    fields: [
      { path: 'voice.enabled', label: 'Voice-XP aktiv', type: 'bool' },
      { path: 'voice.xpPerMinute', label: 'XP pro Minute', type: 'int', min: 0, max: 1000 },
      { path: 'voice.minMembers', label: 'Mindestanzahl aktiver Personen', type: 'int', min: 1, max: 99 },
      { path: 'voice.dailyCap', label: 'XP-Limit pro Tag (0 = aus)', type: 'int', min: 0, max: 1000000 },
      { path: 'voice.ignoreAfkChannel', label: 'AFK-Channel ignorieren', type: 'bool' },
      { path: 'voice.ignoreMuted', label: 'Stummgeschaltete ignorieren', type: 'bool' },
      { path: 'voice.ignoreDeafened', label: 'Taub geschaltete ignorieren', type: 'bool' },
      { path: 'voice.ignoredChannels', label: 'Ignorierte Channels', type: 'channels' },
      { path: 'voice.ignoredRoles', label: 'Ignorierte Rollen', type: 'roles' },
      ...levelUpFields('voice'),
    ],
  },
  level: {
    label: 'Level', emoji: '🆙', perm: 'admin',
    fields: [
      ...levelUpFields('xp'),
      { path: 'levelRoles.mode', label: 'Level-Rollen-Modus', type: 'enum', choices: [['stack', 'Alle behalten'], ['replace', 'Nur die höchste']] },
    ],
    note: 'Level-Rollen verwaltest du mit `/levelrole add|remove|list`. Voice-Level-Meldungen: Bereich „Voice-XP“.',
  },
  autoroles: {
    label: 'Auto-Rollen', emoji: '🤖', perm: 'admin',
    fields: [
      { path: 'roles.UNVERIFIED', label: 'Unverified-Rolle', type: 'role', default: ROLES.UNVERIFIED, validate: manageable },
      { path: 'roles.MEMBER', label: 'Member-Rolle (nach Verifizierung)', type: 'role', default: ROLES.MEMBER, validate: manageable },
      { path: 'roles.BOT', label: 'Bot-Rolle', type: 'role', default: ROLES.BOT, validate: notEveryone },
      {
        path: 'autoroles.onJoin', label: 'Zusätzliche Join-Rollen', type: 'roles',
        validate: (ids, guild) => ids.map((id) => validateJoinRole(guild, guild.roles.cache.get(id))).find(Boolean) || null,
      },
    ],
    note: 'Die Member-Rolle wird NIE beim Join vergeben, sondern erst nach der Verifizierung.',
  },
  moderation: {
    label: 'Moderation', emoji: '🛡️', perm: 'admin',
    fields: [
      { path: 'moderation.dmOnAction', label: 'Betroffene per DM informieren', type: 'bool' },
      { path: 'moderation.warnThreshold', label: 'Auto-Timeout ab X Warnungen (0 = aus)', type: 'int', min: 0, max: 50 },
      { path: 'moderation.warnTimeoutMinutes', label: 'Dauer des Auto-Timeouts (Min.)', type: 'int', min: 1, max: 40320 },
    ],
  },
  embeds: {
    label: 'Embeds', emoji: '🎨', perm: 'admin',
    fields: [
      { path: 'embeds.teamCanUse', label: 'Team (Tickets/Mods) darf Embeds nutzen', type: 'bool' },
      { path: 'embeds.defaultColor', label: 'Standardfarbe (Hex)', type: 'text', max: 7, validate: (v) => (parseHex(v) === null ? 'Ungültige Farbe. Beispiel: #5865F2' : null) },
    ],
    note: 'Admin und Owner dürfen immer Embeds erstellen.',
  },
  permissions: {
    label: 'Berechtigungen', emoji: '🔐', perm: 'owner',
    fields: [
      { path: 'permissions.modBan', label: 'Moderatoren dürfen bannen', type: 'bool' },
      { path: 'permissions.modKick', label: 'Moderatoren dürfen kicken', type: 'bool' },
      { path: 'permissions.modTimeout', label: 'Moderatoren dürfen Timeouts geben', type: 'bool' },
      { path: 'permissions.modClear', label: 'Moderatoren dürfen Nachrichten löschen', type: 'bool' },
      { path: 'permissions.ticketDelete', label: 'Ticket-Team darf Tickets löschen', type: 'bool' },
    ],
    note: 'Owner > Admin > Tickets/Moderator. Zusätzlich muss der Bot das jeweilige Discord-Recht besitzen.',
  },
};

module.exports = { AREAS, TEXT_CH, ANY_CH };
