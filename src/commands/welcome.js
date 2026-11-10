const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { respond } = require('../utils/helpers');
const community = require('../systems/community');
module.exports = {
 data: new SlashCommandBuilder().setName('welcome').setDescription('Welcome-Nachrichten konfigurieren')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand(s=>s.setName('setup').setDescription('Welcome-Nachricht einrichten').addChannelOption(o=>o.setName('channel').setDescription('Zielkanal').addChannelTypes(ChannelType.GuildText).setRequired(true)).addStringOption(o=>o.setName('message').setDescription('Text; Platzhalter: {user}, {server}, {membercount}').setRequired(true).setMaxLength(1800)).addStringOption(o=>o.setName('title').setDescription('Embed-Titel').setMaxLength(250)))
  .addSubcommand(s=>s.setName('disable').setDescription('Welcome deaktivieren'))
  .addSubcommand(s=>s.setName('test').setDescription('Welcome-Testnachricht senden')),
 async execute(i){const c=community.cfg(i.guildId).welcome; const sub=i.options.getSubcommand();
  if(sub==='setup'){c.channelId=i.options.getChannel('channel').id;c.message=i.options.getString('message');c.title=i.options.getString('title')||'Willkommen!';c.enabled=true;require('../database').save();return respond(i,'✅ Welcome-System gespeichert.');}
  if(sub==='disable'){c.enabled=false;require('../database').save();return respond(i,'✅ Welcome-System deaktiviert.');}
  if(!c.enabled||!c.channelId)return respond(i,'❌ Richte zuerst `/welcome setup` ein.');
  const ch=await i.guild.channels.fetch(c.channelId).catch(()=>null);if(!ch)return respond(i,'❌ Der Welcome-Kanal wurde nicht gefunden.');
  const { EmbedBuilder }=require('discord.js');const fake=i.member;const desc=community.render(c.message,fake);
  await ch.send({embeds:[new EmbedBuilder().setColor(0x57f287).setTitle(c.title).setDescription(desc).setThumbnail(i.user.displayAvatarURL()).setTimestamp()]});return respond(i,'✅ Testnachricht gesendet.');}
};
