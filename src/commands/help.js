const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { COLORS } = require('../config/constants');
const { isOwner, isAdmin, isTicketTeam, isMod, isMember } = require('../utils/permissions');

const CATEGORIES = {
  tickets: {
    label: '🎫 Tickets', check: () => true,
    text: '`/ticket create` – Ticket erstellen\n`/ticket close` – Ticket schließen\n`/ticket claim`/`unclaim` – Ticket übernehmen/freigeben *(Team)*\n`/ticket add`/`remove` – User hinzufügen/entfernen\n`/ticket rename`/`priority`/`info`/`transcript` – Ticket verwalten\n`/ticket types` – Verfügbare Tickettypen\n`/ticket setup`/`config`/`type` – Einrichtung *(Admin)*',
  },
  verify: {
    label: '✅ Verifizierung', check: () => true,
    text: '`/verify status` – Eigenen Status ansehen\n`/verify user` – Status eines Users ansehen *(Team)*\n`/verify approve`/`reject` – Freigeben/Ablehnen *(Team)*\n`/verify setup`/`config` – Einrichtung *(Admin)*',
  },
  mod: {
    label: '🛡 Moderation', check: isMod,
    text: '`/mod warn`/`warnings`/`clearwarn` – Warnsystem\n`/mod timeout`/`kick`/`ban`/`unban`\n`/mod clear`/`slowmode`/`lock`/`unlock`\n`/report ...` – Reportsystem',
  },
  xp: {
    label: '📊 XP & Level', check: () => true,
    text: '`/xp view`/`leaderboard` – XP ansehen\n`/level view`/`leaderboard`/`rewards` – Level ansehen\n`/xp add`/`remove`/`set`/`reset`/`config` – Verwaltung *(Admin)*\n`/levelrole add`/`remove`/`list` – Level-Belohnungen *(Admin)*',
  },
  voice: {
    label: '🔊 Voice-XP', check: () => true,
    text: '`/voice xp`/`level`/`leaderboard` – Voice-XP ansehen\n`/voice add`/`remove`/`reset`/`config` – Verwaltung *(Admin)*',
  },
  logs: {
    label: '📋 Logging', check: isAdmin,
    text: '`/logs setup`/`config`/`enable`/`disable`/`channel`/`list`',
  },
  embeds: {
    label: '🎨 Embeds', check: isTicketTeam,
    text: '`/embed create`/`preview`/`edit`/`send`/`cancel`',
  },
  config: {
    label: '⚙ Konfiguration', check: isAdmin,
    text: '`/config menu`/`view` – Übersicht\n`/config roles`/`channels`/`categories`/`tickets`/`verification`/`xp`/`voice`/`level`/`logs`/`autoroles`/`moderation`/`embeds`/`permissions`',
  },
  other: {
    label: '🧭 Sonstiges', check: () => true,
    text: '`/server info`/`membercount`/`roles`/`channels`\n`/user info`/`avatar`/`banner`\n`/autorole` (Übersicht)',
  },
};

function buildEmbed(member, key) {
  const cat = CATEGORIES[key];
  return new EmbedBuilder().setColor(COLORS.primary).setTitle(cat.label).setDescription(cat.text);
}

module.exports = {
  data: new SlashCommandBuilder().setName('help').setDescription('Zeigt alle Bot-Funktionen'),
  async execute(i) {
    const available = Object.entries(CATEGORIES).filter(([, c]) => c.check(i.member));
    const select = new StringSelectMenuBuilder().setCustomId('help:pick').setPlaceholder('Kategorie auswählen …')
      .addOptions(available.map(([key, c]) => ({ label: c.label, value: key })));
    const embed = new EmbedBuilder().setColor(COLORS.primary).setTitle('🤖 Bot-Systeme')
      .setDescription(available.map(([, c]) => c.label).join('\n'))
      .setFooter({ text: 'Wähle unten eine Kategorie für Details.' });
    return i.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(select)], flags: 64 });
  },
  buildEmbed,
  CATEGORIES,
};
