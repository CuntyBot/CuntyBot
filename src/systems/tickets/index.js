const {
  ChannelType, PermissionFlagsBits: P, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, AttachmentBuilder,
} = require('discord.js');
const db = require('../../database');
const { TYPE_DEFAULTS, PRIORITIES, COLORS } = require('../../config/constants');
const {
  roleId, hasRole, isGuildOwner, isAdmin, isTicketTeam, isRestricted, missingBotPerms,
} = require('../../utils/permissions');
const { parseHex, ts, pad4, truncate, postTo, dmUser } = require('../../utils/helpers');
const { sendLog } = require('../logging');
const { buildTranscript } = require('./transcript');
const logger = require('../../utils/logger');

const locks = new Set(); // verhindert doppelte Tickets bei Doppelklick
const renameLog = new Map(); // channelId -> Zeitstempel (Discord: max. 2 Umbenennungen / 10 Min.)
const BTN = { primary: ButtonStyle.Primary, secondary: ButtonStyle.Secondary, success: ButtonStyle.Success, danger: ButtonStyle.Danger };

/* ---------- Tickettypen ---------- */
const typeOf = (cfg, id) => {
  const t = cfg.tickets.types[id];
  return t ? { ...TYPE_DEFAULTS, ...t, id } : null;
};
const allTypes = (cfg) => Object.keys(cfg.tickets.types).map((id) => typeOf(cfg, id));

function staffRoleIds(guild, type) {
  const base = type.roleIds?.length ? type.roleIds : (type.roleKeys || []).map((k) => roleId(guild.id, k));
  return [...new Set([...base, roleId(guild.id, 'ADMIN'), roleId(guild.id, 'OWNER')])].filter((id) => guild.roles.cache.has(id));
}

function isStaffFor(member, ticket) {
  const cfg = db.getConfig(member.guild.id);
  const type = typeOf(cfg, ticket.typeId) || { ...TYPE_DEFAULTS };
  return isGuildOwner(member) || isTicketTeam(member) || staffRoleIds(member.guild, type).some((id) => member.roles.cache.has(id));
}

function canClose(member, ticket) {
  if (isStaffFor(member, ticket)) return true;
  const cfg = db.getConfig(member.guild.id);
  const type = typeOf(cfg, ticket.typeId);
  return member.id === ticket.userId && cfg.tickets.userCanClose && (type?.allowUserClose ?? true);
}

/* ---------- Voraussetzungen ---------- */
function precheck(guild, member, typeId) {
  const cfg = db.getConfig(guild.id);
  const type = typeOf(cfg, typeId);
  if (!type) return 'Diesen Tickettyp gibt es nicht (mehr).';

  if (typeId === 'verification') {
    if (hasRole(member, 'MEMBER')) return 'Du bist bereits verifiziert.';
    const v = db.peekUser(guild.id, member.id)?.verification;
    const wait = cfg.verification.rejectCooldownMinutes * 60000;
    if (v?.status === 'rejected' && Date.now() - v.at < wait) {
      return `Deine letzte Verifizierung wurde abgelehnt. Du kannst es ${ts(v.at + wait, 'R')} erneut versuchen.`;
    }
  } else if (isRestricted(member)) {
    return 'Bitte verifiziere dich zuerst.';
  }

  const open = db.userTickets(guild.id, member.id);
  const same = open.filter((t) => t.typeId === typeId);
  if (same.length >= cfg.tickets.maxOpenPerType) return `Du hast bereits ein offenes Ticket dieser Art: <#${same[0].channelId}>`;
  if (open.length >= cfg.tickets.maxOpenPerUser) return `Du hast bereits ${open.length} offene Tickets (Maximum: ${cfg.tickets.maxOpenPerUser}).`;
  return null;
}

