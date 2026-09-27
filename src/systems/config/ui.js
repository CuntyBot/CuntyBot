const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  RoleSelectMenuBuilder, ChannelSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType,
} = require('discord.js');
const db = require('../../database');
const { AREAS, TEXT_CH, ANY_CH } = require('./schema');
const { COLORS } = require('../../config/constants');
const { isOwner, isAdmin } = require('../../utils/permissions');
const { truncate, fmtNum } = require('../../utils/helpers');
const { sendLog } = require('../logging');

const canOpen = (member, areaKey) => (AREAS[areaKey].perm === 'owner' ? isOwner(member) : isAdmin(member));
const visibleAreas = (member) => Object.entries(AREAS).filter(([, a]) => (a.perm === 'owner' ? isOwner(member) : isAdmin(member)));

function displayValue(guild, field) {
  const cfg = db.getConfig(guild.id);
  const value = db.getPath(cfg, field.path);
  switch (field.type) {
    case 'bool': return value ? '✅ An' : '❌ Aus';
    case 'role': return value && guild.roles.cache.has(value) ? `<@&${value}>` : '*nicht gesetzt*';
    case 'roles': return value?.length ? value.filter((id) => guild.roles.cache.has(id)).map((id) => `<@&${id}>`).join(', ') || '*nicht gesetzt*' : '*keine*';
    case 'channel': case 'category': return value && guild.channels.cache.has(value) ? `<#${value}>` : '*nicht gesetzt*';
    case 'channels': return value?.length ? value.filter((id) => guild.channels.cache.has(id)).map((id) => `<#${id}>`).join(', ') || '*keine*' : '*keine*';
    case 'enum': { const c = field.choices.find(([v]) => v === value); return c ? c[1] : String(value); }
    case 'int': return fmtNum(value ?? 0);
    default: return value ? truncate(String(value), 100) : '*leer*';
  }
}

function areaEmbed(guild, areaKey) {
  const area = AREAS[areaKey];
  const e = new EmbedBuilder().setColor(COLORS.primary).setTitle(`${area.emoji} Konfiguration: ${area.label}`)
    .addFields(area.fields.map((f) => ({ name: f.label, value: displayValue(guild, f), inline: true })));
  if (area.note) e.setFooter({ text: area.note });
  return e;
}

function areaPayload(guild, areaKey) {
  const area = AREAS[areaKey];
  const picker = new StringSelectMenuBuilder().setCustomId(`cfgpick:${areaKey}`).setPlaceholder('Einstellung auswählen …')
    .addOptions(area.fields.map((f, i) => ({ label: truncate(f.label, 100), value: String(i) })));
  const back = new ButtonBuilder().setCustomId('cfgmenu').setLabel('Zurück zum Menü').setEmoji('↩️').setStyle(ButtonStyle.Secondary);
  return { embeds: [areaEmbed(guild, areaKey)], components: [new ActionRowBuilder().addComponents(picker), new ActionRowBuilder().addComponents(back)] };
}

function menuPayload(member) {
  const areas = visibleAreas(member);
  const select = new StringSelectMenuBuilder().setCustomId('cfgmenu').setPlaceholder('Bereich auswählen …')
    .addOptions(areas.map(([key, a]) => ({ label: a.label, value: key, emoji: a.emoji })));
  const embed = new EmbedBuilder().setColor(COLORS.primary).setTitle('⚙️ Bot-Konfiguration')
    .setDescription('Wähle unten einen Bereich aus, um Einstellungen zu ändern.');
  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(select)] };
}

function viewPayload(guild, member) {
  const areas = visibleAreas(member);
  const embed = new EmbedBuilder().setColor(COLORS.primary).setTitle('📄 Aktuelle Serverkonfiguration');
  for (const [key, area] of areas) {
    const lines = area.fields.slice(0, 8).map((f) => `**${f.label}:** ${displayValue(guild, f)}`).join('\n');
    embed.addFields({ name: `${area.emoji} ${area.label}`, value: truncate(lines, 1000) || '—' });
  }
  return { embeds: [embed] };
}

function channelTypesFor(field) {
  if (field.channelTypes) return field.channelTypes;
  if (field.type === 'category') return [ChannelType.GuildCategory];
  if (field.type === 'channel') return TEXT_CH;
  return ANY_CH;
}

async function setValue(i, areaKey, idx, rawValue) {
  const field = AREAS[areaKey].fields[idx];
  const guild = i.guild;
  if (field.validate) {
    const err = field.validate(rawValue, guild);
    if (err) return { error: err };
  }
  const cfg = db.getConfig(guild.id);
  db.setPath(cfg, field.path, rawValue);
  db.save();
  await sendLog(guild, 'botActions', { description: `⚙️ **${AREAS[areaKey].label} → ${field.label}** geändert von ${i.user}.` });
  return { ok: true };
}

async function renderArea(i, areaKey) { await i.update(areaPayload(i.guild, areaKey)); }
async function renderMenu(i) { await i.update(menuPayload(i.member)); }

