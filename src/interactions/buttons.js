const {
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
} = require('discord.js');
const { respond, isHttpUrl, parseHex } = require('../utils/helpers');
const { getTicketByChannel } = require('../database');
const tickets = require('../systems/tickets');
const verification = require('../systems/verification');
const embeds = require('../systems/embeds');
const cfgUi = require('../systems/config/ui');

const reasonModal = (id, title, required = true) => new ModalBuilder().setCustomId(id).setTitle(title)
  .addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId('reason').setLabel('Grund').setStyle(TextInputStyle.Paragraph).setRequired(required).setMaxLength(1000),
  ));

/* ---------- Tickets ---------- */
async function handleTicket(i) {
  const parts = i.customId.split(':'); // ticket:<action>[:<extra>]
  const action = parts[1];

  if (action === 'open') {
    const typeId = parts[2];
    await i.deferReply({ flags: 64 });
    const r = await tickets.openTicket(i.guild, i.member, typeId);
    return respond(i, r.error ? `❌ ${r.error}` : `✅ Ticket erstellt: ${r.channel}`);
  }

  const ticket = getTicketByChannel(i.channelId);
  if (!ticket) return respond(i, '❌ Dieses Ticket existiert nicht mehr.');

  if (action === 'claim') {
    if (!tickets.isStaffFor(i.member, ticket)) return respond(i, '⛔ Nur das Team kann Tickets claimen.');
    if (!ticket.claimedBy) {
      await i.deferUpdate();
      const r = tickets.claim(ticket, i.member);
      if (r.error) return i.followUp({ content: `❌ ${r.error}`, flags: 64 });
      return tickets.afterClaim(i.guild, ticket, i.member, true);
    }
    if (ticket.claimedBy !== i.user.id && !require('../utils/permissions').isAdmin(i.member)) {
      return respond(i, `⛔ Nur <@${ticket.claimedBy}> oder ein Admin kann das Ticket freigeben.`);
    }
    await i.deferUpdate();
    tickets.unclaim(ticket, i.member);
    return tickets.afterClaim(i.guild, ticket, i.member, false);
  }

  if (action === 'close') {
    if (!tickets.canClose(i.member, ticket)) return respond(i, '⛔ Du darfst dieses Ticket nicht schließen.');
    return i.showModal(reasonModal(`ticketm:close:${ticket.number}`, 'Ticket schließen', false));
  }

  if (action === 'transcript') {
    if (!tickets.isStaffFor(i.member, ticket)) return respond(i, '⛔ Nur das Team kann Transkripte erstellen.');
    await i.deferReply({ flags: 64 });
    await tickets.archiveTranscript(i.guild, ticket, i.channel);
    return respond(i, '✅ Transkript erstellt und in den Log-Kanal gesendet.');
  }

  if (['approve', 'reject', 'kick'].includes(action)) {
    if (ticket.typeId !== 'verification') return respond(i, '❌ Das geht nur bei Verifizierungstickets.');
    if (!tickets.isStaffFor(i.member, ticket)) return respond(i, '⛔ Nur das Team kann Verifizierungen bearbeiten.');
    if (action === 'approve') {
      const member = await i.guild.members.fetch(ticket.userId).catch(() => null);
      if (!member) return respond(i, '❌ Dieses Mitglied ist nicht mehr auf dem Server.');
      await i.deferUpdate();
      const r = await verification.approve(i.guild, member, i.member, { ticket });
      if (r.error) return i.followUp({ content: `❌ ${r.error}`, flags: 64 });
      await tickets.closeTicket(i.guild, ticket, i.member, 'Verifizierung genehmigt');
      return i.followUp({ content: `✅ ${member} wurde verifiziert und das Ticket geschlossen.`, flags: 64 });
    }
    return i.showModal(reasonModal(`ticketm:${action}:${ticket.number}`, action === 'kick' ? 'Ablehnen + Kick' : 'Verifizierung ablehnen'));
  }
}

/* ---------- Embed-Builder ---------- */
function field(id, label, opts = {}) {
  const t = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(opts.long ? TextInputStyle.Paragraph : TextInputStyle.Short).setRequired(false);
  if (opts.max) t.setMaxLength(opts.max);
  if (opts.value) t.setValue(String(opts.value).slice(0, opts.max || 4000));
  return t;
}

