const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { respond } = require('../utils/helpers');
const { getTicketByChannel } = require('../database');
const tickets = require('../systems/tickets');
const help = require('../commands/help');
const cfgUi = require('../systems/config/ui');

async function handleTicketSelect(i) {
  if (i.customId === 'ticket:priority') {
    const ticket = getTicketByChannel(i.channelId);
    if (!ticket) return respond(i, '❌ Dieses Ticket existiert nicht mehr.');
    if (!tickets.isStaffFor(i.member, ticket)) return respond(i, '⛔ Nur das Team kann die Priorität ändern.');
    await i.deferUpdate();
    return tickets.setPriority(i.guild, ticket, i.values[0]);
  }
  if (i.customId === 'ticket:panelselect') {
    await i.deferReply({ flags: 64 });
    const r = await tickets.openTicket(i.guild, i.member, i.values[0]);
    return respond(i, r.error ? `❌ ${r.error}` : `✅ Ticket erstellt: ${r.channel}`);
  }
}

async function handleHelpSelect(i) {
  const key = i.values[0];
  const cat = help.CATEGORIES[key];
  if (!cat || !cat.check(i.member)) return respond(i, '⛔ Keine Berechtigung.');
  const available = Object.entries(help.CATEGORIES).filter(([, c]) => c.check(i.member));
  const select = new StringSelectMenuBuilder().setCustomId('help:pick').setPlaceholder('Kategorie auswählen …')
    .addOptions(available.map(([k, c]) => ({ label: c.label.replace(/^[^\s]+\s/, ''), value: k, default: k === key })));
  await i.update({ embeds: [help.buildEmbed(i.member, key)], components: [new ActionRowBuilder().addComponents(select)] });
}

module.exports = async function selectMenus(i) {
  if (i.customId.startsWith('ticket:')) return handleTicketSelect(i);
  if (i.customId === 'help:pick') return handleHelpSelect(i);

  if (i.customId === 'cfgmenu') return cfgUi.renderArea(i, i.values[0]);
  if (i.customId.startsWith('cfgpick:')) return cfgUi.handlePick(i);
  if (i.customId.startsWith('cfgenum:')) return cfgUi.handleEnum(i);
  if (i.customId.startsWith('cfgrole:')) return cfgUi.handleRole(i);
  if (i.customId.startsWith('cfgchan:')) return cfgUi.handleChannel(i);
};
