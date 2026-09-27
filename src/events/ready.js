const { Events, REST, Routes } = require('discord.js');
const logger = require('../utils/logger');
const tickets = require('../systems/tickets');
const voiceXp = require('../systems/voiceXp');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    logger.info(`✅ Eingeloggt als ${client.user.tag} (${client.guilds.cache.size} Server)`);
    client.user.setPresence({ activities: [{ name: '/help' }], status: 'online' });

    if ((process.env.AUTO_DEPLOY ?? 'true') === 'true') {
      try {
        const body = [...client.commands.values()].map((c) => c.data.toJSON());
        const rest = new REST().setToken(process.env.DISCORD_TOKEN);
        if (process.env.GUILD_ID) {
          await rest.put(Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID), { body });
          logger.info(`📤 ${body.length} Commands auf Server ${process.env.GUILD_ID} registriert (sofort verfügbar).`);
        } else {
          await rest.put(Routes.applicationCommands(client.user.id), { body });
          logger.info(`📤 ${body.length} Commands global registriert (kann bis zu 1 Std. dauern).`);
        }
      } catch (e) {
        logger.error('Commands konnten nicht registriert werden:', e);
      }
    }

    // Robustheit bei Neustart: verwaiste/kaputte Ticket-Zustände reparieren
    await tickets.reconcile(client).catch((e) => logger.error('Ticket-Abgleich fehlgeschlagen:', e));
    voiceXp.start(client);
    logger.info('🚀 Bot ist vollständig bereit.');
  },
};
