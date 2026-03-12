#!/usr/bin/env node
/**
 * LP Copy Bot v2
 * 나스닥 / 엔비디아 / 테슬라 풀의 포지션을 전부 모아
 * TVL 또는 Fee 수익 기준으로 전체 정렬 후 상위 N개를 1시간마다 복사
 */

"use strict";

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// ── 설정 ──────────────────────────────────────────────────────────────────────
const CONFIG = {
  pools: [
    {
      name: "QQQx/USDC · 나스닥",
      address: "FSLSua26xaXSLUG31SnyifgS6wgkRh5SirbCZW9zXNoG",
    },
    {
      name: "NVDAx/USDC · 엔비디아",
      address: "GjLusGo2z3mnXPmebhhNt9ocMDJgfdxrDFctVF8Ev3Kg",
    },
    {
      name: "TSLAx/USDC · 테슬라",
      address: "6FQQyf7UcyU86TZC1cmAcfC4a18SJyDggEKtQfTJWmfs",
    },
  ],

  // ── 복사 기준 ──────────────────────────────────────────────────────────────
  topN: 3, // 전체 정렬 후 상위 N개 복사
  sortBy: "tvl", // 'tvl' | 'fee' | 'apr'  (정렬 기준)
  requireInRange: true, // true = In-Range 포지션만
  minAprPercent: 20, // 최소 연환산 APR (%) — 너무 낮은 포지션 제외

  // ── 복사 설정 ──────────────────────────────────────────────────────────────
  copyAmountUsd: 1, // 포지션당 복사 금액 ($)
  dryRun: true, // true = 시뮬레이션만

  // ── 스케줄 ─────────────────────────────────────────────────────────────────
  intervalMs: 60 * 60 * 1000, // 복사 주기: 1시간
  monitorIntervalMs: 10 * 60 * 1000, // 모니터링 주기: 10분

  logDir: path.join(__dirname, "logs"),
};
// ──────────────────────────────────────────────────────────────────────────────

// ── 로거 ──────────────────────────────────────────────────────────────────────
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
// ──────────────────────────────────────────────────────────────────────────────

