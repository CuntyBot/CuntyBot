const { EmbedBuilder } = require('discord.js');
const { getConfig } = require('../../database');
const { LOG_TYPES } = require('../../config/constants');
const { truncate, postTo } = require('../../utils/helpers');

const userLine = (u) => (u ? `${u} (\`${u.id ?? u}\`)` : 'Unbekannt');

/** "ID: 123456789 | 04.10.2026 22:54" – im Stil von Carl-bot. */
function carlFooter(id, at = Date.now()) {
  const d = new Date(at);
  const date = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' });
  const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
  return `ID: ${id} | ${date} ${time}`;
}

/**
 * Sendet einen Log-Eintrag.
 * Kanal-Reihenfolge: /logs channel für den Typ -> (Ticket-Logs) -> Standard-Log-Kanal.
 * opts.extraChannels: zusätzliche Kanäle, opts.content: Text/Ping über dem Embed.
 *
 * data.target (User oder GuildMember): schaltet den Carl-bot-Stil ein –
 * Profilbild + Name oben (Author), Titel darunter, Fußzeile "ID: ... | Datum Uhrzeit".
 * Eigene data.footer überschreibt die automatische Fußzeile.
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

  const embed = new EmbedBuilder().setColor(data.color ?? def.color);

  let footer = data.footer;
  if (data.target) {
    const user = data.target.user ?? data.target;
    if (user?.username) embed.setAuthor({ name: user.username, iconURL: user.displayAvatarURL?.() ?? undefined });
    if (!footer && user?.id) footer = carlFooter(user.id);
  }

  embed.setTitle(truncate(data.title || `${def.emoji} ${def.label}`, 250));
  if (data.description) embed.setDescription(truncate(data.description, 4000));
  if (data.fields?.length) {
    embed.addFields(data.fields.slice(0, 25).map((f) => ({
      name: truncate(f.name, 250), value: truncate(f.value || '—', 1000), inline: f.inline ?? false,
    })));
  }
  if (data.thumbnail) embed.setThumbnail(data.thumbnail);
  if (footer) embed.setFooter({ text: truncate(footer, 200) });
  else embed.setTimestamp(); // kein Footer vorhanden -> normale Discord-Uhrzeit unten rechts

  const payload = { embeds: [embed], allowedMentions: opts.mentions || { parse: [] } };
  if (opts.content) payload.content = opts.content;
  await Promise.all([...ids].map((id) => postTo(guild, id, payload)));
}

module.exports = { sendLog, userLine, carlFooter };
