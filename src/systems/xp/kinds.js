// Text-XP und Voice-XP sind komplett getrennte Systeme mit eigenen Feldern in der Datenbank.
const KINDS = {
  text: { cfg: 'xp', xp: 'xp', level: 'level', daily: 'text', label: 'Text', emoji: '💬' },
  voice: { cfg: 'voice', xp: 'voiceXp', level: 'voiceLevel', daily: 'voice', label: 'Voice', emoji: '🎙️' },
};

// Benötigte XP von Level n zu n+1 (Formel wie bei MEE6)
const xpFor = (l) => 5 * l * l + 50 * l + 100;

function totalXpForLevel(l) {
  if (l <= 0) return 0;
  return Math.round((5 * ((l - 1) * l * (2 * l - 1))) / 6 + (50 * ((l - 1) * l)) / 2 + 100 * l);
}

function levelFromXp(xp) {
  let level = 0;
  let rest = Math.max(0, Math.floor(xp));
  while (level < 1000 && rest >= xpFor(level)) { rest -= xpFor(level); level++; }
  return { level, into: rest, need: xpFor(level) };
}

module.exports = { KINDS, xpFor, totalXpForLevel, levelFromXp };
