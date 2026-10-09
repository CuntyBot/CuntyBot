/**
 * Kleiner Webserver für Hosting (z. B. Render).
 *  - Render verlangt, dass ein Web Service auf dem Port aus der Umgebungsvariable PORT lauscht.
 *  - Dein Cron-Job / Pinger ruft /health regelmäßig auf, damit der Dienst nicht einschläft.
 * Antwortet immer mit 200, damit ein Discord-Problem keinen Neustart-Loop bei Render auslöst.
 */
const http = require('http');
const logger = require('./utils/logger');

function startWebServer(client) {
  const port = Number(process.env.PORT) || 3000;
  const server = http.createServer((req, res) => {
    const url = (req.url || '/').split('?')[0];
    if (url === '/' || url === '/health' || url === '/ping') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        status: client.isReady() ? 'online' : 'starting',
        uptimeSeconds: Math.round(process.uptime()),
        guilds: client.guilds.cache.size,
        pingMs: client.ws.ping,
      }));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  });
  server.on('error', (e) => logger.error(`Webserver-Fehler: ${e.message}`));
  server.listen(port, '0.0.0.0', () => logger.info(`🌐 Webserver läuft auf Port ${port} (Health-Check: /health)`));
  return server;
}

module.exports = { startWebServer };