/* ---------- Auswahl eines Feldes ---------- */
async function handlePick(i) {
  const [, areaKey] = i.customId.split(':');
  if (!canOpen(i.member, areaKey)) return i.reply({ content: '⛔ Keine Berechtigung.', flags: 64 });
  const idx = Number(i.values[0]);
  const field = AREAS[areaKey].fields[idx];
  const cfg = db.getConfig(i.guild.id);

  if (field.type === 'bool') {
    const cur = db.getPath(cfg, field.path);
    await setValue(i, areaKey, idx, !cur);
    return renderArea(i, areaKey);
  }
  if (field.type === 'int' || field.type === 'text') {
    const current = db.getPath(cfg, field.path);
    const input = new TextInputBuilder().setCustomId('value').setLabel(truncate(field.label, 45))
      .setStyle(field.long ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(field.type === 'int').setMaxLength(field.max || (field.type === 'int' ? 10 : 500))
      .setValue(current == null ? '' : String(current));
    if (field.hint) input.setPlaceholder(truncate(field.hint, 100));
    const modal = new ModalBuilder().setCustomId(`cfgmodal:${areaKey}:${idx}`).setTitle(truncate(field.label, 45))
      .addComponents(new ActionRowBuilder().addComponents(input));
    return i.showModal(modal);
  }
  if (field.type === 'enum') {
    const select = new StringSelectMenuBuilder().setCustomId(`cfgenum:${areaKey}:${idx}`).setPlaceholder('Wert wählen …')
      .addOptions(field.choices.map(([value, label]) => ({ label, value })));
    const back = new ButtonBuilder().setCustomId(`cfgback:${areaKey}`).setLabel('Zurück').setEmoji('↩️').setStyle(ButtonStyle.Secondary);
    return i.update({ embeds: [areaEmbed(i.guild, areaKey)], components: [new ActionRowBuilder().addComponents(select), new ActionRowBuilder().addComponents(back)] });
  }
  if (field.type === 'role' || field.type === 'roles') {
    const menu = new RoleSelectMenuBuilder().setCustomId(`cfgrole:${areaKey}:${idx}`).setPlaceholder('Rolle(n) wählen …')
      .setMinValues(field.type === 'roles' ? 0 : 1).setMaxValues(field.type === 'roles' ? 25 : 1);
    const back = new ButtonBuilder().setCustomId(`cfgback:${areaKey}`).setLabel('Zurück').setEmoji('↩️').setStyle(ButtonStyle.Secondary);
    return i.update({ embeds: [areaEmbed(i.guild, areaKey)], components: [new ActionRowBuilder().addComponents(menu), new ActionRowBuilder().addComponents(back)] });
  }
  if (['channel', 'channels', 'category'].includes(field.type)) {
    const menu = new ChannelSelectMenuBuilder().setCustomId(`cfgchan:${areaKey}:${idx}`).setPlaceholder('Kanal/Kanäle wählen …')
      .setChannelTypes(channelTypesFor(field)).setMinValues(field.type === 'channels' ? 0 : 1).setMaxValues(field.type === 'channels' ? 25 : 1);
    const back = new ButtonBuilder().setCustomId(`cfgback:${areaKey}`).setLabel('Zurück').setEmoji('↩️').setStyle(ButtonStyle.Secondary);
    return i.update({ embeds: [areaEmbed(i.guild, areaKey)], components: [new ActionRowBuilder().addComponents(menu), new ActionRowBuilder().addComponents(back)] });
  }
}

async function handleEnum(i) {
  const [, areaKey, idxStr] = i.customId.split(':');
  const r = await setValue(i, areaKey, Number(idxStr), i.values[0]);
  if (r.error) return i.reply({ content: `❌ ${r.error}`, flags: 64 });
  return renderArea(i, areaKey);
}
async function handleRole(i) {
  const [, areaKey, idxStr] = i.customId.split(':');
  const field = AREAS[areaKey].fields[Number(idxStr)];
  const value = field.type === 'roles' ? i.values : (i.values[0] ?? null);
  const r = await setValue(i, areaKey, Number(idxStr), value);
  if (r.error) return i.reply({ content: `❌ ${r.error}`, flags: 64 });
  return renderArea(i, areaKey);
}
async function handleChannel(i) {
  const [, areaKey, idxStr] = i.customId.split(':');
  const field = AREAS[areaKey].fields[Number(idxStr)];
  const value = field.type === 'channels' ? i.values : (i.values[0] ?? null);
  const r = await setValue(i, areaKey, Number(idxStr), value);
  if (r.error) return i.reply({ content: `❌ ${r.error}`, flags: 64 });
  return renderArea(i, areaKey);
}
async function handleModal(i) {
  const [, areaKey, idxStr] = i.customId.split(':');
  const idx = Number(idxStr);
  const field = AREAS[areaKey].fields[idx];
  let raw = i.fields.getTextInputValue('value');
  if (field.type === 'int') {
    const n = Number(raw);
    if (!Number.isFinite(n)) return i.reply({ content: '❌ Bitte eine Zahl eingeben.', flags: 64 });
    raw = Math.round(n);
    if (field.min != null && raw < field.min) return i.reply({ content: `❌ Minimum ist ${field.min}.`, flags: 64 });
    if (field.max != null && raw > field.max) return i.reply({ content: `❌ Maximum ist ${field.max}.`, flags: 64 });
  }
  const r = await setValue(i, areaKey, idx, raw);
  if (r.error) return i.reply({ content: `❌ ${r.error}`, flags: 64 });
  return i.update(areaPayload(i.guild, areaKey));
}
async function handleBack(i) { await renderArea(i, i.customId.split(':')[1]); }

module.exports = {
  areaPayload, menuPayload, viewPayload, canOpen, renderArea, renderMenu,
  handlePick, handleEnum, handleRole, handleChannel, handleModal, handleBack,
};
