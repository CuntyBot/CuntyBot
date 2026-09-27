const { Events, MessageFlags } = require('discord.js');
const logger = require('../utils/logger');
const buttons = require('../interactions/buttons');
const selectMenus = require('../interactions/selectMenus');
const modals = require('../interactions/modals');

async function reportError(i, e) {
  logger.error(`Fehler bei Interaktion (${i.customId ?? i.commandName}):`, e);
  const msg = { content: '❌ Es ist ein unerwarteter Fehler aufgetreten. Bitte versuche es erneut.', flags: MessageFlags.Ephemeral };
  try {
    if (i.replied || i.deferred) await i.followUp(msg); else await i.reply(msg);
  } catch { /* Interaktion evtl. abgelaufen – ignorieren */ }
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(i) {
    if (!i.guild) {
      if (i.isRepliable()) await i.reply({ content: '❌ Dieser Bot funktioniert nur auf Servern.', flags: MessageFlags.Ephemeral }).catch(() => {});
      return;
    }
    try {
      if (i.isChatInputCommand()) {
        const cmd = i.client.commands.get(i.commandName);
        if (!cmd) return;
        return await cmd.execute(i);
      }
      if (i.isAutocomplete()) {
        const cmd = i.client.commands.get(i.commandName);
        if (cmd?.autocomplete) return await cmd.autocomplete(i);
        return i.respond([]).catch(() => {});
      }
      if (i.isButton()) return await buttons(i);
      if (i.isAnySelectMenu()) return await selectMenus(i);
      if (i.isModalSubmit()) return await modals(i);
    } catch (e) {
      await reportError(i, e);
    }
  },
};
