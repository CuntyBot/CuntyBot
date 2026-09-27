/**
 * ZENTRALE KONFIGURATION
 * Diese Rollen existieren bereits auf deinem Server. Es werden KEINE Rollen erstellt.
 * Alle Systeme greifen auf diese Werte zu (Änderungen pro Server per /config roles möglich).
 */
const ROLES = Object.freeze({
  OWNER: '1428663287049883698',
  ADMIN: '1466119511148204175',
  TICKETS: '1428737556190597230',
  MODERATOR: '1428753760242368532',
  MEMBER: '1428723660725817354',
  UNVERIFIED: '1520557585403482173',
  BOT: '1429476444144275740',
});

// Noch unbekannt -> werden später per /config oder /logs setup gesetzt.
// (REPORTS ist optional: Benachrichtigungen für /report. Ohne Wert wird der Log-Kanal genutzt.)
const CHANNELS = Object.freeze({
  VERIFICATION: null,
  LOGS: null,
  TICKET_LOGS: null,
  TRANSCRIPTS: null,
  REPORTS: null,
});

const CATEGORIES = Object.freeze({
  VERIFICATION: null,
  SUPPORT: null,
  REPORT: null,
  APPLICATION: null,
  ARCHIVE: null,
});

module.exports = { ROLES, CHANNELS, CATEGORIES };
