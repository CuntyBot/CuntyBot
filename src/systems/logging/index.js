const { EmbedBuilder } = require('discord.js');
const { getConfig } = require('../../database');
const { LOG_TYPES } = require('../../config/constants');
const { truncate, postTo } = require('../../utils/helpers');

const userLine = (u) => (u ? `${u} (\`${u.id ?? u}\`)` : 'Unbekannt');

/**
 * Sendet einen Log-Eintrag.
 * Kanal-Reihenfolge: /logs channel für den Typ -> (Ticket-Logs) -> Standard-Log-Kanal.
 * opts.extraChannels: zusätzliche Kanäle, opts.content: Text/Ping über dem Embed.
 */
async function sendLog(guild, type, data = {}, opts = {}) {
  const def = LOG_TYPES[type];
  if (!def || !guild) return;
  const cfg = getConfig(guild.id);
  if (cfg.logs.enabled[type] === false) return;

  const ids = new Set(opts.extraChannels || []);
  const specific = cfg.logs.channels[type];
  if (specific) ids.add(specific);
  else if (def.group === 'ticket') ids.add(cfg.channels.TICKET_LOGS || cfg.channels.LOGS);
  else ids.add(cfg.channels.LOGS);
  ids.delete(null); ids.delete(undefined);
  if (!ids.size) return;

  const embed = new EmbedBuilder()
    .setColor(data.color ?? def.color)
    .setTitle(truncate(data.title || `${def.emoji} ${def.label}`, 250))
    .setTimestamp();
  if (data.description) embed.setDescription(truncate(data.description, 4000));
  if (data.fields?.length) {
    embed.addFields(data.fields.slice(0, 25).map((f) => ({
      name: truncate(f.name, 250), value: truncate(f.value || '—', 1000), inline: f.inline ?? false,
    })));
  }
  if (data.thumbnail) embed.setThumbnail(data.thumbnail);
  if (data.footer) embed.setFooter({ text: truncate(data.footer, 200) });

  const payload = { embeds: [embed], allowedMentions: opts.mentions || { parse: [] } };
  if (opts.content) payload.content = opts.content;
  await Promise.all([...ids].map((id) => postTo(guild, id, payload)));
}

module.exports = { sendLog, userLine };
