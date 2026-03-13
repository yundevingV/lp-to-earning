const CONFIG = require("../../config");
const logger = require("../utils/logger");
const { runCliJson } = require("./dex");
const { getMyPositions } = require("./dex");
const { formatAge } = require("./position");

async function monitor() {
  const now = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  logger.info(`┌──── 📊 모니터링 [${now}] ────`);

  for (const pool of CONFIG.pools) {
    try {
      const data = runCliJson(`pools info ${pool.address}`);
      const p = data?.data?.pool ?? data?.data ?? {};
      const tvl = parseFloat(p.tvl_usd || 0).toFixed(0);
      const apr = parseFloat(p.apr || 0).toFixed(1);
      const vol24h = parseFloat(p.volume_24h_usd || 0).toFixed(0);
      const fee24h = parseFloat(p.fee_24h_usd || 0).toFixed(2);
      const price = parseFloat(p.current_price || 0).toFixed(2);
      logger.info(
        `│ [${pool.name}] 가격=$${price} | TVL=$${tvl} | APR=${apr}% | 24h 거래량=$${vol24h} | 24h Fee=$${fee24h}`,
      );
    } catch (e) {
      logger.warn(`│ [${pool.name}] 풀 조회 실패: ${e.message.split("\n")[0]}`);
    }
  }

  try {
    const myList = getMyPositions();
    const totalLiq = myList.reduce(
      (s, p) => s + parseFloat(p.liquidityUsd || 0),
      0,
    );
    const totalEarned = myList.reduce(
      (s, p) => s + parseFloat(p.earnedUsd || 0),
      0,
    );
    logger.info(`│`);
    logger.info(
      `│ 💼 내 포지션 총 ${myList.length}개 | 총 유동성=$${totalLiq.toFixed(2)} | 총 수수료=$${totalEarned.toFixed(4)}`,
    );
    myList.forEach((p) => {
      const liq = parseFloat(p.liquidityUsd || 0).toFixed(2);
      const earned = parseFloat(p.earnedUsd || 0).toFixed(4);
      const status = p.inRange === false ? "⚠️ Out" : "✅ In(예상)";
      const age = formatAge(p.positionAgeMs);
      logger.info(
        `│   • ${(p.pair || "").padEnd(10)} ${status} | Liq=$${liq} | Earned=$${earned} | 생성: ${age} | ${p.nftMintAddress ?? p.positionAddress}`,
      );
    });
  } catch (e) {
    logger.warn(`│ 내 포지션 조회 실패: ${e.message.split("\n")[0]}`);
  }

  logger.info(`└${"─".repeat(50)}`);
}

module.exports = {
  monitor,
};
