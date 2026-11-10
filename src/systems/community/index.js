const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const db = require('../../database');
const { COLORS } = require('../../config/constants');

function cfg(guildId) {
  const c = db.getConfig(guildId);
  c.community ||= {};
  c.community.welcome ||= { enabled: false, channelId: null, title: 'Willkommen!', message: 'Hey {user}, willkommen auf **{server}**! Du bist Mitglied Nummer **{membercount}**.' };
  c.community.goodbye ||= { enabled: false, channelId: null, title: 'Auf Wiedersehen!', message: '**{username}** hat den Server verlassen. Wir wünschen alles Gute!' };
  c.community.kummer ||= { enabled: false, channelId: null, title: '📮 Kummerkasten', description: 'Hast du etwas, das dich beschäftigt? Teile es anonym mit der Community.' };
  c.community.selfroles ||= [];
  return c.community;
}
function render(text, member) {
  return String(text || '').replaceAll('{user}', `<@${member.id}>`).replaceAll('{username}', member.user.username)
    .replaceAll('{tag}', member.user.tag).replaceAll('{userid}', member.id).replaceAll('{server}', member.guild.name)
    .replaceAll('{membercount}', String(member.guild.memberCount)).replaceAll('{createdat}', `<t:${Math.floor(member.user.createdTimestamp / 1000)}:D>`);
}
async function sendMemberMessage(member, kind) {
  const settings = cfg(member.guild.id)[kind];
  if (!settings?.enabled || !settings.channelId) return;
  const channel = await member.guild.channels.fetch(settings.channelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  const embed = new EmbedBuilder().setColor(kind === 'welcome' ? COLORS.success : COLORS.primary)
    .setTitle(settings.title || (kind === 'welcome' ? 'Willkommen!' : 'Auf Wiedersehen!'))
    .setDescription(render(settings.message, member)).setTimestamp();
  if (kind === 'welcome') embed.setThumbnail(member.user.displayAvatarURL());
  await channel.send({ embeds: [embed] }).catch(() => {});
}
async function postKummerPanel(channel, settings) {
  const embed = new EmbedBuilder().setColor(COLORS.primary).setTitle(settings.title).setDescription(settings.description);
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('kummer:open').setLabel('Kummer teilen').setEmoji('📮').setStyle(ButtonStyle.Primary));
  return channel.send({ embeds: [embed], components: [row] });
}
async function postSelfRolePanel(channel, title, roleIds) {
  const roles = roleIds.map(id => channel.guild.roles.cache.get(id)).filter(Boolean).filter(r => !r.managed && r.id !== channel.guild.id);
  if (!roles.length) throw new Error('Keine gültigen Rollen angegeben.');
  const embed = new EmbedBuilder().setColor(COLORS.primary).setTitle(title).setDescription('Wähle deine Rollen aus. Eine erneute Auswahl entfernt die jeweilige Rolle wieder.');
  const menu = new StringSelectMenuBuilder().setCustomId('selfrole:select').setPlaceholder('Rollen auswählen …').setMinValues(1).setMaxValues(Math.min(roles.length, 25))
    .addOptions(roles.slice(0,25).map(r => ({ label: r.name.slice(0,100), value: r.id })));
  return channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
}
module.exports = { cfg, render, sendMemberMessage, postKummerPanel, postSelfRolePanel };
