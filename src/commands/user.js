const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { respond, fmtNum, ts } = require('../utils/helpers');
const { COLORS } = require('../config/constants');
const { peekUser } = require('../database');
const { levelFromXp } = require('../systems/xp/kinds');
const verification = require('../systems/verification');

module.exports = {
  data: new SlashCommandBuilder().setName('user').setDescription('User-Informationen')
    .addSubcommand((s) => s.setName('info').setDescription('Zeigt Informationen über einen User').addUserOption((o) => o.setName('user').setDescription('Mitglied')))
    .addSubcommand((s) => s.setName('avatar').setDescription('Zeigt das Profilbild').addUserOption((o) => o.setName('user').setDescription('Mitglied')))
    .addSubcommand((s) => s.setName('banner').setDescription('Zeigt das Banner').addUserOption((o) => o.setName('user').setDescription('Mitglied'))),

  async execute(i) {
    const sub = i.options.getSubcommand();
    const target = i.options.getUser('user') || i.user;

    if (sub === 'info') {
      const member = await i.guild.members.fetch(target.id).catch(() => null);
      const u = peekUser(i.guildId, target.id);
      const status = verification.getStatus(i.guild, target.id, member);
      const embed = new EmbedBuilder().setColor(COLORS.primary).setTitle(target.tag).setThumbnail(target.displayAvatarURL())
        .addFields(
          { name: 'User-ID', value: target.id, inline: true },
          { name: 'Account erstellt', value: ts(target.createdTimestamp, 'D'), inline: true },
          { name: 'Server beigetreten', value: member ? ts(member.joinedTimestamp, 'D') : '—', inline: true },
          { name: 'Verifizierung', value: verification.STATUS_LABEL[status.status], inline: true },
          { name: '💬 Text-Level', value: u ? `Level ${levelFromXp(u.xp).level} (${fmtNum(u.xp)} XP)` : 'Level 0 (0 XP)', inline: true },
          { name: '🎙️ Voice-Level', value: u ? `Level ${levelFromXp(u.voiceXp).level} (${fmtNum(u.voiceXp)} XP)` : 'Level 0 (0 XP)', inline: true },
          { name: `Rollen (${member?.roles.cache.size ? member.roles.cache.size - 1 : 0})`, value: member ? [...member.roles.cache.filter((r) => r.id !== i.guildId).values()].map((r) => r.toString()).join(', ') || '*keine*' : '—' },
        );
      return respond(i, { embeds: [embed] }, { ephemeral: false });
    }
    if (sub === 'avatar') {
      return respond(i, { embeds: [new EmbedBuilder().setColor(COLORS.primary).setTitle(`Avatar von ${target.username}`).setImage(target.displayAvatarURL({ size: 1024 }))] }, { ephemeral: false });
    }
    if (sub === 'banner') {
      const fetched = await i.client.users.fetch(target.id, { force: true });
      const banner = fetched.bannerURL({ size: 1024 });
      if (!banner) return respond(i, `${target.username} hat kein Banner.`);
      return respond(i, { embeds: [new EmbedBuilder().setColor(COLORS.primary).setTitle(`Banner von ${target.username}`).setImage(banner)] }, { ephemeral: false });
    }
  },
};
