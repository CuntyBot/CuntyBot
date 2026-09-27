const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../database');
const { respond, truncate, ts, postTo } = require('../utils/helpers');
const { requireLevel, isMod } = require('../utils/permissions');
const { COLORS } = require('../config/constants');
const { sendLog } = require('../systems/logging');

const STATUS = { open: '🟠 Offen', closed: '✅ Geschlossen' };

module.exports = {
  data: new SlashCommandBuilder().setName('report').setDescription('Melde User oder Vorfälle')
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)
    .addSubcommand((s) => s.setName('create').setDescription('Erstellt einen Report')
      .addUserOption((o) => o.setName('user').setDescription('Gemeldeter User').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('Grund').setRequired(true)))
    .addSubcommand((s) => s.setName('list').setDescription('Zeigt offene Reports (Team)'))
    .addSubcommand((s) => s.setName('view').setDescription('Zeigt einen Report').addIntegerOption((o) => o.setName('id').setDescription('Report-ID').setRequired(true)))
    .addSubcommand((s) => s.setName('close').setDescription('Schließt einen Report (Team)').addIntegerOption((o) => o.setName('id').setDescription('Report-ID').setRequired(true)))
    .addSubcommand((s) => s.setName('delete').setDescription('Löscht einen Report (Admin)').addIntegerOption((o) => o.setName('id').setDescription('Report-ID').setRequired(true))),

  async execute(i) {
    const sub = i.options.getSubcommand();

    if (sub === 'create') {
      const target = i.options.getUser('user');
      if (target.id === i.user.id) return respond(i, '❌ Du kannst dich nicht selbst melden.');
      const id = db.nextId(i.guildId, 'report');
      const reason = truncate(i.options.getString('reason'), 1000);
      const report = db.createReport({ guildId: i.guildId, id, reporterId: i.user.id, targetId: target.id, reason, status: 'open', createdAt: Date.now(), closedBy: null });
      const cfg = db.getConfig(i.guildId);
      const embed = new EmbedBuilder().setColor(COLORS.orange).setTitle(`🚨 Neuer Report #${id}`)
        .addFields({ name: 'Melder', value: `${i.user}`, inline: true }, { name: 'Gemeldet', value: `${target}`, inline: true }, { name: 'Grund', value: reason });
      await postTo(i.guild, cfg.channels.REPORTS || cfg.channels.LOGS, { embeds: [embed] });
      await sendLog(i.guild, 'moderation', { title: `🚨 Report #${id} erstellt`, fields: [{ name: 'Melder', value: `${i.user}` }, { name: 'Gemeldet', value: `${target}` }, { name: 'Grund', value: reason }] });
      return respond(i, `✅ Report #${id} wurde erstellt. Das Team wird sich darum kümmern.`);
    }

    if (sub === 'list') {
      if (!(await requireLevel(i, 'mod'))) return;
      const open = db.guildReports(i.guildId).filter((r) => r.status === 'open').sort((a, b) => a.id - b.id);
      const desc = open.map((r) => `**#${r.id}** – Gemeldet: <@${r.targetId}> von <@${r.reporterId}> – ${ts(r.createdAt, 'R')}`).join('\n') || 'Keine offenen Reports.';
      return respond(i, { embeds: [new EmbedBuilder().setColor(COLORS.orange).setTitle('🚨 Offene Reports').setDescription(truncate(desc, 4000))] });
    }

    if (sub === 'view') {
      const r = db.getReport(i.guildId, i.options.getInteger('id'));
      if (!r) return respond(i, '❌ Report nicht gefunden.');
      if (!isMod(i.member) && r.reporterId !== i.user.id) return respond(i, '⛔ Du darfst diesen Report nicht einsehen.');
      return respond(i, { embeds: [new EmbedBuilder().setColor(COLORS.orange).setTitle(`🚨 Report #${r.id}`)
        .addFields(
          { name: 'Status', value: STATUS[r.status], inline: true }, { name: 'Melder', value: `<@${r.reporterId}>`, inline: true },
          { name: 'Gemeldet', value: `<@${r.targetId}>`, inline: true }, { name: 'Grund', value: r.reason }, { name: 'Erstellt', value: ts(r.createdAt, 'F') },
          ...(r.closedBy ? [{ name: 'Geschlossen von', value: `<@${r.closedBy}>` }] : []),
        )] });
    }

    if (sub === 'close') {
      if (!(await requireLevel(i, 'mod'))) return;
      const r = db.getReport(i.guildId, i.options.getInteger('id'));
      if (!r) return respond(i, '❌ Report nicht gefunden.');
      r.status = 'closed'; r.closedBy = i.user.id; db.save();
      await sendLog(i.guild, 'moderation', { description: `🚨 Report #${r.id} wurde von ${i.user} geschlossen.` });
      return respond(i, `✅ Report #${r.id} geschlossen.`);
    }

    if (sub === 'delete') {
      if (!(await requireLevel(i, 'admin'))) return;
      if (!db.getReport(i.guildId, i.options.getInteger('id'))) return respond(i, '❌ Report nicht gefunden.');
      db.deleteReport(i.guildId, i.options.getInteger('id'));
      return respond(i, `✅ Report #${i.options.getInteger('id')} gelöscht.`);
    }
  },
};