/* ---------- Kontrollnachricht ---------- */
function controlPayload(guild, ticket) {
  const cfg = db.getConfig(guild.id);
  const type = typeOf(cfg, ticket.typeId) || { ...TYPE_DEFAULTS, name: ticket.typeId };
  const pr = PRIORITIES[ticket.priority] || PRIORITIES.normal;
  const open = ticket.status === 'open';
  const statusText = { open: '🟢 Offen', closing: '🟡 Wird geschlossen', closed: '🔴 Geschlossen', deleted: '⚫ Gelöscht' }[ticket.status] || ticket.status;

  const lines = [];
  if (type.welcome) lines.push(type.welcome);
  if (ticket.reason) lines.push(`>>> ${truncate(ticket.reason, 1500)}`);
  const embed = new EmbedBuilder()
    .setColor(parseHex(type.color) ?? COLORS.primary)
    .setTitle(`${type.emoji} ${type.name} • #${pad4(ticket.number)}`)
    .setDescription(lines.join('\n\n') || null)
    .addFields(
      { name: 'Ersteller', value: `<@${ticket.userId}>`, inline: true },
      { name: 'Bearbeiter', value: ticket.claimedBy ? `<@${ticket.claimedBy}>` : '*Nicht geclaimt*', inline: true },
      { name: 'Priorität', value: `${pr.emoji} ${pr.label}`, inline: true },
      { name: 'Status', value: statusText, inline: true },
      { name: 'Erstellt', value: ts(ticket.createdAt, 'R'), inline: true },
    );
  if (ticket.infoLines) embed.addFields({ name: 'Account', value: ticket.infoLines });

  if (!open) return { embeds: [embed], components: [] };

  const claimBtn = new ButtonBuilder().setCustomId('ticket:claim')
    .setLabel(ticket.claimedBy ? 'Unclaim' : 'Claim').setEmoji(ticket.claimedBy ? '↩️' : '🙋')
    .setStyle(ticket.claimedBy ? ButtonStyle.Secondary : ButtonStyle.Primary);
  const closeBtn = new ButtonBuilder().setCustomId('ticket:close').setLabel('Schließen').setEmoji('🔒').setStyle(ButtonStyle.Secondary);
  const row = new ActionRowBuilder();
  if (ticket.typeId === 'verification') {
    row.addComponents(
      claimBtn,
      new ButtonBuilder().setCustomId('ticket:approve').setLabel('Freigeben').setEmoji('✅').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ticket:reject').setLabel('Ablehnen').setEmoji('❌').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ticket:kick').setLabel('Ablehnen + Kick').setEmoji('👢').setStyle(ButtonStyle.Danger),
      closeBtn,
    );
  } else {
    row.addComponents(claimBtn, new ButtonBuilder().setCustomId('ticket:transcript').setLabel('Transkript').setEmoji('📄').setStyle(ButtonStyle.Secondary), closeBtn);
  }
  const prio = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('ticket:priority').setPlaceholder('Priorität ändern (Team)')
      .addOptions(Object.entries(PRIORITIES).map(([value, p]) => ({ label: p.label, value, emoji: p.emoji, default: ticket.priority === value }))),
  );
  return { embeds: [embed], components: [row, prio] };
}

async function refreshControl(guild, ticket) {
  const ch = guild.channels.cache.get(ticket.channelId);
  if (!ch || !ticket.controlMessageId) return;
  const msg = await ch.messages.fetch(ticket.controlMessageId).catch(() => null);
  if (msg) await msg.edit(controlPayload(guild, ticket)).catch(() => {});
}

