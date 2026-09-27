const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database');
const { respond, parseDuration, fmtDuration, ts, truncate } = require('../utils/helpers');
const { requireLevel, isMod, isAdmin, missingBotPerms } = require('../utils/permissions');
const { getConfig } = require('../database');
const { COLORS } = require('../config/constants');
const mod = require('../systems/moderation');
const { sendLog } = require('../systems/logging');

async function fetchMember(i, opt = 'user') {
  const user = i.options.getUser(opt);
  const member = await i.guild.members.fetch(user.id).catch(() => null);
  return { user, member };
}

module.exports = {
  data: new SlashCommandBuilder().setName('mod').setDescription('Moderation')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((s) => s.setName('warn').setDescription('Verwarnt einen User').addUserOption((o) => o.setName('user').setDescription('Mitglied').setRequired(true)).addStringOption((o) => o.setName('reason').setDescription('Grund').setRequired(true)))
    .addSubcommand((s) => s.setName('warnings').setDescription('Zeigt Verwarnungen').addUserOption((o) => o.setName('user').setDescription('Mitglied').setRequired(true)))
    .addSubcommand((s) => s.setName('clearwarn').setDescription('Löscht eine Verwarnung').addUserOption((o) => o.setName('user').setDescription('Mitglied').setRequired(true)).addIntegerOption((o) => o.setName('id').setDescription('Warn-ID').setRequired(true)))
    .addSubcommand((s) => s.setName('timeout').setDescription('Timeout geben').addUserOption((o) => o.setName('user').setDescription('Mitglied').setRequired(true)).addStringOption((o) => o.setName('duration').setDescription('z.B. 10m, 1h, 1d').setRequired(true)).addStringOption((o) => o.setName('reason').setDescription('Grund').setRequired(true)))
    .addSubcommand((s) => s.setName('removetimeout').setDescription('Timeout aufheben').addUserOption((o) => o.setName('user').setDescription('Mitglied').setRequired(true)))
    .addSubcommand((s) => s.setName('kick').setDescription('Kickt einen User').addUserOption((o) => o.setName('user').setDescription('Mitglied').setRequired(true)).addStringOption((o) => o.setName('reason').setDescription('Grund').setRequired(true)))
    .addSubcommand((s) => s.setName('ban').setDescription('Bannt einen User').addUserOption((o) => o.setName('user').setDescription('Mitglied').setRequired(true)).addStringOption((o) => o.setName('reason').setDescription('Grund').setRequired(true)).addIntegerOption((o) => o.setName('deletedays').setDescription('Nachrichten der letzten X Tage löschen').setMinValue(0).setMaxValue(7)))
    .addSubcommand((s) => s.setName('unban').setDescription('Hebt einen Bann auf').addStringOption((o) => o.setName('userid').setDescription('User-ID').setRequired(true)).addStringOption((o) => o.setName('reason').setDescription('Grund')))
    .addSubcommand((s) => s.setName('clear').setDescription('Löscht Nachrichten').addIntegerOption((o) => o.setName('amount').setDescription('Anzahl (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)).addUserOption((o) => o.setName('user').setDescription('Nur von diesem User')))
    .addSubcommand((s) => s.setName('slowmode').setDescription('Setzt den Slowmode').addIntegerOption((o) => o.setName('seconds').setDescription('Sekunden (0 = aus)').setRequired(true).setMinValue(0).setMaxValue(21600)))
    .addSubcommand((s) => s.setName('lock').setDescription('Sperrt den aktuellen Kanal'))
    .addSubcommand((s) => s.setName('unlock').setDescription('Entsperrt den aktuellen Kanal')),

  async execute(i) {
    const sub = i.options.getSubcommand();
    const perms = getConfig(i.guildId).permissions;
    const requireModOr = async (allowed, level = 'mod') => {
      if (!allowed && !isAdmin(i.member)) { await respond(i, '⛔ Diese Moderationsfunktion ist für Moderatoren deaktiviert.'); return false; }
      return requireLevel(i, level);
    };

    if (sub === 'warn') {
      if (!(await requireLevel(i, 'mod'))) return;
      const { user, member } = await fetchMember(i);
      const err = member ? mod.checkTarget(i.member, member) : null;
      if (member && err) return respond(i, `❌ ${err}`);
      await i.deferReply({ flags: 64 });
      const r = await mod.warn(i.guild, i.user, user, i.options.getString('reason'));
      return respond(i, `✅ ${user} wurde verwarnt (Warnung #${r.warning.id}, gesamt ${r.count}).${r.autoTimeout ? ' Automatischer Timeout wurde ausgelöst.' : ''}`);
    }
    if (sub === 'warnings') {
      const user = i.options.getUser('user');
      const list = db.userWarnings(i.guildId, user.id).sort((a, b) => b.createdAt - a.createdAt);
      const desc = list.map((w) => `**#${w.id}** von <@${w.moderatorId}> – ${w.reason} (${ts(w.createdAt, 'R')})`).join('\n') || 'Keine Verwarnungen.';
      return respond(i, { embeds: [new EmbedBuilder().setColor(COLORS.orange).setTitle(`⚠️ Verwarnungen von ${user.username}`).setDescription(truncate(desc, 4000))] });
    }
    if (sub === 'clearwarn') {
      if (!(await requireLevel(i, 'mod'))) return;
      const user = i.options.getUser('user');
      const idNum = i.options.getInteger('id');
      if (!db.getWarning(i.guildId, idNum)) return respond(i, '❌ Warnung nicht gefunden.');
      db.deleteWarning(i.guildId, idNum);
      await sendLog(i.guild, 'moderation', { description: `⚠️ Warnung #${idNum} von ${user} wurde durch ${i.user} gelöscht.` });
      return respond(i, `✅ Warnung #${idNum} gelöscht.`);
    }
    if (sub === 'timeout') {
      if (!(await requireModOr(perms.modTimeout))) return;
      const { member } = await fetchMember(i);
      if (!member) return respond(i, '❌ Mitglied nicht gefunden.');
      const ms = parseDuration(i.options.getString('duration'));
      if (!ms || ms < 5000 || ms > 28 * 86400000) return respond(i, '❌ Ungültige Dauer (5 Sek. bis 28 Tage). Beispiel: `10m`, `1h`, `1d`.');
      const err = mod.checkTarget(i.member, member, PermissionFlagsBits.ModerateMembers);
      if (err) return respond(i, `❌ ${err}`);
      await i.deferReply({ flags: 64 });
      await mod.timeoutMember(i.guild, i.user, member, ms, i.options.getString('reason'));
      return respond(i, `✅ ${member} hat einen Timeout für **${fmtDuration(ms)}** erhalten.`);
    }
    if (sub === 'removetimeout') {
      if (!(await requireModOr(perms.modTimeout))) return;
      const { member } = await fetchMember(i);
      if (!member) return respond(i, '❌ Mitglied nicht gefunden.');
      if (!member.communicationDisabledUntil) return respond(i, '❌ Dieses Mitglied hat aktuell keinen Timeout.');
      await i.deferReply({ flags: 64 });
      await mod.removeTimeout(i.guild, i.user, member);
      return respond(i, `✅ Timeout von ${member} aufgehoben.`);
    }
    if (sub === 'kick') {
      if (!(await requireModOr(perms.modKick))) return;
      const { member } = await fetchMember(i);
      if (!member) return respond(i, '❌ Mitglied nicht gefunden.');
      const err = mod.checkTarget(i.member, member, PermissionFlagsBits.KickMembers);
      if (err) return respond(i, `❌ ${err}`);
      await i.deferReply({ flags: 64 });
      await mod.kickMember(i.guild, i.user, member, i.options.getString('reason'));
      return respond(i, `✅ ${member.user.tag} wurde gekickt.`);
    }
    if (sub === 'ban') {
      if (!(await requireModOr(perms.modBan))) return;
      const { user, member } = await fetchMember(i);
      if (member) { const err = mod.checkTarget(i.member, member, PermissionFlagsBits.BanMembers); if (err) return respond(i, `❌ ${err}`); }
      await i.deferReply({ flags: 64 });
      await mod.banUser(i.guild, i.user, user, i.options.getString('reason'), i.options.getInteger('deletedays') || 0);
      return respond(i, `✅ ${user.tag} wurde gebannt.`);
    }
    if (sub === 'unban') {
      if (!(await requireModOr(perms.modBan))) return;
      const id = i.options.getString('userid');
      if (!/^\d{17,20}$/.test(id)) return respond(i, '❌ Ungültige User-ID.');
      await i.deferReply({ flags: 64 });
      try {
        const user = await mod.unbanUser(i.guild, i.user, id, i.options.getString('reason') || 'Kein Grund angegeben');
        return respond(i, `✅ ${user.tag} wurde entbannt.`);
      } catch { return respond(i, '❌ Dieser User ist nicht gebannt oder wurde nicht gefunden.'); }
    }
    if (sub === 'clear') {
      if (!(await requireModOr(perms.modClear))) return;
      const missing = missingBotPerms(i.guild, [PermissionFlagsBits.ManageMessages], i.channel);
      if (missing.length) return respond(i, `❌ Mir fehlt das Recht: ${missing.join(', ')}`);
      await i.deferReply({ flags: 64 });
      const user = i.options.getUser('user');
      const amount = i.options.getInteger('amount');
      const msgs = await i.channel.messages.fetch({ limit: 100 });
      const filtered = [...msgs.filter((m) => (!user || m.author.id === user.id) && Date.now() - m.createdTimestamp < 12 * 24 * 3600000).values()].slice(0, amount);
      if (!filtered.length) return respond(i, '❌ Keine passenden Nachrichten gefunden (max. 14 Tage alt).');
      const deleted = await i.channel.bulkDelete(filtered, true);
      await sendLog(i.guild, 'moderation', { description: `🧹 ${deleted.size} Nachrichten in ${i.channel} gelöscht von ${i.user}.` });
      return respond(i, `✅ ${deleted.size} Nachrichten gelöscht.`);
    }
    if (sub === 'slowmode') {
      if (!(await requireLevel(i, 'mod'))) return;
      const missing = missingBotPerms(i.guild, [PermissionFlagsBits.ManageChannels], i.channel);
      if (missing.length) return respond(i, `❌ Mir fehlt das Recht: ${missing.join(', ')}`);
      await i.channel.setRateLimitPerUser(i.options.getInteger('seconds'));
      return respond(i, `✅ Slowmode gesetzt: ${i.options.getInteger('seconds')} Sek.`, { ephemeral: false });
    }
    if (sub === 'lock' || sub === 'unlock') {
      if (!(await requireLevel(i, 'mod'))) return;
      const missing = missingBotPerms(i.guild, [PermissionFlagsBits.ManageRoles], i.channel);
      if (missing.length) return respond(i, `❌ Mir fehlt das Recht: ${missing.join(', ')}`);
      await i.channel.permissionOverwrites.edit(i.guild.roles.everyone, { SendMessages: sub === 'unlock' ? null : false });
      await sendLog(i.guild, 'moderation', { description: `${sub === 'lock' ? '🔒 Kanal gesperrt' : '🔓 Kanal entsperrt'}: ${i.channel} von ${i.user}` });
      return respond(i, sub === 'lock' ? '🔒 Kanal gesperrt.' : '🔓 Kanal entsperrt.', { ephemeral: false });
    }
  },
};
