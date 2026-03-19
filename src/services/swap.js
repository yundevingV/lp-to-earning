const CONFIG = require("../../config");
const logger = require("../utils/logger");
const { runCliJson } = require("./dex");

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOL_MINT = "So11111111111111111111111111111111111111112";

/**
 * 지갑 잔고를 확인하고, 부족한 xStock 토큰을 USDC로 충전(Swap)합니다.
 * 슬리피지 방어를 위해 매번 스왑하지 않고, 설정된 임계치 미만일 때만 '충전식'으로 동작합니다.
 */
async function rechargeTokens() {
  if (!CONFIG.autoRecharge || !CONFIG.autoRecharge.enabled) return;

  logger.info("── 🔄 토큰 자동 충전 체크 (Recharge) ──");

  try {
    // 1. 지갑 잔고 조회
    const balanceData = runCliJson("wallet balance");
    const balance = balanceData?.data?.balance;
    const tokens = balance?.tokens || [];
    const solAmount = balance?.sol?.amount_sol || 0;

    // 1-1. 기본 자산 로그 (SOL & USDC)
    const usdcToken = tokens.find((t) => t.mint === USDC_MINT);
    const usdcAmount = parseFloat(usdcToken?.amount_ui || 0);

    logger.info(`│ [SOL] 현재 잔고: ${solAmount.toFixed(4)} SOL (가스비)`);
    logger.info(`│ [USDC] 현재 잔고: $${usdcAmount.toFixed(2)} (충전용 총알)`);
    logger.info(`│`);

    // 2. 현재 시장가 조회를 위해 토큰 리스트 가져오기 (가격 정보 포함)
    const tokenListFull = runCliJson("tokens list");
    const tokenMap = {};
    (tokenListFull?.data?.tokens || []).forEach((t) => {
      tokenMap[t.mint] = t;
    });

    for (const target of CONFIG.autoRecharge.tokens) {
      const myToken = tokens.find((t) => t.mint === target.mint);
      const balanceUi = parseFloat(myToken?.amount_ui || 0);
      const priceUsd = parseFloat(tokenMap[target.mint]?.price_usd || 0);
      const valueUsd = balanceUi * priceUsd;

      logger.info(
        `│ [${target.name}] 현재 잔고: ${balanceUi.toFixed(4)} ($${valueUsd.toFixed(2)})`,
      );

      // 3. 임계치($2) 미만인지 확인
      if (valueUsd < CONFIG.autoRecharge.thresholdUsd) {
        logger.warn(
          `│ ⚠️ [${target.name}] 잔고 부족 ($${valueUsd.toFixed(2)} < $${CONFIG.autoRecharge.thresholdUsd}) -> 충전 필요`,
        );

        const rechargeAmount = CONFIG.autoRecharge.rechargeAmountUsd;

        // 4. 스왑 실행 (USDC -> Target Token)
        // dryRun 설정에 따라 --dry-run 또는 --confirm 결정
        // ── 🛡️ 최초 10분 안전 잠금 (Safety Lock) ─────────────────────────────
        const uptimeMs = process.uptime() * 1000;
        const isSafetyLocked = uptimeMs < (CONFIG.safetyDelayMs || 600000);

        let dryRunFlag = CONFIG.dryRun ? "--dry-run" : "--confirm";
        if (isSafetyLocked && !CONFIG.dryRun) {
          const waitMin = Math.ceil(
            ((CONFIG.safetyDelayMs || 600000) - uptimeMs) / 60000,
          );
          logger.warn(
            `│ [Safety] 봇 시작 후 ${waitMin}분간은 실제 클레이가 아닌 시뮬레이션으로만 동작합니다.`,
          );
          dryRunFlag = "--dry-run";
        }

        const cmd = `swap execute --input-mint ${USDC_MINT} --output-mint ${target.mint} --amount ${rechargeAmount} ${dryRunFlag}`;

        if (CONFIG.dryRun || (isSafetyLocked && !CONFIG.dryRun)) {
          logger.info(`│ [Dry Run] 스왑 시뮬레이션: ${cmd}`);
          try {
            const result = runCliJson(cmd);
            if (result.success) {
              logger.info(
                `│ ✅ [${target.name}] 시뮬레이션 결과: USDC $${rechargeAmount} => 약 ${result.data?.uiOutAmount} ${target.name}`,
              );
            }
          } catch (simErr) {
            logger.info(
              `│ ℹ️ [Dry Run] 시뮬레이션 상세: ${simErr.message.split("\n")[0]}`,
            );
          }
        } else {
          try {
            logger.info(
              `│ [Action] 실제 스왑 실행: USDC $${rechargeAmount} -> ${target.name}`,
            );
            const result = runCliJson(cmd);

            if (result.success) {
              logger.info(
                `│ ✅ [${target.name}] 충전 성공! (TX: ${result.data?.signature || "N/A"})`,
              );
            } else {
              logger.error(
                `│ ❌ [${target.name}] 충전 실패: ${JSON.stringify(result.error || result)}`,
              );
            }
          } catch (swapErr) {
            logger.error(
              `│ ❌ [${target.name}] 스왑 시도 중 에러: ${swapErr.message}`,
            );
          }
        }
      } else {
        logger.info(
          `│ ✅ [${target.name}] 잔고 충분 ($${valueUsd.toFixed(2)} >= $${CONFIG.autoRecharge.thresholdUsd}) -> 충전 패스`,
        );
      }
    }
  } catch (e) {
    logger.error(`│ ❌ 토큰 충전 프로세스 중 에러: ${e.message}`);
  }

  logger.info("└──────────────────────────────────");
}

