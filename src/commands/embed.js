const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { respond, isHttpUrl } = require('../utils/helpers');
const embeds = require('../systems/embeds');
const { sendLog } = require('../systems/logging');

module.exports = {
  data: new SlashCommandBuilder().setName('embed').setDescription('Embed-Builder')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((s) => s.setName('create').setDescription('Startet einen neuen Embed-Entwurf'))
    .addSubcommand((s) => s.setName('preview').setDescription('Zeigt die aktuelle Vorschau'))
    .addSubcommand((s) => s.setName('send').setDescription('Sendet den Embed').addChannelOption((o) => o.setName('channel').setDescription('Zielkanal').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
    .addSubcommand((s) => s.setName('edit').setDescription('Lädt eine bestehende Bot-Nachricht zum Bearbeiten').addStringOption((o) => o.setName('messageid').setDescription('Nachrichten-ID').setRequired(true)))
    .addSubcommand((s) => s.setName('cancel').setDescription('Bricht den aktuellen Entwurf ab')),

  async execute(i) {
    if (!embeds.canUseEmbeds(i.member)) return respond(i, '⛔ Du darfst den Embed-Builder nicht verwenden.');
    const sub = i.options.getSubcommand();

    if (sub === 'create') {
      embeds.newDraft(i.guildId, i.user.id);
      return respond(i, embeds.builderPayload(embeds.getDraft(i.guildId, i.user.id), i.guildId));
    }
    if (sub === 'preview') {
      const d = embeds.getDraft(i.guildId, i.user.id);
      if (!d) return respond(i, '❌ Kein aktiver Entwurf. Starte mit `/embed create`.');
      return respond(i, embeds.previewPayload(d, i.guildId));
    }
    if (sub === 'cancel') {
      if (!embeds.getDraft(i.guildId, i.user.id)) return respond(i, '❌ Kein aktiver Entwurf.');
      embeds.deleteDraft(i.guildId, i.user.id);
      return respond(i, '🗑️ Entwurf verworfen.');
    }
    if (sub === 'edit') {
      const id = i.options.getString('messageid');
      if (!/^\d{17,20}$/.test(id)) return respond(i, '❌ Ungültige Nachrichten-ID.');
      const msg = await i.channel.messages.fetch(id).catch(() => null);
      if (!msg) return respond(i, '❌ Nachricht nicht in diesem Kanal gefunden.');
      if (msg.author.id !== i.client.user.id) return respond(i, '❌ Ich kann nur meine eigenen Nachrichten bearbeiten.');
      if (!msg.embeds.length) return respond(i, '❌ Diese Nachricht enthält keinen Embed.');
      const d = embeds.draftFromMessage(msg, i.guildId, i.user.id, i.channelId);
      return respond(i, embeds.builderPayload(d, i.guildId));
    }
    if (sub === 'send') {
      const d = embeds.getDraft(i.guildId, i.user.id);
      if (!d || embeds.isEmpty(d)) return respond(i, '❌ Kein Inhalt zum Senden. Starte mit `/embed create`.');
      const channel = i.options.getChannel('channel');
      const perms = channel.permissionsFor(i.guild.members.me);
      if (!perms?.has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) return respond(i, `❌ Mir fehlen Rechte in ${channel}.`);
      await channel.send(embeds.sendPayload(d, i.guildId));
      embeds.deleteDraft(i.guildId, i.user.id);
      await sendLog(i.guild, 'botActions', { description: `🎨 Embed gesendet in ${channel} von ${i.user}.` });
      return respond(i, `✅ Embed wurde in ${channel} gesendet.`);
    }
  },
};
