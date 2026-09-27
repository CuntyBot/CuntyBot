const { escapeHtml, pad4 } = require('../../utils/helpers');

const MAX_MESSAGES = 2000;
const fmtTime = (ms) => new Date(ms).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });

/** Erstellt ein Transkript (HTML + TXT) aller Nachrichten im Ticket-Kanal */
async function buildTranscript(channel, ticket) {
  const msgs = [];
  let before;
  while (msgs.length < MAX_MESSAGES) {
    const batch = await channel.messages.fetch({ limit: 100, before });
    if (!batch.size) break;
    msgs.push(...batch.values());
    before = batch.last().id;
    if (batch.size < 100) break;
  }
  msgs.reverse();

  const head = `Ticket #${pad4(ticket.number)} (${ticket.typeId}) – Ersteller-ID ${ticket.userId} – erstellt ${fmtTime(ticket.createdAt)}`;

  const txt = [head, '='.repeat(60)];
  const html = [];
  for (const m of msgs) {
    const time = fmtTime(m.createdTimestamp);
    const name = m.author.username + (m.author.bot ? ' [BOT]' : '');
    let body = m.cleanContent || '';
    const extras = [];
    for (const a of m.attachments.values()) extras.push(`Anhang: ${a.name} – ${a.url}`);
    for (const e of m.embeds) {
      const t = [e.title, e.description].filter(Boolean).join(' – ');
      if (t) extras.push(`[Embed] ${t}`);
    }
    txt.push(`[${time}] ${name}: ${body}${extras.length ? `\n    ${extras.join('\n    ')}` : ''}`);
    html.push(
      `<div class="m"><span class="t">${escapeHtml(time)}</span> <b>${escapeHtml(name)}</b><div>${escapeHtml(body).replace(/\n/g, '<br>')}</div>`
      + extras.map((x) => `<div class="x">${escapeHtml(x)}</div>`).join('') + '</div>',
    );
  }
  if (msgs.length >= MAX_MESSAGES) txt.push(`(Hinweis: auf die letzten ${MAX_MESSAGES} Nachrichten begrenzt)`);

  const page = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Transkript #${pad4(ticket.number)}</title>
<style>body{font-family:system-ui,sans-serif;background:#1e1f22;color:#dbdee1;margin:0;padding:16px}
h2{color:#fff}.m{background:#2b2d31;border-radius:8px;padding:8px 12px;margin:8px 0;word-break:break-word}
.t{color:#949ba4;font-size:12px}.x{color:#00a8fc;font-size:13px;margin-top:4px}</style></head>
<body><h2>${escapeHtml(head)}</h2><p>${msgs.length} Nachrichten</p>${html.join('\n')}</body></html>`;

  return { html: Buffer.from(page, 'utf8'), txt: Buffer.from(txt.join('\n'), 'utf8'), count: msgs.length };
}

module.exports = { buildTranscript };
