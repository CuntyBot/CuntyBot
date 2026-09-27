const { respond, isHttpUrl, parseHex, truncate } = require('../utils/helpers');
const { getTicket } = require('../database');
const tickets = require('../systems/tickets');
const verification = require('../systems/verification');
const embeds = require('../systems/embeds');
const cfgUi = require('../systems/config/ui');

const val = (i, id) => { try { return i.fields.getTextInputValue(id); } catch { return ''; } };

/* ---------- Tickets ---------- */
async function handleTicketModal(i) {
  const [, action, numberStr] = i.customId.split(':');
  const ticket = getTicket(i.guildId, Number(numberStr));
  if (!ticket || ticket.status !== 'open') return respond(i, '❌ Dieses Ticket ist nicht mehr offen.');
  const reason = truncate(val(i, 'reason') || 'Kein Grund angegeben', 1000);

  if (action === 'close') {
    await i.deferUpdate();
    return tickets.closeTicket(i.guild, ticket, i.member, reason);
  }
  if (action === 'reject' || action === 'kick') {
    const user = await i.client.users.fetch(ticket.userId).catch(() => null);
    const member = await i.guild.members.fetch(ticket.userId).catch(() => null);
    if (!user) return respond(i, '❌ User nicht gefunden.');
    await i.deferUpdate();
    const r = await verification.reject(i.guild, user, member, i.member, reason, { kick: action === 'kick', ticket });
    await tickets.closeTicket(i.guild, ticket, i.member, `Verifizierung abgelehnt: ${reason}`);
    return i.followUp({ content: `✅ ${user} wurde abgelehnt.${r.kicked ? ' Und gekickt.' : ''}`, flags: 64 });
  }
}

/* ---------- Embed-Builder ---------- */
async function handleEmbedModal(i) {
  const action = i.customId.split(':')[1];
  const d = embeds.getDraft(i.guildId, i.user.id);
  if (!d) return respond(i, '❌ Entwurf abgelaufen. Starte neu mit `/embed create`.');

  const checkUrl = (v, label) => (v && !isHttpUrl(v) ? `${label} ist keine gültige URL.` : null);

  if (action === 'basic') {
    const color = val(i, 'color');
    if (color && parseHex(color) === null) return respond(i, '❌ Ungültige Farbe. Beispiel: #5865F2');
    const url = val(i, 'url');
    const err = checkUrl(url, 'Der Titel-Link');
    if (err) return respond(i, `❌ ${err}`);
    d.title = val(i, 'title') || null;
    d.description = val(i, 'description') || null;
    d.color = color || null;
    d.url = url || null;
  } else if (action === 'images') {
    const image = val(i, 'image'); const thumb = val(i, 'thumbnail');
    const err = checkUrl(image, 'Das Bild') || checkUrl(thumb, 'Das Thumbnail');
    if (err) return respond(i, `❌ ${err}`);
    d.image = image || null; d.thumbnail = thumb || null;
  } else if (action === 'footer') {
    const fIcon = val(i, 'footerIcon'); const aIcon = val(i, 'authorIcon'); const aUrl = val(i, 'authorUrl');
    const err = checkUrl(fIcon, 'Das Footer-Icon') || checkUrl(aIcon, 'Das Autor-Icon') || checkUrl(aUrl, 'Der Autor-Link');
    if (err) return respond(i, `❌ ${err}`);
    d.footerText = val(i, 'footerText') || null; d.footerIcon = fIcon || null;
    d.authorName = val(i, 'authorName') || null; d.authorIcon = aIcon || null; d.authorUrl = aUrl || null;
  } else if (action === 'field') {
    d.fields.push({ name: val(i, 'name'), value: val(i, 'value'), inline: /^j/i.test(val(i, 'inline') || '') });
  } else if (action === 'link') {
    const url = val(i, 'url');
    if (!isHttpUrl(url)) return respond(i, '❌ Ungültige Button-URL.');
    d.buttons.push({ label: val(i, 'label'), url, emoji: val(i, 'emoji') || null });
  }
  embeds.touch(d);
  return i.update(embeds.builderPayload(d, i.guildId));
}

module.exports = async function modals(i) {
  if (i.customId.startsWith('ticketm:')) return handleTicketModal(i);
  if (i.customId.startsWith('embedm:')) return handleEmbedModal(i);
  if (i.customId.startsWith('cfgmodal:')) return cfgUi.handleModal(i);
};
