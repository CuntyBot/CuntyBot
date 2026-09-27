/**
 * Gemeinsame Ausführungslogik für /xp, /level und /voice
 * (Text- und Voice-XP nutzen dieselbe Logik, aber getrennte Daten).
 */
const { requireLevel } = require('../../utils/permissions');
const { respond, fmtNum } = require('../../utils/helpers');
const { KINDS, totalXpForLevel } = require('./kinds');
const xp = require('./index');

const publicReply = (i, payload) => respond(i, payload, { ephemeral: false });

async function show(i, kind) {
  const user = i.options.getUser('user') || i.user;
  return publicReply(i, { embeds: [xp.statsEmbed(i.guild, user, kind)] });
}

async function level(i, kind) {
  const user = i.options.getUser('user') || i.user;
  return publicReply(i, { embeds: [xp.levelEmbed(i.guild, user, kind)] });
}

async function leaderboard(i, kind, mode = 'xp') {
  const page = i.options.getInteger('page') || 1;
  return publicReply(i, { embeds: [xp.leaderboardEmbed(i.guild, kind, page, mode)] });
}

// mode: add | remove | set | reset | levelset
async function admin(i, kind, mode) {
  if (!(await requireLevel(i, 'admin'))) return;
  const user = i.options.getUser('user');
  if (user.bot) return respond(i, '❌ Bots sammeln keine XP.');
  let amount = i.options.getInteger('amount') ?? 0;
  let realMode = mode;
  if (mode === 'levelset') { amount = totalXpForLevel(i.options.getInteger('level')); realMode = 'set'; }
  await i.deferReply({ flags: 64 });
  const r = await xp.adminModify(i.guild, i.user, user, kind, realMode, amount);
  return respond(i, `✅ ${KINDS[kind].label}-XP von ${user}: **${fmtNum(r.before)} → ${fmtNum(r.next)}** (Level ${r.levelBefore} → ${r.levelAfter})`);
}

module.exports = { show, level, leaderboard, admin };
