/**
 * Dünner Kompatibilitäts-Wrapper: die eigentliche Oberfläche lebt in ui.js
 * (dort auch die Interaktions-Handler für Select-Menüs, Buttons und Modals).
 */
const ui = require('./ui');
const { AREAS } = require('./schema');
const { respond } = require('../../utils/helpers');

const homeView = (member) => ui.menuPayload(member);
const areaView = (guild, areaKey) => ui.areaPayload(guild, areaKey);

async function guardArea(i, areaKey) {
  if (!ui.canOpen(i.member, areaKey)) {
    await respond(i, '⛔ Dafür fehlt dir die Berechtigung.');
    return false;
  }
  return true;
}

module.exports = { AREAS, homeView, areaView, guardArea, ui };
