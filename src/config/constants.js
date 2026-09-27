const { ROLES, CHANNELS, CATEGORIES } = require('./roles');

const COLORS = {
  primary: 0x5865f2,
  success: 0x57f287,
  danger: 0xed4245,
  warning: 0xfee75c,
  info: 0x3498db,
  neutral: 0x2b2d31,
  orange: 0xe67e22,
};

// Log-Kategorien (Schlüssel = Wert in /logs enable type:...)
const LOG_TYPES = {
  memberJoin: { label: 'Member Join', emoji: '📥', color: COLORS.success },
  memberLeave: { label: 'Member Leave', emoji: '📤', color: COLORS.warning },
  kick: { label: 'Kick', emoji: '👢', color: COLORS.orange },
  ban: { label: 'Ban', emoji: '🔨', color: COLORS.danger },
  unban: { label: 'Unban', emoji: '♻️', color: COLORS.success },
  timeout: { label: 'Timeout', emoji: '⏳', color: COLORS.orange },
  messageDelete: { label: 'Message Delete', emoji: '🗑️', color: COLORS.danger },
  messageEdit: { label: 'Message Edit', emoji: '✏️', color: COLORS.warning },
  roleAdd: { label: 'Role Add', emoji: '➕', color: COLORS.info },
  roleRemove: { label: 'Role Remove', emoji: '➖', color: COLORS.info },
  nicknameChange: { label: 'Nickname Change', emoji: '📝', color: COLORS.info },
  voiceJoin: { label: 'Voice Join', emoji: '🔊', color: COLORS.success },
  voiceLeave: { label: 'Voice Leave', emoji: '🔇', color: COLORS.danger },
  voiceMove: { label: 'Voice Move', emoji: '🔀', color: COLORS.warning },
  ticketCreate: { label: 'Ticket Create', emoji: '🎫', color: COLORS.success, group: 'ticket' },
  ticketClaim: { label: 'Ticket Claim', emoji: '🙋', color: COLORS.info, group: 'ticket' },
  ticketClose: { label: 'Ticket Close', emoji: '🔒', color: COLORS.warning, group: 'ticket' },
  ticketDelete: { label: 'Ticket Delete', emoji: '🗑️', color: COLORS.danger, group: 'ticket' },
  verification: { label: 'Verification', emoji: '✅', color: COLORS.success },
  xp: { label: 'XP', emoji: '✨', color: COLORS.info },
  levelUp: { label: 'Level-Up', emoji: '🆙', color: COLORS.primary },
  moderation: { label: 'Moderation', emoji: '🛡️', color: COLORS.orange },
  botActions: { label: 'Bot Actions', emoji: '🤖', color: COLORS.neutral },
};

const PRIORITIES = {
  low: { label: 'Low', emoji: '🟢' },
  normal: { label: 'Normal', emoji: '🔵' },
  high: { label: 'High', emoji: '🟠' },
  urgent: { label: 'Urgent', emoji: '🔴' },
};

// Standardwerte eines Tickettyps
const TYPE_DEFAULTS = {
  name: 'Ticket',
  emoji: '🎫',
  description: '',
  color: '#5865F2',
  roleKeys: ['TICKETS'], // Schlüssel aus ROLES; Admin + Owner haben immer Zugriff
  roleIds: [], // wenn gesetzt: ersetzt roleKeys
  categoryKey: 'SUPPORT', // Schlüssel aus CATEGORIES
  categoryId: null, // überschreibt categoryKey
  buttonLabel: null,
  buttonStyle: 'primary',
  logChannelId: null, // zusätzlicher Log-Kanal nur für diesen Typ
  allowUserClose: true,
  welcome: null,
  system: false,
};

const mk = (o) => ({ ...TYPE_DEFAULTS, ...o });

