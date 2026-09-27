require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const logger = require('./utils/logger');
const db = require('./database');

if (!process.env.DISCORD_TOKEN) {
  logger.error('Kein DISCORD_TOKEN in der .env gefunden. Bitte .env.example nach .env kopieren und ausfüllen.');
  process.exit(1);
}

db.init();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildModeration,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember, Partials.User],
});

/* ---------- Commands laden ---------- */
client.commands = new Collection();
const commandsDir = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsDir).filter((f) => f.endsWith('.js'))) {
  const cmd = require(path.join(commandsDir, file));
  if (!cmd?.data?.name || typeof cmd.execute !== 'function') {
    logger.warn(`Command-Datei ${file} übersprungen (fehlt "data" oder "execute").`);
    continue;
  }
  client.commands.set(cmd.data.name, cmd);
}
logger.info(`📦 ${client.commands.size} Commands geladen.`);

/* ---------- Events laden ---------- */
const eventsDir = path.join(__dirname, 'events');
for (const file of fs.readdirSync(eventsDir).filter((f) => f.endsWith('.js'))) {
  const event = require(path.join(eventsDir, file));
  if (event.once) client.once(event.name, (...args) => event.execute(...args, client));
  else client.on(event.name, (...args) => event.execute(...args, client));
}
logger.info(`📦 ${fs.readdirSync(eventsDir).filter((f) => f.endsWith('.js')).length} Events geladen.`);

/* ---------- Robustheit ---------- */
process.on('unhandledRejection', (err) => logger.error('Unhandled Rejection:', err));
process.on('uncaughtException', (err) => logger.error('Uncaught Exception:', err));

function shutdown(signal) {
  logger.info(`${signal} empfangen – speichere Datenbank und beende …`);
  db.flush();
  client.destroy();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

client.login(process.env.DISCORD_TOKEN).catch((e) => {
  logger.error('Login fehlgeschlagen. Ist der DISCORD_TOKEN korrekt?', e.message);
  process.exit(1);
});