/**
 * 특정 풀에 매칭되는 토큰을 즉시 강제 충전합니다 (Retry용)
 * @param {string} poolName 
 */
async function forceRechargeByPool(poolName) {
  if (!CONFIG.autoRecharge || !CONFIG.autoRecharge.enabled) return false;

  const target = CONFIG.autoRecharge.tokens.find((t) =>
    poolName.includes(t.name),
  );
  if (!target) {
    logger.warn(`│ [Recharge] 해당 풀(${poolName})에 매칭되는 자동 충전 설정을 찾을 수 없습니다.`);
    return false;
  }

  logger.warn(`│ [Recharge] ⚠️ 긴급 스왑 충전 시작: [${target.name}]`);
  const rechargeAmount = CONFIG.autoRecharge.rechargeAmountUsd || 5;
  const flag = CONFIG.dryRun ? "--dry-run" : "--confirm";
  const cmd = `swap execute --input-mint ${USDC_MINT} --output-mint ${target.mint} --amount ${rechargeAmount} ${flag}`;

  try {
    const result = runCliJson(cmd);
    if (result.success) {
      logger.ok(`│ [Recharge] ✅ ${target.name} 긴급 충전 완료!`);
      return true;
    } else {
      logger.error(`│ [Recharge] ❌ 충전 실패: ${JSON.stringify(result.error || result)}`);
      return false;
    }
  } catch (err) {
    logger.error(`│ [Recharge] ❌ 스왑 시도 중 에러: ${err.message}`);
    return false;
  }
}

/**
 * SOL 잔고가 0.03 이하일 때 0.03 SOL 만큼 충전합니다.
 */
async function rechargeSolana() {
  logger.info("── 🔄 SOL 자동 충전 체크 (Recharge) ──");
  try {
    const balanceData = runCliJson("wallet balance");
    const balance = balanceData?.data?.balance;
    const solAmount = balance?.sol?.amount_sol || 0;

    logger.info(`│ [SOL] 현재 잔고: ${solAmount.toFixed(4)} SOL`);

    if (solAmount <= 0.03) {
      logger.warn(`│ ⚠️ [SOL] 잔고 부족 (${solAmount.toFixed(4)} <= 0.03) -> 0.03 SOL 충전 시도`);

      const tokenListFull = runCliJson("tokens list");
      const tokenMap = {};
      (tokenListFull?.data?.tokens || []).forEach((t) => {
        tokenMap[t.mint] = t;
      });

      // SOL(WSOL) 가격 조회, 없으면 대략 200불 가정
      const solPrice = parseFloat(tokenMap[SOL_MINT]?.price_usd || 200);
      const rechargeUsdc = Math.ceil(0.03 * solPrice); // 약 0.03개 만큼의 USDC 계산

      const uptimeMs = process.uptime() * 1000;
      const isSafetyLocked = uptimeMs < (CONFIG.safetyDelayMs || 600000);
      let dryRunFlag = CONFIG.dryRun ? "--dry-run" : "--confirm";

      if (isSafetyLocked && !CONFIG.dryRun) {
        logger.warn(`│ [Safety] 봇 시작 후 대기 시간 중이므로 시뮬레이션으로만 동작합니다.`);
        dryRunFlag = "--dry-run";
      }

      const cmd = `swap execute --input-mint ${USDC_MINT} --output-mint ${SOL_MINT} --amount ${rechargeUsdc} ${dryRunFlag}`;

      try {
        if (CONFIG.dryRun || (isSafetyLocked && !CONFIG.dryRun)) {
          logger.info(`│ [Dry Run] 시뮬레이션: ${cmd}`);
          const result = runCliJson(cmd);
          if (result.success) {
             logger.info(`│ ✅ [SOL] 시뮬레이션 결과: USDC $${rechargeUsdc} => 약 ${result.data?.uiOutAmount} SOL`);
          }
        } else {
          logger.info(`│ [Action] 실제 스왑 실행: USDC $${rechargeUsdc} -> SOL (목표 0.03 SOL)`);
          const result = runCliJson(cmd);
  
          if (result.success) {
            logger.info(`│ ✅ [SOL] 충전 성공! (TX: ${result.data?.signature || "N/A"})`);
          } else {
            logger.error(`│ ❌ [SOL] 충전 실패: ${JSON.stringify(result.error || result)}`);
          }
        }
      } catch (err) {
        logger.error(`│ ❌ [SOL] 스왑 시도 중 에러: ${err.message}`);
      }
    } else {
      logger.info(`│ ✅ [SOL] 잔고 충분 (${solAmount.toFixed(4)} > 0.03) -> 충전 패스`);
    }
  } catch (e) {
    logger.error(`│ ❌ SOL 토큰 충전 프로세스 중 에러: ${e.message}`);
  }
  logger.info("└──────────────────────────────────");
}

module.exports = {
  rechargeTokens,
  forceRechargeByPool,
  rechargeSolana,
};
