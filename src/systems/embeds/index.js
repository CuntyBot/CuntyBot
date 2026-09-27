const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const { getConfig } = require('../../database');
const { COLORS } = require('../../config/constants');
const { parseHex } = require('../../utils/helpers');
const { isAdmin, isStaff, hasRole } = require('../../utils/permissions');

/* Entwürfe liegen im Arbeitsspeicher (pro Server + User) und laufen nach 1 Stunde ab */
const drafts = new Map();
const TTL = 60 * 60 * 1000;
const key = (guildId, userId) => `${guildId}:${userId}`;

const emptyDraft = () => ({
  title: null, description: null, color: null, url: null, image: null, thumbnail: null,
  footerText: null, footerIcon: null, authorName: null, authorIcon: null, authorUrl: null,
  timestamp: false, fields: [], buttons: [], editTarget: null, updatedAt: Date.now(),
});

function getDraft(guildId, userId) {
  const d = drafts.get(key(guildId, userId));
  if (d && Date.now() - d.updatedAt > TTL) { drafts.delete(key(guildId, userId)); return null; }
  return d || null;
}
function newDraft(guildId, userId) { const d = emptyDraft(); drafts.set(key(guildId, userId), d); return d; }
const touch = (d) => { d.updatedAt = Date.now(); };
const deleteDraft = (guildId, userId) => drafts.delete(key(guildId, userId));

setInterval(() => { for (const [k, d] of drafts) if (Date.now() - d.updatedAt > TTL) drafts.delete(k); }, 10 * 60 * 1000).unref();

/** Wer darf Embeds erstellen/veröffentlichen? Admin/Owner immer, Team wenn erlaubt */
function canUseEmbeds(member) {
  if (isAdmin(member)) return true;
  return getConfig(member.guild.id).embeds.teamCanUse && (isStaff(member) || hasRole(member, 'MODERATOR'));
}

const isEmpty = (d) => !(d.title || d.description || d.fields.length || d.image || d.thumbnail || d.authorName || d.footerText);

function embedLength(d) {
  return [d.title, d.description, d.footerText, d.authorName, ...d.fields.flatMap((f) => [f.name, f.value])]
    .reduce((n, s) => n + (s ? s.length : 0), 0);
}

function buildEmbed(d, guildId) {
  const e = new EmbedBuilder();
  const cfg = guildId ? getConfig(guildId) : null;
  e.setColor(parseHex(d.color) ?? parseHex(cfg?.embeds.defaultColor) ?? COLORS.primary);
  if (d.title) e.setTitle(d.title);
  if (d.description) e.setDescription(d.description);
  if (d.url && d.title) e.setURL(d.url);
  if (d.image) e.setImage(d.image);
  if (d.thumbnail) e.setThumbnail(d.thumbnail);
  if (d.footerText) e.setFooter({ text: d.footerText, iconURL: d.footerIcon || undefined });
  if (d.authorName) e.setAuthor({ name: d.authorName, iconURL: d.authorIcon || undefined, url: d.authorUrl || undefined });
  if (d.timestamp) e.setTimestamp();
  if (d.fields.length) e.addFields(d.fields.map((f) => ({ name: f.name, value: f.value, inline: f.inline })));
  return e;
}

function linkRow(d) {
  if (!d.buttons.length) return [];
  const row = new ActionRowBuilder();
  for (const b of d.buttons.slice(0, 5)) {
    const btn = new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(b.label).setURL(b.url);
    if (b.emoji) btn.setEmoji(b.emoji);
    row.addComponents(btn);
  }
  return [row];
}

/** Nachricht, die tatsächlich veröffentlicht wird */
const sendPayload = (d, guildId) => ({ embeds: [buildEmbed(d, guildId)], components: linkRow(d) });

/** Vorschau im Builder (leere Embeds werden durch einen Platzhalter ersetzt) */
function previewPayload(d, guildId) {
  if (isEmpty(d)) {
    return { embeds: [new EmbedBuilder().setColor(COLORS.neutral).setDescription('*Leerer Embed – nutze die Buttons unten, um Inhalt hinzuzufügen.*')], components: [] };
  }
  return sendPayload(d, guildId);
}

function builderPayload(d, guildId) {
  const prev = previewPayload(d, guildId);
  const b = (id, label, emoji, style = ButtonStyle.Secondary, disabled = false) =>
    new ButtonBuilder().setCustomId(`embed:${id}`).setLabel(label).setEmoji(emoji).setStyle(style).setDisabled(disabled);
  const row1 = new ActionRowBuilder().addComponents(
    b('basic', 'Text', '📝', ButtonStyle.Primary), b('images', 'Bilder', '🖼️', ButtonStyle.Primary),
    b('footer', 'Footer/Autor', '🦶', ButtonStyle.Primary), b('field', 'Feld +', '➕'), b('link', 'Button +', '🔗'),
  );
  const row2 = new ActionRowBuilder().addComponents(
    b('ts', d.timestamp ? 'Zeit: An' : 'Zeit: Aus', '⏱️'),
    b('delfield', 'Feld −', '➖', ButtonStyle.Secondary, !d.fields.length),
    b('dellink', 'Button −', '✂️', ButtonStyle.Secondary, !d.buttons.length),
    b('sendhere', d.editTarget ? 'Speichern' : 'Hier senden', '📤', ButtonStyle.Success, isEmpty(d)),
    b('cancel', 'Abbrechen', '🗑️', ButtonStyle.Danger),
  );
  const info = d.editTarget ? '✏️ **Bearbeite eine bestehende Nachricht.**' : '🎨 **Embed-Builder**';
  return {
    content: `${info} Vorschau:\nMit \`/embed send channel:#kanal\` sendest du den Embed in einen anderen Kanal.`,
    embeds: prev.embeds,
    components: [...prev.components, row1, row2],
  };
}

/** Lädt einen bestehenden Bot-Embed in einen Entwurf */
function draftFromMessage(msg, guildId, userId, channelId) {
  const d = newDraft(guildId, userId);
  const e = msg.embeds[0];
  if (e) {
    Object.assign(d, {
      title: e.title, description: e.description, color: e.hexColor, url: e.url,
      image: e.image?.url ?? null, thumbnail: e.thumbnail?.url ?? null,
      footerText: e.footer?.text ?? null, footerIcon: e.footer?.iconURL ?? null,
      authorName: e.author?.name ?? null, authorIcon: e.author?.iconURL ?? null, authorUrl: e.author?.url ?? null,
      timestamp: Boolean(e.timestamp),
      fields: e.fields.map((f) => ({ name: f.name, value: f.value, inline: f.inline })),
    });
  }
  for (const row of msg.components) {
    for (const c of row.components) if (c.url) d.buttons.push({ label: c.label || 'Link', url: c.url, emoji: null });
  }
  d.editTarget = { channelId, messageId: msg.id };
  return d;
}

module.exports = {
  getDraft, newDraft, deleteDraft, touch, canUseEmbeds, isEmpty, embedLength,
  buildEmbed, sendPayload, previewPayload, builderPayload, draftFromMessage,
};
