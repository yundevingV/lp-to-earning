const fs = require("fs");
const CONFIG = require("../../config");
const logger = require("./logger");

function loadDb() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG.dbFile, "utf8"));
  } catch (e) {
    return {};
  }
}

function saveDb(data) {
  try {
    fs.mkdirSync(CONFIG.logDir, { recursive: true });
    fs.writeFileSync(CONFIG.dbFile, JSON.stringify(data, null, 2));
  } catch (e) {
    logger.error("DB 저장 실패: " + e.message);
  }
}

function registerNewPosition(nftMint) {
  if (!nftMint) return;
  const db = loadDb();
  db[nftMint] = Date.now();
  saveDb(db);
}

module.exports = {
  loadDb,
  saveDb,
  registerNewPosition,
};