/* ---------- Ticket öffnen ---------- */
async function openTicket(guild, member, typeId, { reason = null } = {}) {
  const err = precheck(guild, member, typeId);
  if (err) return { error: err };
  const cfg = db.getConfig(guild.id);
  const type = typeOf(cfg, typeId);

  const lockKey = `${guild.id}:${member.id}:${typeId}`;
  if (locks.has(lockKey)) return { error: 'Dein Ticket wird gerade erstellt …' };
  locks.add(lockKey);
  try {
    const missing = missingBotPerms(guild, [P.ViewChannel, P.SendMessages, P.ManageChannels, P.ManageRoles, P.EmbedLinks, P.AttachFiles, P.ReadMessageHistory]);
    if (missing.length) return { error: `Mir fehlen Rechte: **${missing.join(', ')}**` };

    const parentId = type.categoryId || cfg.categories[type.categoryKey] || null;
    const parent = parentId ? guild.channels.cache.get(parentId) : null;
    const validParent = parent?.type === ChannelType.GuildCategory ? parent.id : undefined;

    const base = [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.EmbedLinks];
    const overwrites = [
      { id: guild.id, deny: [P.ViewChannel] },
      { id: member.id, allow: base },
      ...staffRoleIds(guild, type).map((id) => ({ id, allow: base })),
      { id: guild.members.me.id, allow: [...base, P.ManageChannels] },
    ];

    const number = db.nextId(guild.id, 'ticket');
    const name = `${type.id}-${pad4(number)}`.toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 90);
    const options = {
      name, type: ChannelType.GuildText, permissionOverwrites: overwrites,
      topic: truncate(`Ticket #${pad4(number)} • ${type.name} • ${member.user.username} (${member.id})`, 1000),
      reason: `Ticket #${pad4(number)} von ${member.user.username}`,
    };
    let channel;
    try {
      channel = await guild.channels.create({ ...options, parent: validParent });
    } catch (e) {
      if (!validParent) throw e;
      logger.warn(`Ticket-Kategorie voll/fehlerhaft (${e.message}) – erstelle ohne Kategorie.`);
      channel = await guild.channels.create(options);
    }

    const joined = member.joinedTimestamp ? ts(member.joinedTimestamp, 'R') : '—';
    const ticket = db.createTicket({
      guildId: guild.id, number, channelId: channel.id, userId: member.id, typeId,
      status: 'open', claimedBy: null, priority: 'normal', reason: reason ? truncate(reason, 1500) : null,
      createdAt: Date.now(), closedAt: null, closedBy: null, closeReason: null,
      addedUsers: [], controlMessageId: null, pendingDelete: false,
      infoLines: typeId === 'verification' ? `Account erstellt: ${ts(member.user.createdTimestamp, 'R')}\nServer beigetreten: ${joined}` : null,
    });

    const staffIds = staffRoleIds(guild, type);
    const pingRoles = type.roleIds?.length ? type.roleIds : (type.roleKeys || []).map((k) => roleId(guild.id, k));
    const msg = await channel.send({
      content: `${member} ${pingRoles.filter((id) => guild.roles.cache.has(id)).map((id) => `<@&${id}>`).join(' ')}`,
      allowedMentions: { users: [member.id], roles: staffIds },
      ...controlPayload(guild, ticket),
    });
    ticket.controlMessageId = msg.id;
    db.save();

    await sendLog(guild, 'ticketCreate', {
      fields: [
        { name: 'Ticket', value: `${channel} (\`ticket-${pad4(number)}\`)`, inline: true },
        { name: 'User', value: `${member} (\`${member.id}\`)`, inline: true },
        { name: 'Typ', value: `${type.emoji} ${type.name}`, inline: true },
      ],
    }, { extraChannels: type.logChannelId ? [type.logChannelId] : [] });
    return { ticket, channel };
  } catch (e) {
    logger.error('Ticket konnte nicht erstellt werden:', e);
    return { error: `Ticket konnte nicht erstellt werden: ${e.message}` };
  } finally {
    locks.delete(lockKey);
  }
}

/* ---------- Claim / Unclaim / Priorität ---------- */
// Wichtig: Zustandsänderung passiert synchron -> keine Race-Condition bei gleichzeitigem Claim
function claim(ticket, member) {
  if (ticket.status !== 'open') return { error: 'Dieses Ticket ist nicht mehr offen.' };
  if (ticket.claimedBy === member.id) return { error: 'Du hast dieses Ticket bereits geclaimt.' };
  if (ticket.claimedBy) return { error: `Dieses Ticket wurde bereits von <@${ticket.claimedBy}> geclaimt.` };
  ticket.claimedBy = member.id;
  ticket.claimedAt = Date.now();
  db.save();
  return { ok: true };
}

