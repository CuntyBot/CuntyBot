const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');
const { respond, fmtNum, ts } = require('../utils/helpers');
const { COLORS } = require('../config/constants');

const BOOST_TIER = { 0: 'Keine', 1: 'Stufe 1', 2: 'Stufe 2', 3: 'Stufe 3' };

module.exports = {
  data: new SlashCommandBuilder().setName('server').setDescription('Server-Informationen')
    .addSubcommand((s) => s.setName('info').setDescription('Allgemeine Serverinfos'))
    .addSubcommand((s) => s.setName('membercount').setDescription('Zeigt die Mitgliederanzahl'))
    .addSubcommand((s) => s.setName('roles').setDescription('Zeigt alle Rollen'))
    .addSubcommand((s) => s.setName('channels').setDescription('Zeigt Channel-Statistiken')),

  async execute(i) {
    const sub = i.options.getSubcommand();
    const g = i.guild;

    if (sub === 'info') {
      const owner = await g.fetchOwner().catch(() => null);
      const embed = new EmbedBuilder().setColor(COLORS.primary).setTitle(g.name).setThumbnail(g.iconURL())
        .addFields(
          { name: 'Besitzer', value: owner ? `${owner.user}` : '—', inline: true },
          { name: 'Mitglieder', value: fmtNum(g.memberCount), inline: true },
          { name: 'Erstellt', value: ts(g.createdTimestamp, 'D'), inline: true },
          { name: 'Rollen', value: fmtNum(g.roles.cache.size), inline: true },
          { name: 'Channels', value: fmtNum(g.channels.cache.size), inline: true },
          { name: 'Boosts', value: `${g.premiumSubscriptionCount || 0} (${BOOST_TIER[g.premiumTier] || g.premiumTier})`, inline: true },
        );
      return respond(i, { embeds: [embed] }, { ephemeral: false });
    }
    if (sub === 'membercount') {
      const humans = g.members.cache.filter((m) => !m.user.bot).size;
      const bots = g.memberCount - humans;
      return respond(i, `👥 **${fmtNum(g.memberCount)}** Mitglieder (${fmtNum(humans)} Menschen, ${fmtNum(bots)} Bots)`, { ephemeral: false });
    }
    if (sub === 'roles') {
      const roles = [...g.roles.cache.filter((r) => r.id !== g.id).sort((a, b) => b.position - a.position).values()];
      const desc = roles.slice(0, 40).map((r) => `${r} – ${fmtNum(r.members.size)} Mitglieder`).join('\n');
      return respond(i, { embeds: [new EmbedBuilder().setColor(COLORS.primary).setTitle(`🎭 Rollen (${roles.length})`).setDescription(desc || 'Keine Rollen.')] });
    }
    if (sub === 'channels') {
      const cats = g.channels.cache.filter((c) => c.type === ChannelType.GuildCategory).size;
      const text = g.channels.cache.filter((c) => c.type === ChannelType.GuildText).size;
      const voice = g.channels.cache.filter((c) => c.type === ChannelType.GuildVoice).size;
      const forum = g.channels.cache.filter((c) => c.type === ChannelType.GuildForum).size;
      return respond(i, { embeds: [new EmbedBuilder().setColor(COLORS.primary).setTitle('📺 Channel-Übersicht')
        .addFields({ name: 'Kategorien', value: fmtNum(cats), inline: true }, { name: 'Text', value: fmtNum(text), inline: true }, { name: 'Voice', value: fmtNum(voice), inline: true }, { name: 'Forum', value: fmtNum(forum), inline: true })] });
    }
  },
};
