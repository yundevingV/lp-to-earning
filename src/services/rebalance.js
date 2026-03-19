const CONFIG = require("../../config");
const logger = require("../utils/logger");
const { loadDb, registerNewPosition } = require("../utils/db");
const { runCliJson, runCliText } = require("./dex");
const { calcScore, calcApr } = require("./position");

/**
 * @typedef {import("../types/position").PositionAnalyzeResponse} PositionAnalyzeResponse
 */

/**
 * positions analyze JSON 응답에서 포지션 판단값만 안전하게 추출합니다.
 * @param {PositionAnalyzeResponse} info
 */
function getAnalyzeState(info) {
  const inRange = info?.data?.position?.inRange;
  const outOfRangeRisk = info?.data?.rangeHealth?.outOfRangeRisk;
  const isOut = inRange === false;
  const isHighRisk = outOfRangeRisk === "high";
  return { inRange, isOut, isHighRisk };
}

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
        /** @type {PositionAnalyzeResponse} */
        const info = runCliJson(`positions analyze ${nftMint}`);
        const { inRange, isOut, isHighRisk } = getAnalyzeState(info);

        if (isOut || (CONFIG.closeOnHighRisk && isHighRisk)) {
          outOfRange.push(p);
          p.inRange = false;
        } else if (inRange === true) {
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
      p._apr = calcApr(p);

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
      (a, b) => b._apr - a._apr,
    )[0];

    if (myBest._ageHours < CONFIG.rebalanceMinAgeHours) {
      logger.info(
        `  [유지] [${pair}] 최소 유지 시간(${CONFIG.rebalanceMinAgeHours}h) 미달 (현재 ${myBest._ageHours.toFixed(1)}h 경과)`,
      );
      continue;
    }

    const bestApr = calcApr(best);
    const threshold = CONFIG.rebalanceThreshold;

    if (bestScore <= 0 || bestApr <= 0) continue;

    const myApr = myBest._apr;
    const improvement = myApr > 0 ? (bestApr - myApr) / myApr : 1;

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
      if (nft && !CONFIG.dryRun) {
        registerNewPosition(nft);
        const oldNft = myBest.nftMintAddress ?? myBest.positionAddress;
        logger.warn(`  [리밸런스] ❌ 교체 완료! 기존 저효율 포지션 정리를 시도합니다. (${oldNft})`);
        try {
          const closeResult = runCliText(`positions close --nft-mint ${oldNft} ${flag}`);
          const sig = closeResult.match(/Signature\s+([1-9A-HJ-NP-Za-km-z]{32,88})/)?.[1] ?? "";
          logger.ok(`  [리밸런스] 기존 포지션 클로즈 성공! Sig: ${sig}`);
        } catch (closeErr) {
          logger.error(`  [리밸런스] 기존 포지션 클로즈 실패: ${closeErr.message.split("\n")[0]}`);
        }
      }
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
