const fs = require("fs");
const path = require("path");
const CONFIG = require("../../config");
const logger = require("./logger");
const copiedSourceFile = path.join(CONFIG.logDir, "copied_sources_db.json");

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

function loadCopiedSources() {
  try {
    return JSON.parse(fs.readFileSync(copiedSourceFile, "utf8"));
  } catch (e) {
    return {};
  }
}

function saveCopiedSources(data) {
  try {
    fs.mkdirSync(CONFIG.logDir, { recursive: true });
    fs.writeFileSync(copiedSourceFile, JSON.stringify(data, null, 2));
  } catch (e) {
    logger.error("복사 원본 DB 저장 실패: " + e.message);
  }
}

function registerCopiedSource(positionAddress) {
  if (!positionAddress) return;
  const db = loadCopiedSources();
  db[positionAddress] = Date.now();
  saveCopiedSources(db);
}

module.exports = {
  loadDb,
  saveDb,
  registerNewPosition,
  loadCopiedSources,
  saveCopiedSources,
  registerCopiedSource,
};