function defaultTicketTypes() {
  return {
    verification: mk({
      name: 'Verifizierung', emoji: '✅', description: 'Beantrage deine Verifizierung.',
      color: '#57F287', categoryKey: 'VERIFICATION', buttonLabel: 'Verifizierung beantragen',
      buttonStyle: 'success', system: true,
    }),
    support: mk({ name: 'Support', emoji: '🛠️', description: 'Allgemeine Hilfe und Fragen.' }),
    report: mk({
      name: 'Report', emoji: '🚨', description: 'Melde einen User oder Vorfall.', color: '#ED4245',
      roleKeys: ['TICKETS', 'MODERATOR'], categoryKey: 'REPORT', buttonStyle: 'danger',
    }),
    complaint: mk({
      name: 'Beschwerde', emoji: '📣', description: 'Reiche eine Beschwerde ein.',
      roleKeys: ['TICKETS', 'MODERATOR'],
    }),
    application: mk({ name: 'Bewerbung', emoji: '📝', description: 'Bewirb dich fürs Team.', categoryKey: 'APPLICATION' }),
    partnership: mk({ name: 'Partnerschaft', emoji: '🤝', description: 'Anfrage für eine Partnerschaft.' }),
    general: mk({ name: 'Allgemeines Anliegen', emoji: '💬', description: 'Alles andere rund um den Server.' }),
    technical: mk({ name: 'Technische Hilfe', emoji: '🧰', description: 'Technische Probleme.' }),
    unban: mk({
      name: 'Entbannung', emoji: '🔓', description: 'Beantrage eine Entbannung.',
      roleKeys: ['TICKETS', 'MODERATOR'],
    }),
    other: mk({ name: 'Sonstiges', emoji: '📦', description: 'Sonstige Anliegen.' }),
  };
}

// Standard-Konfiguration pro Server (fehlende Werte werden beim Start automatisch ergänzt)
function defaultGuildConfig() {
  return {
    roles: {}, // Überschreibungen der ROLES-Konstanten
    channels: { ...CHANNELS },
    categories: { ...CATEGORIES },
    tickets: {
      maxOpenPerUser: 3,
      maxOpenPerType: 1,
      closeMode: 'archive', // archive | delete
      transcriptOnClose: true,
      dmTranscript: false,
      userCanClose: true,
      deleteDelaySeconds: 5,
      types: defaultTicketTypes(),
    },
    verification: {
      assignUnverified: true,
      dmOnResult: true,
      rejectCooldownMinutes: 10,
      panelTitle: '✅ Verifizierung',
      panelDescription: 'Klicke auf den Button, um deine Verifizierung zu beantragen.\nEin Teammitglied prüft dich anschließend in einem privaten Ticket.',
      panelButtonLabel: 'Verifizierung beantragen',
    },
    logs: { enabled: {}, channels: {} },
    xp: {
      enabled: true, minXp: 15, maxXp: 25, cooldownSec: 60, minLength: 5, dailyCap: 5000,
      ignoredChannels: [], ignoredRoles: [ROLES.UNVERIFIED], multipliers: {},
      levelUpMode: 'current', levelUpChannel: null,
      levelUpMessage: '🎉 {user} ist auf **Level {level}** aufgestiegen!',
    },
    voice: {
      enabled: true, xpPerMinute: 10, minMembers: 2, dailyCap: 6000,
      ignoreAfkChannel: true, ignoreMuted: false, ignoreDeafened: true,
      ignoredChannels: [], ignoredRoles: [ROLES.UNVERIFIED],
      levelUpMode: 'off', levelUpChannel: null,
      levelUpMessage: '🎙️ {user} ist im Voice auf **Level {level}** aufgestiegen!',
    },
    levelRoles: { mode: 'stack', text: {}, voice: {} },
    autoroles: { onJoin: [] },
    moderation: { dmOnAction: true, warnThreshold: 0, warnTimeoutMinutes: 60 },
    embeds: { teamCanUse: true, defaultColor: '#5865F2' },
    permissions: { modBan: true, modKick: true, modTimeout: true, modClear: true, ticketDelete: true },
  };
}

module.exports = { COLORS, LOG_TYPES, PRIORITIES, TYPE_DEFAULTS, defaultGuildConfig, defaultTicketTypes };
