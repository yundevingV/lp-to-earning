#!/usr/bin/env node
"use strict";

const CONFIG = require("../config");
const logger = require("./utils/logger");
const {
  registerNewPosition,
} = require("./utils/db");
const { runCliJson, runCliText, getMyPositions } = require("./services/dex");
const {
  formatAge,
  calcApr,
  calcScore,
  SORT_FN,
} = require("./services/position");
const { askOllamaAdvisor } = require("./services/ai");
const { cleanOutOfRange, rebalance } = require("./services/rebalance");
const { monitor } = require("./services/monitor");
const { rechargeTokens, forceRechargeByPool, rechargeSolana } = require("./services/swap");

// ── 메인 실행 ─────────────────────────────────────────────────────────────────

// ── 메인 실행 ─────────────────────────────────────────────────────────────────
async function run() {
  const now = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  logger.info(`========== 봇 실행 시작 [${now}] ==========`);

  // 0. 토큰 자동 충전 (Slippage 방어용 충전식 스왑) 대신 SOL 가스비 방어
  await rechargeSolana();

  logger.info(
    `설정 | topN=${CONFIG.topN} | sortBy=${CONFIG.sortBy} | minPositionAPR=${CONFIG.minAprPercent}% | amount=$${CONFIG.copyAmountUsd} | dryRun=${CONFIG.dryRun}`,
  );

  let walletAddr;
  try {
    const out = runCliText("wallet address");
    if (out.includes("WALLET_NOT_CONFIGURED")) {
      logger.error("지갑 미설정 → byreal-cli setup 실행 필요");
      return;
    }
    walletAddr = out.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/)?.[0] ?? "?";
    logger.info(`지갑: ${walletAddr}`);
  } catch (e) {
    logger.error(`지갑 확인 실패: ${e.message}`);
    return;
  }

  const allCandidates = [];
  for (const pool of CONFIG.pools) {
    logger.info(`[${pool.name}] 포지션 조회 중...`);
    try {
      let currentPrice = 0;
      try {
        const poolInfo = runCliJson(`pools info ${pool.address}`);
        currentPrice = parseFloat(
          poolInfo?.data?.pool?.current_price ||
          poolInfo?.data?.current_price ||
          0,
        );
      } catch (e) { }

      const data = runCliJson(`positions top-positions --pool ${pool.address}`);
      const positions = data?.data?.positions ?? [];

      const filtered = positions.filter((p) => {
        if (CONFIG.requireInRange && !p.inRange) return false;
        return calcApr(p) >= CONFIG.minAprPercent;
      });

      logger.info(
        `[${pool.name}] 조건 충족 포지션(포지션APR>=${CONFIG.minAprPercent}%): ${filtered.length}개 (전체 ${positions.length}개 중)`,
      );

      filtered.forEach((p) => {
        p._poolName = pool.name;
        p._currentPrice = currentPrice;
        p._apr = calcApr(p);
      });

      allCandidates.push(...filtered);
    } catch (e) {
      logger.error(`[${pool.name}] 조회 실패: ${e.message}`);
    }
  }

  if (allCandidates.length === 0) {
    logger.warn("전체 풀에서 조건 만족하는 포지션 없음 → 종료");
    logger.info("========== 봇 실행 완료 ==========\n");
    return;
  }

  const sortFn = SORT_FN[CONFIG.sortBy] ?? SORT_FN.score;
  allCandidates.sort(sortFn);

  const preview = allCandidates.slice(0, 20);
  logger.info(
    `\n── 전체 순위 (${CONFIG.sortBy} 기준, 1차 필터링 전체 후보) ──`,
  );
  preview.forEach((p, i) => {
    const tvl = parseFloat(p.liquidityUsd).toFixed(0);
    const fee = parseFloat(p.earnedUsd).toFixed(2);
    const apr = p._apr.toFixed(1);
    const score = calcScore(p).toFixed(3);
    const age = formatAge(p.positionAgeMs);
    logger.info(
      `  ${String(i + 1).padStart(2)}위 [${p._poolName}] Score=${score} | TVL=$${tvl} | Fee=$${fee} | APR≈${apr}% | ${p.inRange ? "✅ In" : "⚠️ Out"} | 생성: ${age}`,
    );
  });
  logger.info("");

  let finalCandidates = [];
  const top10 = allCandidates.slice(0, 10);
  logger.info(
    `\n🤖 Ollama (gemma3:4b) 에게 상위 10개 후보에 대한 더블체크를 요청합니다...`,
  );

  const aiPicks = await askOllamaAdvisor(top10);
  if (aiPicks && Array.isArray(aiPicks) && aiPicks.length > 0) {
    logger.ok(`💡 AI 추천 완료! 추천된 ID: ${aiPicks.join(", ")}`);

    aiPicks.forEach((id) => {
      const found = allCandidates.find((p) => p.positionAddress === id);
      if (found) {
        finalCandidates.push(found);
      } else {
        logger.warn(
          `⚠️ AI가 추천한 ID(${id})를 현재 후보 100개 중에서 찾을 수 없습니다. (스킵)`,
        );
      }
    });

    allCandidates.forEach((p) => {
      if (!finalCandidates.includes(p)) finalCandidates.push(p);
    });
  } else {
    logger.warn(
      `⚠️ AI 추천을 받지 못했습니다. 기존 점수 기준(Score)으로 진행합니다.`,
    );
    finalCandidates = allCandidates;
  }

  const flag = CONFIG.dryRun ? "--dry-run" : "--confirm";
  const maxAttempts = Number(CONFIG.maxCopyAttempts || 10);
  const attemptCandidates = finalCandidates.slice(0, maxAttempts);
  let successCount = 0;
  let tryCount = 0;

  for (const pos of attemptCandidates) {
    if (successCount >= CONFIG.topN) break;
    tryCount++;

    logger.info(
      `[시도 ${tryCount}] [${pos._poolName}] 복사 → ${pos.positionAddress} (성공 ${successCount}/${CONFIG.topN})`,
    );

    // 안전 지연 (Safety Delay) 체크
    const uptimeMs = process.uptime() * 1000;
    const isSafetyLocked = uptimeMs < CONFIG.safetyDelayMs;

    if (!CONFIG.dryRun && isSafetyLocked) {
      const waitMin = Math.ceil((CONFIG.safetyDelayMs - uptimeMs) / 60000);
      logger.warn(
        `[Safety] 봇 시작 후 ${waitMin}분간은 실제 복사(트랜잭션)가 금지됩니다. (실수 방지용)`,
      );
      continue;
    }

    try {
      const result = runCliText(
        `positions copy --position ${pos.positionAddress} --amount-usd ${CONFIG.copyAmountUsd} ${flag}`,
      );
      const nft =
        result.match(/NFT Address\s+([1-9A-HJ-NP-Za-km-z]{32,44})/)?.[1] ?? "";
      logger.ok(`[${pos._poolName}] 복사 성공! NFT: ${nft}`);
      if (nft && !CONFIG.dryRun) registerNewPosition(nft);
      successCount++;
    } catch (e) {
      if (e.message.includes("insufficient") || e.message.includes("balance")) {
        logger.warn(`[${pos._poolName}] ⚠️ 잔액 부족 감지! 긴급 자동 충전을 시도합니다...`);
        const charged = await forceRechargeByPool(pos._poolName);
        if (charged) {
          logger.info(`[${pos._poolName}] 다시 복사(Retry)를 시도합니다...`);
          try {
            const retryResult = runCliText(
              `positions copy --position ${pos.positionAddress} --amount-usd ${CONFIG.copyAmountUsd} ${flag}`,
            );
            const nft =
              retryResult.match(/NFT Address\s+([1-9A-HJ-NP-Za-km-z]{32,44})/)?.[1] ?? "";
            logger.ok(`[${pos._poolName}] (재시도) 복사 성공! NFT: ${nft}`);
            if (nft && !CONFIG.dryRun) registerNewPosition(nft);
            successCount++;
            continue; // 실행 성공 시 반복문 진행
          } catch (retryErr) {
            logger.error(`[${pos._poolName}] 프리뷰/재시도 실패: ${retryErr.message.split("\n")[0]}`);
          }
        }
      }

      const reason = e.message.includes("insufficient")
        ? "잔액 부족 → 스킵"
        : e.message.split("\n")[0];
      logger.warn(`[${pos._poolName}] 실패 (${reason})`);
    }
  }

  if (successCount < CONFIG.topN) {
    logger.warn(
      `목표 ${CONFIG.topN}개 중 ${successCount}개만 성공 (최대 ${maxAttempts}개 후보 시도)`,
    );
  } else {
    logger.ok(`목표 달성! ${successCount}개 복사 완료 (${tryCount}번 시도)`);
  }

  let myList = [];
  try {
    myList = getMyPositions();
    logger.info(`\n내 전체 포지션: ${myList.length}개`);
    myList.forEach((p) => {
      const liq = parseFloat(p.liquidityUsd || 0).toFixed(2);
      const earned = parseFloat(p.earnedUsd || 0).toFixed(4);
      const status = p.inRange === false ? "⚠️ Out" : "✅ In(예상)";
      const age = formatAge(p.positionAgeMs);
      logger.info(
        `  • ${p.pair ?? p.poolAddress} | ${status} | Liq=$${liq} | Earned=$${earned} | ${p.nftMintAddress} | ${p.positionAddress}`,
      );
    });
  } catch (_) { }

  if (CONFIG.autoCloseOutOfRange) {
    await cleanOutOfRange(myList);
  }
  if (CONFIG.rebalanceEnabled) {
    rebalance(myList, allCandidates);
  }

  logger.info("========== 봇 실행 완료 ==========\n");
}

logger.info("LP Copy Bot v2 시작");
logger.info(`대상 풀: ${CONFIG.pools.map((p) => p.name).join(" / ")}`);
logger.info(
  `전략: ${CONFIG.sortBy} 기준 전체 정렬 → 상위 ${CONFIG.topN}개 복사 (1시간마다)`,
);
logger.info(`모니터링: 풀 현황 + 내 포지션 (10분마다)\n`);

setInterval(monitor, CONFIG.monitorIntervalMs);
setInterval(run, CONFIG.intervalMs);

monitor();
if (CONFIG.runOnStart) {
  run();
} else {
  logger.info(
    `\n⏳ 최초 복사(run)는 스킵되었습니다. 첫 번째 복사 및 리밸런싱은 1시간 뒤에 시작됩니다.`,
  );
}
