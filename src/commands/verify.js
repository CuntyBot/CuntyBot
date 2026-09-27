const { SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { respond, truncate } = require('../utils/helpers');
const { requireLevel, isTicketTeam } = require('../utils/permissions');
const { COLORS } = require('../config/constants');
const verification = require('../systems/verification');
const tickets = require('../systems/tickets');
const { areaView, guardArea } = require('../systems/config');

module.exports = {
  data: new SlashCommandBuilder().setName('verify').setDescription('Verifizierungs-System')
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)
    .addSubcommand((s) => s.setName('setup').setDescription('Sendet das Verifizierungs-Panel (Admin)')
      .addChannelOption((o) => o.setName('channel').setDescription('Kanal für das Panel').addChannelTypes(ChannelType.GuildText).setRequired(true)))
    .addSubcommand((s) => s.setName('status').setDescription('Zeigt deinen Verifizierungsstatus'))
    .addSubcommand((s) => s.setName('user').setDescription('Zeigt den Status eines Users (Team)').addUserOption((o) => o.setName('user').setDescription('Mitglied').setRequired(true)))
    .addSubcommand((s) => s.setName('approve').setDescription('Verifiziert einen User manuell (Team)').addUserOption((o) => o.setName('user').setDescription('Mitglied').setRequired(true)))
    .addSubcommand((s) => s.setName('reject').setDescription('Lehnt einen User ab (Team)')
      .addUserOption((o) => o.setName('user').setDescription('Mitglied').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('Grund').setRequired(true))
      .addBooleanOption((o) => o.setName('kick').setDescription('Zusätzlich kicken?')))
    .addSubcommand((s) => s.setName('config').setDescription('Verifizierungs-Konfiguration (Admin)')),

  async execute(i) {
    const sub = i.options.getSubcommand();

    if (sub === 'setup') {
      if (!(await requireLevel(i, 'admin'))) return;
      const channel = i.options.getChannel('channel');
      await i.deferReply({ flags: 64 });
      const { warnings } = await verification.sendPanel(i.guild, channel);
      return respond(i, `✅ Verifizierungs-Panel wurde in ${channel} gesendet.${warnings.length ? `\n⚠️ ${warnings.join(' ')}` : ''}`);
    }

    if (sub === 'status') {
      const s = verification.getStatus(i.guild, i.user.id, i.member);
      const lines = [`**Status:** ${verification.STATUS_LABEL[s.status]}`];
      if (s.ticket) lines.push(`**Ticket:** <#${s.ticket.channelId}>`);
      if (s.status === 'rejected' && s.data?.reason) lines.push(`**Grund:** ${s.data.reason}`);
      return respond(i, { embeds: [new EmbedBuilder().setColor(COLORS.primary).setTitle('✅ Dein Verifizierungsstatus').setDescription(lines.join('\n'))] });
    }

    if (sub === 'user') {
      if (!(await requireLevel(i, 'ticket'))) return;
      const user = i.options.getUser('user');
      const member = await i.guild.members.fetch(user.id).catch(() => null);
      const s = verification.getStatus(i.guild, user.id, member);
      const lines = [`**Status:** ${verification.STATUS_LABEL[s.status]}`];
      if (s.ticket) lines.push(`**Ticket:** <#${s.ticket.channelId}>`);
      if (s.data?.by) lines.push(`**Bearbeiter:** <@${s.data.by}>`);
      if (s.data?.reason) lines.push(`**Grund:** ${s.data.reason}`);
      return respond(i, { embeds: [new EmbedBuilder().setColor(COLORS.primary).setAuthor({ name: `Status von ${user.username}`, iconURL: user.displayAvatarURL() }).setDescription(lines.join('\n'))] });
    }

    if (sub === 'approve') {
      if (!(await requireLevel(i, 'ticket'))) return;
      const member = await i.guild.members.fetch(i.options.getUser('user').id).catch(() => null);
      if (!member) return respond(i, '❌ Dieses Mitglied ist nicht mehr auf dem Server.');
      await i.deferReply({ flags: 64 });
      const r = await verification.approve(i.guild, member, i.member);
      return respond(i, r.error ? `❌ ${r.error}` : `✅ ${member} wurde verifiziert.`);
    }

    if (sub === 'reject') {
      if (!(await requireLevel(i, 'ticket'))) return;
      const user = i.options.getUser('user');
      const member = await i.guild.members.fetch(user.id).catch(() => null);
      const reason = i.options.getString('reason');
      await i.deferReply({ flags: 64 });
      const r = await verification.reject(i.guild, user, member, i.member, reason, { kick: i.options.getBoolean('kick') || false });
      return respond(i, `✅ ${user} wurde abgelehnt.${r.kicked ? ' Und gekickt.' : ''}${r.kickError ? `\n⚠️ Kick fehlgeschlagen: ${r.kickError}` : ''}`);
    }

    if (sub === 'config') { if (!(await guardArea(i, 'verification'))) return; return respond(i, areaView(i.guild, 'verification')); }
  },
};
