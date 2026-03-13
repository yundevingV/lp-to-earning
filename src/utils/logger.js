const fs = require("fs");
const path = require("path");
const CONFIG = require("../../config");

const logFile = path.join(CONFIG.logDir, "bot.log");

function log(level, msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level.padEnd(5)}] ${msg}`;
  console.log(line);
  try {
    fs.mkdirSync(CONFIG.logDir, { recursive: true });
    fs.appendFileSync(logFile, line + "\n");
  } catch (_) {}
}

const logger = {
  info: (m) => log("INFO", m),
  warn: (m) => log("WARN", m),
  error: (m) => log("ERROR", m),
  ok: (m) => log("OK", m),
};

module.exports = logger;
