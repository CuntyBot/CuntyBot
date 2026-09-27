const { getConfig, getUser } = require('../../database');
const { KINDS } = require('../xp/kinds');
const { canBotManageRole } = require('../../utils/permissions');
const logger = require('../../utils/logger');

/**
 * Gleicht die Level-Rollen eines Members mit seinem aktuellen Level ab.
 * Modus "stack": alle erreichten Rollen bleiben. Modus "replace": nur die höchste.
 * Es werden nur Rollen angefasst, die als Level-Rolle konfiguriert sind.
 */
async function syncLevelRoles(guild, member, kind) {
  const cfg = getConfig(guild.id).levelRoles;
  const entries = Object.entries(cfg[kind] || {})
    .map(([level, roleId]) => ({ level: Number(level), roleId }))
    .sort((a, b) => a.level - b.level);
  if (!entries.length) return;

  const level = getUser(guild.id, member.id)[KINDS[kind].level];
  const earned = entries.filter((e) => e.level <= level);
  const top = earned[earned.length - 1];
  const should = new Set(cfg.mode === 'replace' ? (top ? [top.roleId] : []) : earned.map((e) => e.roleId));

  const add = new Set();
  const remove = new Set();
  for (const e of entries) {
    const role = guild.roles.cache.get(e.roleId);
    if (!role) continue;
    if (!canBotManageRole(guild, role)) {
      logger.warn(`Level-Rolle "${role.name}" kann nicht vergeben werden (Bot-Rolle zu niedrig oder Recht fehlt).`);
      continue;
    }
    const has = member.roles.cache.has(e.roleId);
    if (should.has(e.roleId) && !has) add.add(e.roleId);
    else if (!should.has(e.roleId) && has) remove.add(e.roleId);
  }
  if (add.size) await member.roles.add([...add], 'Level-Rolle');
  if (remove.size) await member.roles.remove([...remove], 'Level-Rolle');
}

module.exports = { syncLevelRoles };
