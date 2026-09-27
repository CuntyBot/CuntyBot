const time = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

module.exports = {
  info: (...a) => console.log(`[${time()}] [INFO]`, ...a),
  warn: (...a) => console.warn(`[${time()}] [WARN]`, ...a),
  error: (...a) => console.error(`[${time()}] [ERROR]`, ...a),
};
