const CONFIG = require("../../config");
const logger = require("../utils/logger");
const { runCliJson } = require("./dex");

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

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
        const dryRunFlag = CONFIG.dryRun ? "--dry-run" : "--confirm";
        const cmd = `swap execute --input-mint ${USDC_MINT} --output-mint ${target.mint} --amount ${rechargeAmount} ${dryRunFlag}`;

        if (CONFIG.dryRun) {
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

module.exports = {
  rechargeTokens,
};