// ── CLI 헬퍼 ──────────────────────────────────────────────────────────────────
function runCliJson(args) {
  const raw = execSync(`byreal-cli ${args} -o json`, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  return JSON.parse(raw);
}

function runCliText(args) {
  return execSync(`byreal-cli ${args}`, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
}
// ──────────────────────────────────────────────────────────────────────────────

// ── 포지션 연환산 APR 계산 ─────────────────────────────────────────────────────
function calcApr(pos) {
  const earned = parseFloat(pos.earnedUsd || 0);
  const liq = parseFloat(pos.liquidityUsd || 1);
  const ageYears = (pos.positionAgeMs || 1) / (365 * 24 * 60 * 60 * 1000);
  if (ageYears === 0 || liq === 0) return 0;
  return (earned / liq / ageYears) * 100;
}

// ── 소트 키 함수 ───────────────────────────────────────────────────────────────
const SORT_FN = {
  tvl: (a, b) => parseFloat(b.liquidityUsd) - parseFloat(a.liquidityUsd),
  fee: (a, b) => parseFloat(b.earnedUsd) - parseFloat(a.earnedUsd),
  apr: (a, b) => calcApr(b) - calcApr(a),
};
// ──────────────────────────────────────────────────────────────────────────────

// ── 메인 실행 ─────────────────────────────────────────────────────────────────
async function run() {
  const now = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  logger.info(`========== 봇 실행 시작 [${now}] ==========`);
  logger.info(
    `설정 | topN=${CONFIG.topN} | sortBy=${CONFIG.sortBy} | minAPR=${CONFIG.minAprPercent}% | amount=$${CONFIG.copyAmountUsd} | dryRun=${CONFIG.dryRun}`,
  );

  // 1. 지갑 확인
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

  // 2. 전체 풀에서 후보 포지션 수집
  const allCandidates = [];

  for (const pool of CONFIG.pools) {
    logger.info(`[${pool.name}] 포지션 조회 중...`);
    try {
      const data = runCliJson(`positions top-positions --pool ${pool.address}`);
      const positions = data?.data?.positions ?? [];

      const filtered = positions.filter((p) => {
        if (CONFIG.requireInRange && !p.inRange) return false;
        return calcApr(p) >= CONFIG.minAprPercent;
      });

      logger.info(
        `[${pool.name}] 조건 충족 포지션: ${filtered.length}개 (전체 ${positions.length}개 중)`,
      );

      // 풀 정보 태깅
      filtered.forEach((p) => {
        p._poolName = pool.name;
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

  // 3. 전체 정렬
  const sortFn = SORT_FN[CONFIG.sortBy] ?? SORT_FN.tvl;
  allCandidates.sort(sortFn);

  // 4. 상위 N개 선택
  const targets = allCandidates.slice(0, CONFIG.topN);

  logger.info(
    `\n── 전체 순위 (${CONFIG.sortBy} 기준 상위 ${targets.length}개) ──`,
  );
  targets.forEach((p, i) => {
    const tvl = parseFloat(p.liquidityUsd).toFixed(0);
    const fee = parseFloat(p.earnedUsd).toFixed(2);
    const apr = p._apr.toFixed(1);
    logger.info(
      `  ${i + 1}위 [${p._poolName}] ${p.positionAddress} | TVL=$${tvl} | Fee=$${fee} | APR≈${apr}% | ${p.inRange ? "✅ In" : "⚠️ Out"}`,
    );
  });
  logger.info("");

  // 5. 상위 N개 복사 (중복 허용 — 매 실행마다 복사)
  const flag = CONFIG.dryRun ? "--dry-run" : "--confirm";

  for (let i = 0; i < targets.length; i++) {
    const pos = targets[i];
    logger.info(
      `[${i + 1}/${targets.length}] [${pos._poolName}] 복사 시작 → ${pos.positionAddress}`,
    );
    try {
      const result = runCliText(
        `positions copy --position ${pos.positionAddress} --amount-usd ${CONFIG.copyAmountUsd} ${flag}`,
      );
      // NFT 주소만 추출해서 로그
      const nft =
        result.match(/NFT Address\s+([1-9A-HJ-NP-Za-km-z]{32,44})/)?.[1] ?? "";
      logger.ok(`[${pos._poolName}] 복사 완료! NFT: ${nft}`);
    } catch (e) {
      logger.error(`[${pos._poolName}] 복사 실패: ${e.message.split("\n")[0]}`);
    }
  }

  // 6. 내 포지션 요약
  try {
    const myData = runCliJson("positions list");
    const myList = myData?.data?.positions ?? [];
    logger.info(`\n내 전체 포지션: ${myList.length}개`);
    myList.forEach((p) => {
      const liq = parseFloat(p.liquidityUsd || 0).toFixed(2);
      const earned = parseFloat(p.earnedUsd || 0).toFixed(4);
      logger.info(
        `  • ${p.pair ?? p.poolAddress.slice(0, 8)} | NFT: ${p.nftMintAddress ?? p.positionAddress} | Liq=$${liq} | Earned=$${earned}`,
      );
    });
  } catch (_) {}

  logger.info("========== 봇 실행 완료 ==========\n");
}
// ──────────────────────────────────────────────────────────────────────────────

// ── 모니터링 (10분마다) ───────────────────────────────────────────────────────
async function monitor() {
  const now = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  logger.info(`┌──── 📊 모니터링 [${now}] ────`);

  // 1. 풀 현황 조회
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

  // 2. 내 포지션 현황 조회
  try {
    const myData = runCliJson("positions list");
    const myList = myData?.data?.positions ?? [];
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
      const status = p.inRange === false ? "⚠️ Out" : "✅ In";
      logger.info(
        `│   • ${(p.pair || "").padEnd(10)} ${status} | Liq=$${liq} | Earned=$${earned} | ${p.nftMintAddress ?? p.positionAddress}`,
      );
    });
  } catch (e) {
    logger.warn(`│ 내 포지션 조회 실패: ${e.message.split("\n")[0]}`);
  }

  logger.info(`└${"─".repeat(50)}`);
}
// ──────────────────────────────────────────────────────────────────────────────

// ── 시작 ──────────────────────────────────────────────────────────────────────
logger.info("LP Copy Bot v2 시작");
logger.info(`대상 풀: ${CONFIG.pools.map((p) => p.name).join(" / ")}`);
logger.info(
  `전략: ${CONFIG.sortBy} 기준 전체 정렬 → 상위 ${CONFIG.topN}개 복사 (1시간마다)`,
);
logger.info(`모니터링: 풀 현황 + 내 포지션 (10분마다)\n`);

// 즉시 1회 실행
monitor();
run();

// 주기 스케줄
setInterval(monitor, CONFIG.monitorIntervalMs); // 10분마다 모니터링
setInterval(run, CONFIG.intervalMs); // 1시간마다 복사