function unclaim(ticket, member) {
  if (ticket.status !== 'open') return { error: 'Dieses Ticket ist nicht mehr offen.' };
  if (!ticket.claimedBy) return { error: 'Dieses Ticket ist nicht geclaimt.' };
  if (ticket.claimedBy !== member.id && !isAdmin(member)) return { error: `Nur <@${ticket.claimedBy}> oder ein Admin kann das Ticket freigeben.` };
  const prev = ticket.claimedBy;
  ticket.claimedBy = null;
  db.save();
  return { ok: true, prev };
}

async function afterClaim(guild, ticket, member, claimed) {
  await refreshControl(guild, ticket);
  const ch = guild.channels.cache.get(ticket.channelId);
  if (ch) await ch.send({ content: claimed ? `🙋 ${member} hat dieses Ticket übernommen.` : `↩️ ${member} hat das Ticket freigegeben.`, allowedMentions: { parse: [] } }).catch(() => {});
  const type = typeOf(db.getConfig(guild.id), ticket.typeId);
  await sendLog(guild, 'ticketClaim', {
    title: claimed ? '🙋 Ticket geclaimt' : '↩️ Ticket freigegeben',
    fields: [
      { name: 'Ticket', value: `\`ticket-${pad4(ticket.number)}\` <#${ticket.channelId}>`, inline: true },
      { name: 'User', value: `<@${ticket.userId}>`, inline: true },
      { name: 'Bearbeiter', value: `${member}`, inline: true },
      { name: 'Zeitpunkt', value: ts(Date.now(), 'F') },
    ],
  }, { extraChannels: type?.logChannelId ? [type.logChannelId] : [] });
}

async function setPriority(guild, ticket, priority) {
  ticket.priority = priority;
  db.save();
  await refreshControl(guild, ticket);
}

/* ---------- Schließen / Löschen ---------- */
async function archiveTranscript(guild, ticket, channel) {
  const cfg = db.getConfig(guild.id);
  if (!channel || !cfg.tickets.transcriptOnClose) return [];
  try {
    const tr = await buildTranscript(channel, ticket);
    const files = [
      { name: `transcript-${pad4(ticket.number)}.html`, buf: tr.html },
      { name: `transcript-${pad4(ticket.number)}.txt`, buf: tr.txt },
    ];
    const mk = () => files.map((f) => new AttachmentBuilder(f.buf, { name: f.name }));
    const type = typeOf(cfg, ticket.typeId);
    const targets = new Set([cfg.channels.TRANSCRIPTS || cfg.channels.TICKET_LOGS || cfg.channels.LOGS]);
    if (type?.logChannelId) targets.add(type.logChannelId);
    const embed = new EmbedBuilder().setColor(COLORS.neutral).setTitle(`📄 Transkript • Ticket #${pad4(ticket.number)}`)
      .addFields(
        { name: 'Typ', value: type ? `${type.emoji} ${type.name}` : ticket.typeId, inline: true },
        { name: 'Ersteller', value: `<@${ticket.userId}>`, inline: true },
        { name: 'Nachrichten', value: String(tr.count), inline: true },
      ).setTimestamp();
    for (const id of targets) if (id) await postTo(guild, id, { embeds: [embed], files: mk(), allowedMentions: { parse: [] } });
    if (cfg.tickets.dmTranscript) {
      const user = await guild.client.users.fetch(ticket.userId).catch(() => null);
      if (user) await dmUser(user, { embeds: [embed], files: mk() });
    }
    return mk();
  } catch (e) {
    logger.error('Transkript fehlgeschlagen:', e);
    return [];
  }
}

