const CONFIG = require("../../config");
const logger = require("../utils/logger");
const { loadDb, registerNewPosition } = require("../utils/db");
const { runCliJson, runCliText } = require("./dex");
const { calcScore } = require("./position");

// ── Out-of-Range 자동 클로즈 ─────────────────────────────────────────────────
async function cleanOutOfRange(myList) {
  let outOfRange = [];
  const db = loadDb();

  for (const p of myList) {
    const nftMint = p.nftMintAddress ?? p.positionAddress;
    const createdAt = db[nftMint];
    const ageHours = createdAt
      ? (Date.now() - createdAt) / (60 * 60 * 1000)
      : 999;

    if (ageHours < CONFIG.rebalanceMinAgeHours) {
      continue;
    }

    if (p.inRange === false) {
      outOfRange.push(p);
    } else if (p.inRange === undefined) {
      try {
        const info = runCliJson(`positions analyze ${nftMint}`);
        const isOut = info?.data?.position?.inRange === false;
        const isHighRisk = info?.data?.rangeHealth?.outOfRangeRisk === "high";

        if (isOut || (CONFIG.closeOnHighRisk && isHighRisk)) {
          outOfRange.push(p);
          p.inRange = false;
        } else if (info?.data?.position?.inRange === true) {
          p.inRange = true;
        }
      } catch (e) {}
    }
  }

  if (outOfRange.length === 0) {
    logger.info("♻️  Out-of-Range 포지션 없음");
    return;
  }

  logger.info(`♻️  Out-of-Range 포지션 ${outOfRange.length}개 클로즈 시작...`);
  const flag = CONFIG.dryRun ? "--dry-run" : "--confirm";

  for (const pos of outOfRange) {
    const nftMint = pos.nftMintAddress ?? pos.positionAddress;
    logger.info(
      `  ❌ 클로즈: [${pos.pair ?? pos.poolAddress}] NFT: ${nftMint}`,
    );
    try {
      const result = runCliText(
        `positions close --nft-mint ${nftMint} ${flag}`,
      );
      const sig =
        result.match(/Signature\s+([1-9A-HJ-NP-Za-km-z]{32,88})/)?.[1] ?? "";
      logger.ok(`  클로즈 성공! Sig: ${sig}`);
    } catch (e) {
      logger.error(`  클로즈 실패: ${e.message.split("\n")[0]}`);
    }
  }
}

// ── 리밸런싱 (더 좋은 포지션 복사) ───────────────────────────────────────────
function rebalance(myList, allCandidates) {
  logger.info("🔄  리밸런싱 체크 중...");

  const db = loadDb();
  const myByPair = {};
  myList
    .filter((p) => p.inRange !== false)
    .forEach((p) => {
      const pair = p.pair || p.poolAddress;
      if (!myByPair[pair]) myByPair[pair] = [];
      p._yieldRate =
        parseFloat(p.earnedUsd || 0) /
        Math.max(parseFloat(p.liquidityUsd || 1), 1);

      const mint = p.nftMintAddress ?? p.positionAddress;
      const createdAt = db[mint];
      p._ageHours = createdAt
        ? (Date.now() - createdAt) / (60 * 60 * 1000)
        : 999;

      myByPair[pair].push(p);
    });

  const candidatesByPair = {};
  allCandidates.forEach((p) => {
    const pair = p.pair || p.poolAddress;
    if (!candidatesByPair[pair]) candidatesByPair[pair] = [];
    candidatesByPair[pair].push(p);
  });

  const flag = CONFIG.dryRun ? "--dry-run" : "--confirm";
  let triggered = 0;

  for (const [pair, candidates] of Object.entries(candidatesByPair)) {
    if (!myByPair[pair] || myByPair[pair].length === 0) continue;

    const best = candidates[0];
    const bestScore = calcScore(best);

    const myBest = myByPair[pair].sort(
      (a, b) => b._yieldRate - a._yieldRate,
    )[0];

    if (myBest._ageHours < CONFIG.rebalanceMinAgeHours) {
      logger.info(
        `  [유지] [${pair}] 최소 유지 시간(${CONFIG.rebalanceMinAgeHours}h) 미달 (현재 ${myBest._ageHours.toFixed(1)}h 경과)`,
      );
      continue;
    }

    const bestCandidateYield = parseFloat(best.earnedUsdPercent || 0) / 100;
    const threshold = CONFIG.rebalanceThreshold;

    if (bestScore <= 0 || bestCandidateYield <= 0) continue;

    const myYield = myBest._yieldRate;
    const improvement =
      myYield > 0 ? (bestCandidateYield - myYield) / myYield : 1;

    if (improvement < threshold) {
      logger.info(
        `  [유지] [${pair}] 현재 포지션 양호 (${(improvement * 100).toFixed(1)}% 개선 가능 → 기준 미달)`,
      );
      continue;
    }

    logger.info(
      `  ↑ [리밸런스] [${pair}] 더 좋은 포지션 발견! Score=${bestScore.toFixed(2)} | ${(improvement * 100).toFixed(1)}% 이상 개선`,
    );
    logger.info(`    대상: ${best.positionAddress}`);

    try {
      const result = runCliText(
        `positions copy --position ${best.positionAddress} --amount-usd ${CONFIG.copyAmountUsd} ${flag}`,
      );
      const nft =
        result.match(/NFT Address\s+([1-9A-HJ-NP-Za-km-z]{32,44})/)?.[1] ?? "";
      logger.ok(`  [리밸런스] [${pair}] 복사 성공! NFT: ${nft}`);
      if (nft && !CONFIG.dryRun) registerNewPosition(nft);
      triggered++;
    } catch (e) {
      logger.error(`  [리밸런스] [${pair}] 실패: ${e.message.split("\n")[0]}`);
    }
  }

  if (triggered === 0) {
    logger.info("  🔄  리밸런싱 대상 없음 (전체 포지션 유지 단계)");
  }
}

module.exports = {
  cleanOutOfRange,
  rebalance,
};