async function handleEmbed(i) {
  const action = i.customId.split(':')[1];
  const d = embeds.getDraft(i.guildId, i.user.id);
  if (!d) return respond(i, '❌ Kein aktiver Entwurf mehr. Starte neu mit `/embed create`.');

  if (action === 'basic') {
    const m = new ModalBuilder().setCustomId('embedm:basic').setTitle('Text').addComponents(
      new ActionRowBuilder().addComponents(field('title', 'Titel', { max: 250, value: d.title })),
      new ActionRowBuilder().addComponents(field('description', 'Beschreibung', { long: true, max: 3900, value: d.description })),
      new ActionRowBuilder().addComponents(field('color', 'Farbe (Hex, z.B. #5865F2)', { max: 7, value: d.color })),
      new ActionRowBuilder().addComponents(field('url', 'Titel-Link (URL)', { max: 500, value: d.url })),
    );
    return i.showModal(m);
  }
  if (action === 'images') {
    const m = new ModalBuilder().setCustomId('embedm:images').setTitle('Bilder / GIFs').addComponents(
      new ActionRowBuilder().addComponents(field('image', 'Bild-URL (auch GIF)', { max: 500, value: d.image })),
      new ActionRowBuilder().addComponents(field('thumbnail', 'Thumbnail-URL', { max: 500, value: d.thumbnail })),
    );
    return i.showModal(m);
  }
  if (action === 'footer') {
    const m = new ModalBuilder().setCustomId('embedm:footer').setTitle('Footer & Autor').addComponents(
      new ActionRowBuilder().addComponents(field('footerText', 'Footer-Text', { max: 200, value: d.footerText })),
      new ActionRowBuilder().addComponents(field('footerIcon', 'Footer-Icon-URL', { max: 500, value: d.footerIcon })),
      new ActionRowBuilder().addComponents(field('authorName', 'Autor-Name', { max: 200, value: d.authorName })),
      new ActionRowBuilder().addComponents(field('authorIcon', 'Autor-Icon-URL', { max: 500, value: d.authorIcon })),
      new ActionRowBuilder().addComponents(field('authorUrl', 'Autor-Link (URL)', { max: 500, value: d.authorUrl })),
    );
    return i.showModal(m);
  }
  if (action === 'field') {
    if (d.fields.length >= 25) return respond(i, '❌ Maximal 25 Felder pro Embed.');
    const m = new ModalBuilder().setCustomId('embedm:field').setTitle('Feld hinzufügen').addComponents(
      new ActionRowBuilder().addComponents(field('name', 'Name', { max: 250 }).setRequired(true)),
      new ActionRowBuilder().addComponents(field('value', 'Inhalt', { long: true, max: 1000 }).setRequired(true)),
      new ActionRowBuilder().addComponents(field('inline', 'Nebeneinander? (ja/nein)', { max: 5, value: 'nein' })),
    );
    return i.showModal(m);
  }
  if (action === 'link') {
    if (d.buttons.length >= 5) return respond(i, '❌ Maximal 5 Buttons pro Nachricht.');
    const m = new ModalBuilder().setCustomId('embedm:link').setTitle('Button hinzufügen').addComponents(
      new ActionRowBuilder().addComponents(field('label', 'Beschriftung', { max: 80 }).setRequired(true)),
      new ActionRowBuilder().addComponents(field('url', 'Link (URL)', { max: 500 }).setRequired(true)),
      new ActionRowBuilder().addComponents(field('emoji', 'Emoji (optional)', { max: 10 })),
    );
    return i.showModal(m);
  }
  if (action === 'ts') { d.timestamp = !d.timestamp; embeds.touch(d); return i.update(embeds.builderPayload(d, i.guildId)); }
  if (action === 'delfield') { d.fields.pop(); embeds.touch(d); return i.update(embeds.builderPayload(d, i.guildId)); }
  if (action === 'dellink') { d.buttons.pop(); embeds.touch(d); return i.update(embeds.builderPayload(d, i.guildId)); }
  if (action === 'cancel') { embeds.deleteDraft(i.guildId, i.user.id); return i.update({ content: '🗑️ Entwurf verworfen.', embeds: [], components: [] }); }
  if (action === 'sendhere') {
    if (embeds.isEmpty(d)) return respond(i, '❌ Der Embed ist leer.');
    if (d.editTarget) {
      const ch = i.guild.channels.cache.get(d.editTarget.channelId);
      const msg = ch && await ch.messages.fetch(d.editTarget.messageId).catch(() => null);
      if (!msg) return respond(i, '❌ Die zu bearbeitende Nachricht wurde nicht gefunden.');
      await msg.edit(embeds.sendPayload(d, i.guildId));
      embeds.deleteDraft(i.guildId, i.user.id);
      return i.update({ content: '✅ Nachricht wurde aktualisiert.', embeds: [], components: [] });
    }
    if (!i.channel.permissionsFor(i.guild.members.me)?.has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) return respond(i, '❌ Mir fehlen Rechte in diesem Kanal.');
    await i.channel.send(embeds.sendPayload(d, i.guildId));
    embeds.deleteDraft(i.guildId, i.user.id);
    return i.update({ content: '✅ Embed gesendet.', embeds: [], components: [] });
  }
}

/* ---------- Help ---------- */
async function handleHelp(i) {
  // Aktuell keine reinen Help-Buttons – reserviert für Erweiterungen.
  return respond(i, 'Nutze das Auswahlmenü, um eine Kategorie zu wählen.');
}

module.exports = async function buttons(i) {
  const [ns] = i.customId.split(':');
  if (ns === 'ticket') return handleTicket(i);
  if (ns === 'embed') return handleEmbed(i);
  if (ns === 'help') return handleHelp(i);
  if (i.customId === 'cfgmenu') return cfgUi.renderMenu(i);
  if (ns === 'cfgback') return cfgUi.handleBack(i);
};