async function closeTicket(guild, ticket, closer, reason = 'Kein Grund angegeben') {
  if (ticket.status !== 'open') return { error: 'Dieses Ticket ist bereits geschlossen.' };
  ticket.status = 'closing'; // sofort sperren -> kein doppeltes Schließen
  db.save();

  const cfg = db.getConfig(guild.id);
  const type = typeOf(cfg, ticket.typeId);
  const channel = guild.channels.cache.get(ticket.channelId) || await guild.channels.fetch(ticket.channelId).catch(() => null);

  await archiveTranscript(guild, ticket, channel);

  ticket.status = 'closed';
  ticket.closedAt = Date.now();
  ticket.closedBy = closer?.id ?? null;
  ticket.closeReason = truncate(reason, 500);
  db.save();

  await sendLog(guild, 'ticketClose', {
    fields: [
      { name: 'Ticket', value: `\`ticket-${pad4(ticket.number)}\``, inline: true },
      { name: 'Ersteller', value: `<@${ticket.userId}>`, inline: true },
      { name: 'Geschlossen von', value: closer ? `${closer}` : 'System', inline: true },
      { name: 'Bearbeiter', value: ticket.claimedBy ? `<@${ticket.claimedBy}>` : '—', inline: true },
      { name: 'Grund', value: ticket.closeReason },
    ],
  }, { extraChannels: type?.logChannelId ? [type.logChannelId] : [] });

  if (!channel) return { ok: true };
  await refreshControl(guild, ticket);
  await channel.send({
    embeds: [new EmbedBuilder().setColor(COLORS.warning).setTitle('🔒 Ticket geschlossen')
      .setDescription(`Geschlossen von ${closer ?? 'System'}\n**Grund:** ${ticket.closeReason}`)],
    allowedMentions: { parse: [] },
  }).catch(() => {});

  const archive = cfg.categories.ARCHIVE ? guild.channels.cache.get(cfg.categories.ARCHIVE) : null;
  if (cfg.tickets.closeMode === 'archive' && archive?.type === ChannelType.GuildCategory) {
    try {
      for (const uid of [ticket.userId, ...ticket.addedUsers]) {
        await channel.permissionOverwrites.edit(uid, { ViewChannel: false, SendMessages: false }).catch(() => {});
      }
      await channel.setParent(archive.id, { lockPermissions: false });
      if (!renameCooldown(channel.id)) await channel.setName(`closed-${pad4(ticket.number)}`).catch(() => {});
      return { ok: true, archived: true };
    } catch (e) {
      logger.warn(`Archivieren fehlgeschlagen (${e.message}) – Kanal wird gelöscht.`);
    }
  }
  ticket.pendingDelete = true;
  db.save();
  setTimeout(() => channel.delete(`Ticket #${pad4(ticket.number)} geschlossen`).catch(() => {}), cfg.tickets.deleteDelaySeconds * 1000);
  return { ok: true, archived: false };
}

async function deleteTicket(guild, ticket, by) {
  const cfg = db.getConfig(guild.id);
  const type = typeOf(cfg, ticket.typeId);
  const channel = guild.channels.cache.get(ticket.channelId) || await guild.channels.fetch(ticket.channelId).catch(() => null);
  if (ticket.status === 'open' && channel) await archiveTranscript(guild, ticket, channel);
  ticket.status = 'deleted';
  ticket.deletedAt = Date.now();
  db.save();
  await sendLog(guild, 'ticketDelete', {
    fields: [
      { name: 'Ticket', value: `\`ticket-${pad4(ticket.number)}\``, inline: true },
      { name: 'Ersteller', value: `<@${ticket.userId}>`, inline: true },
      { name: 'Gelöscht von', value: by ? `${by}` : 'System', inline: true },
    ],
  }, { extraChannels: type?.logChannelId ? [type.logChannelId] : [] });
  if (channel) await channel.delete(`Ticket gelöscht von ${by?.user?.username ?? 'System'}`).catch(() => {});
}

/* ---------- User hinzufügen / entfernen / umbenennen ---------- */
async function addUser(channel, ticket, userId) {
  await channel.permissionOverwrites.edit(userId, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true, EmbedLinks: true });
  if (!ticket.addedUsers.includes(userId)) { ticket.addedUsers.push(userId); db.save(); }
}
async function removeUser(channel, ticket, userId) {
  if (userId === ticket.userId) return { error: 'Der Ersteller kann nicht entfernt werden.' };
  await channel.permissionOverwrites.delete(userId);
  ticket.addedUsers = ticket.addedUsers.filter((id) => id !== userId);
  db.save();
  return { ok: true };
}

