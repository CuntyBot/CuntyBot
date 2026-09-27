const {
  SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
} = require('discord.js');
const { respond, truncate, parseHex, pad4 } = require('../utils/helpers');
const { requireLevel, isTicketTeam, isAdmin } = require('../utils/permissions');
const { COLORS, PRIORITIES } = require('../config/constants');
const { getConfig, getTicketByChannel, save } = require('../database');
const tickets = require('../systems/tickets');
const { areaView, guardArea } = require('../systems/config');

function currentTicket(i) {
  const t = getTicketByChannel(i.channelId);
  if (!t || t.guildId !== i.guildId) return null;
  return t;
}

module.exports = {
  data: new SlashCommandBuilder().setName('ticket').setDescription('Ticket-System')
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)
    .addSubcommand((s) => s.setName('setup').setDescription('Sendet ein Ticket-Panel (Admin)')
      .addChannelOption((o) => o.setName('channel').setDescription('Kanal für das Panel').addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addStringOption((o) => o.setName('title').setDescription('Titel des Panels').setRequired(true))
      .addStringOption((o) => o.setName('description').setDescription('Beschreibung').setRequired(true))
      .addStringOption((o) => o.setName('types').setDescription('Typ-IDs, Komma-getrennt (leer = alle)'))
      .addStringOption((o) => o.setName('style').setDescription('Anzeige').addChoices({ name: 'Buttons', value: 'buttons' }, { name: 'Auswahlmenü', value: 'menu' })))
    .addSubcommand((s) => s.setName('create').setDescription('Erstellt manuell ein Ticket')
      .addStringOption((o) => o.setName('type').setDescription('Tickettyp').setRequired(true).setAutocomplete(true))
      .addStringOption((o) => o.setName('reason').setDescription('Kurze Beschreibung deines Anliegens')))
    .addSubcommand((s) => s.setName('close').setDescription('Schließt das aktuelle Ticket').addStringOption((o) => o.setName('reason').setDescription('Grund')))
    .addSubcommand((s) => s.setName('claim').setDescription('Claimt das aktuelle Ticket'))
    .addSubcommand((s) => s.setName('unclaim').setDescription('Gibt das Ticket wieder frei'))
    .addSubcommand((s) => s.setName('add').setDescription('Fügt einen User hinzu').addUserOption((o) => o.setName('user').setDescription('Mitglied').setRequired(true)))
    .addSubcommand((s) => s.setName('remove').setDescription('Entfernt einen User').addUserOption((o) => o.setName('user').setDescription('Mitglied').setRequired(true)))
    .addSubcommand((s) => s.setName('rename').setDescription('Benennt das Ticket um').addStringOption((o) => o.setName('name').setDescription('Neuer Name').setRequired(true).setMaxLength(90)))
    .addSubcommand((s) => s.setName('priority').setDescription('Setzt die Priorität')
      .addStringOption((o) => o.setName('priority').setDescription('Priorität').setRequired(true).addChoices(...Object.entries(PRIORITIES).map(([v, p]) => ({ name: p.label, value: v })))))
    .addSubcommand((s) => s.setName('transcript').setDescription('Erstellt ein Transkript'))
    .addSubcommand((s) => s.setName('delete').setDescription('Löscht das Ticket sofort'))
    .addSubcommand((s) => s.setName('info').setDescription('Zeigt Informationen zum Ticket'))
    .addSubcommand((s) => s.setName('types').setDescription('Zeigt die verfügbaren Tickettypen'))
    .addSubcommand((s) => s.setName('config').setDescription('Ticket-Konfiguration (Admin)'))
    .addSubcommandGroup((g) => g.setName('type').setDescription('Tickettypen verwalten (Admin)')
      .addSubcommand((s) => s.setName('create').setDescription('Neuen Tickettyp erstellen')
        .addStringOption((o) => o.setName('id').setDescription('Eindeutige ID (z.B. bugreport)').setRequired(true).setMaxLength(30))
        .addStringOption((o) => o.setName('name').setDescription('Anzeigename').setRequired(true))
        .addStringOption((o) => o.setName('emoji').setDescription('Emoji').setRequired(true))
        .addStringOption((o) => o.setName('description').setDescription('Beschreibung im Panel').setRequired(true))
        .addRoleOption((o) => o.setName('role').setDescription('Rolle, die Tickets sehen darf').setRequired(true))
        .addChannelOption((o) => o.setName('category').setDescription('Kategorie für die Kanäle').addChannelTypes(ChannelType.GuildCategory))
        .addStringOption((o) => o.setName('color').setDescription('Hex-Farbe, z.B. #5865F2'))
        .addStringOption((o) => o.setName('buttonlabel').setDescription('Text auf dem Button'))
        .addStringOption((o) => o.setName('style').setDescription('Button-Farbe').addChoices({ name: 'Blau', value: 'primary' }, { name: 'Grau', value: 'secondary' }, { name: 'Grün', value: 'success' }, { name: 'Rot', value: 'danger' })))
      .addSubcommand((s) => s.setName('edit').setDescription('Tickettyp bearbeiten')
        .addStringOption((o) => o.setName('id').setDescription('ID des Typs').setRequired(true).setAutocomplete(true))
        .addStringOption((o) => o.setName('name').setDescription('Neuer Anzeigename'))
        .addStringOption((o) => o.setName('emoji').setDescription('Neues Emoji'))
        .addStringOption((o) => o.setName('description').setDescription('Neue Beschreibung'))
        .addRoleOption((o) => o.setName('role').setDescription('Neue Rolle'))
        .addChannelOption((o) => o.setName('category').setDescription('Neue Kategorie').addChannelTypes(ChannelType.GuildCategory))
        .addStringOption((o) => o.setName('color').setDescription('Neue Hex-Farbe')))
      .addSubcommand((s) => s.setName('delete').setDescription('Tickettyp löschen').addStringOption((o) => o.setName('id').setDescription('ID des Typs').setRequired(true).setAutocomplete(true)))),

  async autocomplete(i) {
    const cfg = getConfig(i.guildId);
    const focused = i.options.getFocused().toLowerCase();
    const list = tickets.allTypes(cfg).filter((t) => t.id.includes(focused) || t.name.toLowerCase().includes(focused));
    await i.respond(list.slice(0, 25).map((t) => ({ name: `${t.emoji} ${t.name} (${t.id})`, value: t.id })));
  },

  async execute(i) {
    const group = i.options.getSubcommandGroup(false);
    const sub = i.options.getSubcommand();
    const cfg = getConfig(i.guildId);

    if (group === 'type') {
      if (!(await requireLevel(i, 'admin'))) return;
      const id = i.options.getString('id').toLowerCase().replace(/[^a-z0-9_-]/g, '');
      if (sub === 'create') {
        if (cfg.tickets.types[id]) return respond(i, '❌ Diese ID existiert bereits.');
        const color = i.options.getString('color');
        if (color && parseHex(color) === null) return respond(i, '❌ Ungültige Hex-Farbe.');
        cfg.tickets.types[id] = {
          name: i.options.getString('name'), emoji: i.options.getString('emoji'), description: i.options.getString('description'),
          roleKeys: [], roleIds: [i.options.getRole('role').id], categoryKey: null, categoryId: i.options.getChannel('category')?.id || null,
          color: color || '#5865F2', buttonLabel: i.options.getString('buttonlabel') || null, buttonStyle: i.options.getString('style') || 'primary',
        };
        save();
        return respond(i, `✅ Tickettyp **${id}** wurde erstellt.`);
      }
      if (sub === 'edit') {
        const t = cfg.tickets.types[id];
        if (!t) return respond(i, '❌ Diesen Tickettyp gibt es nicht.');
        if (t.system) return respond(i, '❌ Der Verifizierungstyp kann nicht bearbeitet werden.');
        const color = i.options.getString('color');
        if (color && parseHex(color) === null) return respond(i, '❌ Ungültige Hex-Farbe.');
        if (i.options.getString('name')) t.name = i.options.getString('name');
        if (i.options.getString('emoji')) t.emoji = i.options.getString('emoji');
        if (i.options.getString('description')) t.description = i.options.getString('description');
        if (i.options.getRole('role')) t.roleIds = [i.options.getRole('role').id];
        if (i.options.getChannel('category')) t.categoryId = i.options.getChannel('category').id;
        if (color) t.color = color;
        save();
        return respond(i, `✅ Tickettyp **${id}** aktualisiert.`);
      }
      if (sub === 'delete') {
        const t = cfg.tickets.types[id];
        if (!t) return respond(i, '❌ Diesen Tickettyp gibt es nicht.');
        if (t.system) return respond(i, '❌ Der Verifizierungstyp kann nicht gelöscht werden.');
        delete cfg.tickets.types[id];
        save();
        return respond(i, `✅ Tickettyp **${id}** gelöscht. Bereits erstellte Tickets bleiben erhalten.`);
      }
    }

    if (sub === 'types') {
      const list = tickets.allTypes(cfg).map((t) => `${t.emoji} **${t.name}** (\`${t.id}\`) – ${t.description}`).join('\n');
      return respond(i, { embeds: [new EmbedBuilder().setColor(COLORS.primary).setTitle('🎫 Verfügbare Tickettypen').setDescription(list)] });
    }
    if (sub === 'config') { if (!(await guardArea(i, 'tickets'))) return; return respond(i, areaView(i.guild, 'tickets')); }

    if (sub === 'setup') {
      if (!(await requireLevel(i, 'admin'))) return;
      const raw = i.options.getString('types');
      const ids = raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : Object.keys(cfg.tickets.types).filter((id) => id !== 'verification');
      const unknown = ids.filter((id) => !cfg.tickets.types[id]);
      if (unknown.length) return respond(i, `❌ Unbekannte Typ-IDs: ${unknown.join(', ')}`);
      const channel = i.options.getChannel('channel');
      const payload = tickets.panelPayload(i.guild, ids, { title: i.options.getString('title'), description: i.options.getString('description'), style: i.options.getString('style') || 'buttons' });
      await channel.send(payload);
      return respond(i, `✅ Ticket-Panel wurde in ${channel} gesendet.`);
    }

    if (sub === 'create') {
      const typeId = i.options.getString('type');
      await i.deferReply({ flags: 64 });
      const r = await tickets.openTicket(i.guild, i.member, typeId, { reason: i.options.getString('reason') });
      return respond(i, r.error ? `❌ ${r.error}` : `✅ Ticket erstellt: ${r.channel}`);
    }

    // Ab hier: Befehle innerhalb eines Ticket-Kanals
    const ticket = currentTicket(i);
    if (!ticket) return respond(i, '❌ Dieser Befehl funktioniert nur in einem Ticket-Kanal.');

    if (sub === 'claim') {
      if (!isTicketTeam(i.member) && !tickets.isStaffFor(i.member, ticket)) return respond(i, '⛔ Nur das Team kann Tickets claimen.');
      const r = tickets.claim(ticket, i.member);
      if (r.error) return respond(i, `❌ ${r.error}`);
      await tickets.afterClaim(i.guild, ticket, i.member, true);
      return respond(i, '✅ Du hast das Ticket geclaimt.');
    }
    if (sub === 'unclaim') {
      const r = tickets.unclaim(ticket, i.member);
      if (r.error) return respond(i, `❌ ${r.error}`);
      await tickets.afterClaim(i.guild, ticket, i.member, false);
      return respond(i, '✅ Ticket wurde freigegeben.');
    }
    if (sub === 'close') {
      if (!tickets.canClose(i.member, ticket)) return respond(i, '⛔ Du darfst dieses Ticket nicht schließen.');
      await i.deferReply();
      const r = await tickets.closeTicket(i.guild, ticket, i.member, i.options.getString('reason') || 'Kein Grund angegeben');
      return respond(i, r.error ? `❌ ${r.error}` : '🔒 Ticket wird geschlossen …', { ephemeral: false });
    }
    if (sub === 'delete') {
      if (!isAdmin(i.member) && !(isTicketTeam(i.member) && cfg.permissions.ticketDelete)) return respond(i, '⛔ Dafür fehlt dir die Berechtigung.');
      await i.deferReply();
      await tickets.deleteTicket(i.guild, ticket, i.member);
      return; // Kanal wird gleich gelöscht
    }
    if (sub === 'add') {
      if (!tickets.isStaffFor(i.member, ticket)) return respond(i, '⛔ Nur das Team kann User hinzufügen.');
      await tickets.addUser(i.channel, ticket, i.options.getUser('user').id);
      return respond(i, `✅ ${i.options.getUser('user')} wurde hinzugefügt.`, { ephemeral: false });
    }
    if (sub === 'remove') {
      if (!tickets.isStaffFor(i.member, ticket)) return respond(i, '⛔ Nur das Team kann User entfernen.');
      const r = await tickets.removeUser(i.channel, ticket, i.options.getUser('user').id);
      return respond(i, r.error ? `❌ ${r.error}` : `✅ ${i.options.getUser('user')} wurde entfernt.`, { ephemeral: false });
    }
    if (sub === 'rename') {
      if (!tickets.isStaffFor(i.member, ticket)) return respond(i, '⛔ Nur das Team kann umbenennen.');
      const wait = tickets.renameCooldown(i.channelId);
      if (wait) return respond(i, `⏳ Discord erlaubt nur 2 Umbenennungen pro 10 Minuten. Versuch es in ${wait}s erneut.`);
      await i.channel.setName(i.options.getString('name').toLowerCase().replace(/\s+/g, '-'));
      return respond(i, '✅ Umbenannt.');
    }
    if (sub === 'priority') {
      if (!tickets.isStaffFor(i.member, ticket)) return respond(i, '⛔ Nur das Team kann die Priorität ändern.');
      await tickets.setPriority(i.guild, ticket, i.options.getString('priority'));
      return respond(i, `✅ Priorität gesetzt: ${PRIORITIES[i.options.getString('priority')].label}`, { ephemeral: false });
    }
    if (sub === 'transcript') {
      if (!tickets.isStaffFor(i.member, ticket)) return respond(i, '⛔ Nur das Team kann Transkripte erstellen.');
      await i.deferReply({ flags: 64 });
      await tickets.archiveTranscript(i.guild, ticket, i.channel);
      return respond(i, '✅ Transkript wurde erstellt und in den Log-Kanal gesendet.');
    }
    if (sub === 'info') {
      const type = tickets.typeOf(cfg, ticket.typeId);
      return respond(i, { embeds: [new EmbedBuilder().setColor(COLORS.primary).setTitle(`ℹ️ Ticket #${pad4(ticket.number)}`)
        .addFields(
          { name: 'Ersteller', value: `<@${ticket.userId}>`, inline: true },
          { name: 'Typ', value: type ? `${type.emoji} ${type.name}` : ticket.typeId, inline: true },
          { name: 'Bearbeiter', value: ticket.claimedBy ? `<@${ticket.claimedBy}>` : '—', inline: true },
          { name: 'Status', value: ticket.status, inline: true },
          { name: 'Priorität', value: PRIORITIES[ticket.priority]?.label || ticket.priority, inline: true },
          { name: 'Erstellt', value: `<t:${Math.floor(ticket.createdAt / 1000)}:F>`, inline: true },
        )] });
    }
  },
};
