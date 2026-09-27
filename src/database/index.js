/**
 * Persistente Datenbank in einer JSON-Datei (keine Installation nötig, ideal für Anfänger/Handy).
 * - Schreibt atomar (tmp-Datei + rename) und legt regelmäßig ein .bak-Backup an.
 * - Ist die Datei beschädigt, wird das Backup geladen und die kaputte Datei aufgehoben.
 * Alle anderen Module sprechen nur mit dieser API -> die Speicherung lässt sich später austauschen.
 */
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { defaultGuildConfig } = require('../config/constants');

const DB_PATH = path.resolve(process.env.DATABASE_PATH || './data/database.json');
const EMPTY = () => ({ meta: {}, guilds: {}, users: {}, tickets: {}, reports: {}, warnings: {}, counters: {} });

let data = EMPTY();
let timer = null;
let dirty = false;
let lastBackup = 0;
const channelIndex = new Map(); // channelId -> ticket
const ensured = new WeakSet();

// Bereiche mit dynamischen Schlüsseln: hier werden keine Standardwerte hineingemischt
const NO_MERGE = new Set([
  'tickets.types', 'logs.enabled', 'logs.channels', 'levelRoles.text', 'levelRoles.voice',
  'xp.multipliers', 'roles', 'channels', 'categories',
]);
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

function applyDefaults(target, defaults, p) {
  for (const k of Object.keys(defaults)) {
    const np = p ? `${p}.${k}` : k;
    if (!(k in target)) target[k] = structuredClone(defaults[k]);
    else if (isObj(defaults[k]) && isObj(target[k]) && !NO_MERGE.has(np)) applyDefaults(target[k], defaults[k], np);
  }
}

function rebuildIndexes() {
  channelIndex.clear();
  for (const t of Object.values(data.tickets)) channelIndex.set(t.channelId, t);
}

function init() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  let loaded = null;
  for (const p of [DB_PATH, `${DB_PATH}.bak`]) {
    if (!fs.existsSync(p)) continue;
    try {
      loaded = { ...EMPTY(), ...JSON.parse(fs.readFileSync(p, 'utf8')) };
      if (p !== DB_PATH) logger.warn('Hauptdatenbank defekt – Backup wurde geladen.');
      break;
    } catch (e) {
      logger.error(`Datenbank-Datei ${p} ist beschädigt: ${e.message}`);
      try { fs.copyFileSync(p, `${p}.corrupt-${Date.now()}`); } catch { /* ignorieren */ }
    }
  }
  data = loaded || EMPTY();
  rebuildIndexes();
  logger.info(`Datenbank geladen: ${DB_PATH}`);
}

function flush() {
  if (!dirty) return;
  dirty = false;
  try {
    const tmp = `${DB_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data));
    if (fs.existsSync(DB_PATH) && Date.now() - lastBackup > 10 * 60 * 1000) {
      fs.copyFileSync(DB_PATH, `${DB_PATH}.bak`);
      lastBackup = Date.now();
    }
    fs.renameSync(tmp, DB_PATH);
  } catch (e) {
    dirty = true;
    logger.error('Datenbank konnte nicht gespeichert werden:', e.message);
  }
}

function save() {
  dirty = true;
  if (timer) return;
  timer = setTimeout(() => { timer = null; flush(); }, 1500);
}

/* ---------- Pfad-Helfer ---------- */
const getPath = (obj, p) => p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
function setPath(obj, p, value) {
  const keys = p.split('.');
  const last = keys.pop();
  let o = obj;
  for (const k of keys) o = o[k] = isObj(o[k]) ? o[k] : {};
  o[last] = value;
}
function deletePath(obj, p) {
  const keys = p.split('.');
  const last = keys.pop();
  const o = keys.reduce((x, k) => (x == null ? undefined : x[k]), obj);
  if (o) delete o[last];
}

/* ---------- Konfiguration ---------- */
function getConfig(guildId) {
  const c = (data.guilds[guildId] ??= {});
  if (!ensured.has(c)) {
    applyDefaults(c, defaultGuildConfig(), '');
    ensured.add(c);
    save();
  }
  return c;
}
const getMeta = () => data.meta;

/* ---------- User ---------- */
const uKey = (g, u) => `${g}:${u}`;
function getUser(guildId, userId) {
  const k = uKey(guildId, userId);
  let u = data.users[k];
  if (!u) {
    u = data.users[k] = {
      guildId, userId,
      verification: { status: 'none', by: null, at: null, reason: null, ticket: null },
      xp: 0, level: 0, voiceXp: 0, voiceLevel: 0,
      daily: { date: '', text: 0, voice: 0 },
      createdAt: Date.now(),
    };
    save();
  }
  return u;
}
const peekUser = (guildId, userId) => data.users[uKey(guildId, userId)];
const guildUsers = (guildId) => Object.values(data.users).filter((u) => u.guildId === guildId);

/* ---------- Zähler ---------- */
function nextId(guildId, kind) {
  const k = `${kind}:${guildId}`;
  data.counters[k] = (data.counters[k] || 0) + 1;
  save();
  return data.counters[k];
}

/* ---------- Tickets ---------- */
function createTicket(t) {
  data.tickets[`${t.guildId}:${t.number}`] = t;
  channelIndex.set(t.channelId, t);
  save();
  return t;
}
const getTicket = (guildId, number) => data.tickets[`${guildId}:${number}`] || null;
const getTicketByChannel = (channelId) => channelIndex.get(channelId) || null;
const guildTickets = (guildId) => Object.values(data.tickets).filter((t) => t.guildId === guildId);
const userTickets = (guildId, userId, status = 'open') =>
  guildTickets(guildId).filter((t) => t.userId === userId && t.status === status);

/* ---------- Reports ---------- */
function createReport(r) { data.reports[`${r.guildId}:${r.id}`] = r; save(); return r; }
const getReport = (guildId, id) => data.reports[`${guildId}:${id}`] || null;
const guildReports = (guildId) => Object.values(data.reports).filter((r) => r.guildId === guildId);
function deleteReport(guildId, id) { const ok = delete data.reports[`${guildId}:${id}`]; save(); return ok; }

/* ---------- Warnungen ---------- */
function createWarning(w) { data.warnings[`${w.guildId}:${w.id}`] = w; save(); return w; }
const getWarning = (guildId, id) => data.warnings[`${guildId}:${id}`] || null;
const userWarnings = (guildId, userId) =>
  Object.values(data.warnings).filter((w) => w.guildId === guildId && w.userId === userId);
function deleteWarning(guildId, id) { const ok = delete data.warnings[`${guildId}:${id}`]; save(); return ok; }

module.exports = {
  init, flush, save, getPath, setPath, deletePath, getConfig, getMeta,
  getUser, peekUser, guildUsers, nextId,
  createTicket, getTicket, getTicketByChannel, guildTickets, userTickets,
  createReport, getReport, guildReports, deleteReport,
  createWarning, getWarning, userWarnings, deleteWarning,
};