// Gibt die Wartezeit in Sekunden zurück (0 = erlaubt). Discord erlaubt nur 2 Umbenennungen / 10 Min.
function renameCooldown(channelId) {
  const now = Date.now();
  const arr = (renameLog.get(channelId) || []).filter((t) => now - t < 600000);
  if (arr.length >= 2) { renameLog.set(channelId, arr); return Math.ceil((600000 - (now - arr[0])) / 1000); }
  arr.push(now);
  renameLog.set(channelId, arr);
  return 0;
}

/* ---------- Panels ---------- */
function panelPayload(guild, typeIds, { title, description, style = 'buttons' }) {
  const cfg = db.getConfig(guild.id);
  const types = typeIds.map((id) => typeOf(cfg, id)).filter(Boolean);
  const list = types.map((t) => `${t.emoji} **${t.name}**${t.description ? ` – ${t.description}` : ''}`).join('\n');
  const embed = new EmbedBuilder().setColor(COLORS.primary).setTitle(truncate(title, 250))
    .setDescription(truncate(`${description}\n\n${list}`, 4000));
  if (style === 'menu' || types.length > 5) {
    const menu = new StringSelectMenuBuilder().setCustomId('ticket:panelselect').setPlaceholder('Wähle den Ticket-Typ …')
      .addOptions(types.slice(0, 25).map((t) => ({ label: truncate(t.name, 100), value: t.id, emoji: t.emoji, description: truncate(t.description || t.name, 100) })));
    return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] };
  }
  const row = new ActionRowBuilder().addComponents(types.map((t) =>
    new ButtonBuilder().setCustomId(`ticket:open:${t.id}`).setLabel(truncate(t.buttonLabel || t.name, 80)).setEmoji(t.emoji).setStyle(BTN[t.buttonStyle] || ButtonStyle.Primary)));
  return { embeds: [embed], components: [row] };
}

/* ---------- Robustheit: Neustart & manuell gelöschte Kanäle ---------- */
async function reconcile(client) {
  for (const guild of client.guilds.cache.values()) {
    for (const t of db.guildTickets(guild.id)) {
      const relevant = ['open', 'closing'].includes(t.status) || (t.status === 'closed' && t.pendingDelete);
      if (!relevant) continue;
      const ch = await guild.channels.fetch(t.channelId).catch(() => null);
      if (!ch) {
        if (t.status !== 'closed') { t.status = 'deleted'; t.deletedAt = Date.now(); }
        continue;
      }
      if (t.status === 'closing') t.status = 'open'; // Absturz während des Schließens -> erneut schließbar
      else if (t.status === 'closed' && t.pendingDelete) ch.delete('Ticket geschlossen (nach Neustart)').catch(() => {});
    }
  }
  db.save();
}

async function handleChannelDelete(channel) {
  const t = db.getTicketByChannel(channel.id);
  if (!t || !['open', 'closing'].includes(t.status)) return;
  t.status = 'deleted';
  t.deletedAt = Date.now();
  db.save();
  await sendLog(channel.guild, 'ticketDelete', {
    description: `Der Kanal von Ticket \`ticket-${pad4(t.number)}\` wurde manuell gelöscht.`,
    fields: [{ name: 'Ersteller', value: `<@${t.userId}>`, inline: true }],
  });
}

async function handleMemberLeave(member) {
  for (const t of db.userTickets(member.guild.id, member.id)) {
    if (t.typeId === 'verification') {
      const ch = member.guild.channels.cache.get(t.channelId);
      if (ch) await ch.send('🚪 Der User hat den Server verlassen. Das Ticket wird geschlossen.').catch(() => {});
      await closeTicket(member.guild, t, null, 'User hat den Server verlassen');
    } else {
      const ch = member.guild.channels.cache.get(t.channelId);
      if (ch) await ch.send('🚪 Der Ersteller hat den Server verlassen.').catch(() => {});
    }
  }
}

module.exports = {
  typeOf, allTypes, staffRoleIds, isStaffFor, canClose, precheck, controlPayload, refreshControl,
  openTicket, claim, unclaim, afterClaim, setPriority, closeTicket, deleteTicket, archiveTranscript,
  addUser, removeUser, renameCooldown, panelPayload, reconcile, handleChannelDelete, handleMemberLeave,
};
