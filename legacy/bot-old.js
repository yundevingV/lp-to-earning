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
  topN: 3, // 성공 복사 목표 개수
  sortBy: "score", // 'score' | 'tvl' | 'fee' | 'apr'  (정렬 기준)
  requireInRange: true, // true = In-Range 포지션만
  minAprPercent: 20, // 최소 연환산 APR (%) — 너무 낮은 포지션 제외

  // ── 복사 설정 ──────────────────────────────────────────────────────────────
  copyAmountUsd: 5, // 포지션당 복사 금액 ($) - 가스비(~$0.3) 대비 수익을 위해 $5 이상 권장
  dryRun:
    process.argv.includes("--dry-run") ||
    process.env.DRY_RUN === "true" ||
    false,

  // ── 스케줄 ─────────────────────────────────────────────────────────────────
  runOnStart: true, // 봇 시작 시 즉시 1회 실행 여부 (false면 1시간 뒤 첫 실행)
  intervalMs: 60 * 60 * 1000, // 복사 주기: 1시간
  monitorIntervalMs: 10 * 60 * 1000, // 모니터링 주기: 10분

  // ── 자동 교체 ──────────────────────────────────────────────────────────────
  autoCloseOutOfRange: true, // Out-of-Range 포지션 자동 클로즈
  closeOnHighRisk: true, // 범위 이탈 위험이 'high'로 뜨는 아슬아슬한 포지션도 함께 클로즈할지 여부
  rebalanceEnabled: true, // 동일 페어 더 좋은 포지션 발견 시 자동 복사
  rebalanceThreshold: 0.5, // 50% 이상 수익률 개선될 때만 리밸런싱 (가스비 방어 최적화)
  rebalanceMinAgeHours: 48, // 최소 유지 시간 (수수료를 회수하기 위해 최소 이틀은 유지)

  logDir: path.join(__dirname, "logs"),
  dbFile: path.join(__dirname, "logs", "positions_db.json"),
};
// ──────────────────────────────────────────────────────────────────────────────

// ── 로컬 상태 저장소 (포지션 생성 시간 기록용) ──────────────────────────────
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

// 전체 내 포지션 조회 (페이징 처리)
function getMyPositions() {
  const allPos = [];
  let page = 1;
  const pageSize = 50;
  while (true) {
    try {
      const data = runCliJson(
        `positions list --page ${page} --page-size ${pageSize}`,
      );
      const pos = data?.data?.positions ?? [];
      if (pos.length === 0) break;
      allPos.push(...pos);
      if (pos.length < pageSize) break;
      page++;
    } catch (e) {
      break;
    }
  }
  return allPos;
}
// ──────────────────────────────────────────────────────────────────────────────

// ── positionAgeMs → 생성일 + 경과시간 포맷 ────────────────────────────────────────────
// ex) 25d 6h ago (2026-02-15)
function formatAge(ageMs) {
  if (!ageMs) return "-";
  const createdAt = new Date(Date.now() - ageMs);
  const d = Math.floor(ageMs / (24 * 60 * 60 * 1000));
  const h = Math.floor((ageMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const dateStr = createdAt
    .toLocaleDateString("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "2-digit",
      day: "2-digit",
    })
    .replace(/\. /g, "-")
    .replace(".", "");
  return `${d}d ${h}h ago (${dateStr})`;
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

// ── 복합 점수 계산 (저수익 고안정성 전략) ─────────────────────────────────────────
// 기하평균: APR^0.35 × ln(TVL)^0.40 × FeeRate^0.25
// - TVL에 ln() 적용: $1K→$50K 차이는 크게, $50K→$51K 차이는 작게
// - 기하평균: 3개 지표 중 하나라도 나쁘면 전체 점수 급락 (균형 강제)
// ── 심플해진 1차 필터 점수 계산 (TVL × APR) ─────────────────────────
function calcScore(pos) {
  const tvl = Math.max(parseFloat(pos.liquidityUsd || 0), 0);
  const apr = Math.max(calcApr(pos), 0);

  // 너무 규모가 작은 거미줄 포지션(TVL 10달러 미만)은 노이즈이므로 제외
  if (tvl < 10) return 0;

  // TVL과 APR을 곱해서 "실제 발생 수익 규모력이 큰" 순서대로 점수화
  return tvl * apr;
}
// ──────────────────────────────────────────────────────────────

// function calcScore(pos) {
//   const apr = Math.max(calcApr(pos), 0.001);
//   const tvl = Math.max(parseFloat(pos.liquidityUsd || 0), 1);
//   const fee = parseFloat(pos.earnedUsd || 0);
//   const feeRate = Math.max((fee / tvl) * 100, 0.001); // 수수료 효율 (%)

//   const raw =
//     Math.pow(apr, 0.35) *
//     Math.pow(Math.log(tvl + 1), 0.4) *
//     Math.pow(feeRate, 0.25);

//   // Range Safety 패널티 (가장자리에 너무 가까우면 감점)
//   let safetyPenalty = 1;
//   if (pos._currentPrice && pos.priceLower && pos.priceUpper) {
//     const price = pos._currentPrice;
//     const lower = parseFloat(pos.priceLower);
//     const upper = parseFloat(pos.priceUpper);
//     const span = upper - lower;
//     if (span > 0) {
//       // 현재 가격이 하단/상단 중 어디에 더 가까운지 (절대값 거리)
//       const distToEdge = Math.min(price - lower, upper - price);
//       const safetyPct = distToEdge / span; // 최대 0.5 (정중앙)

//       // 범위의 10% 이내(가장자리)로 접근했다면 점수를 깎음 (최대 10분의 1 토막)
//       safetyPenalty = Math.min(Math.max(safetyPct / 0.1, 0.1), 1);
//     }
//   }

//   return raw * safetyPenalty;
// }

// ── 소트 키 함수 ───────────────────────────────────────────────────────────────
const SORT_FN = {
  score: (a, b) => calcScore(b) - calcScore(a),
  tvl: (a, b) => parseFloat(b.liquidityUsd) - parseFloat(a.liquidityUsd),
  fee: (a, b) => parseFloat(b.earnedUsd) - parseFloat(a.earnedUsd),
  apr: (a, b) => calcApr(b) - calcApr(a),
};
// ── 보조 퀀트 어드바이저 (Ollama 로컬 AI) 연동 ────────────────────────────────
async function askOllamaAdvisor(topCandidates) {
  let report =
    '너는 보조 퀀트 어드바이저야. 내가 1차로 필터링한 상위 후보지들이야.\n여기서 가장 안전하고 수익률이 좋은 최대 3개의 포지션 주소(positionAddress)를 골라서 JSON 배열 형식으로만 응답해.\n예시: ["Abcd123...", "Xxyz987...", "Qwrt555..."]\n(주의: 절대로 1,2,3 같은 순번 숫자나 임의의 ID를 만들지 말고, 내가 제공한 44자리 포지션 주소 전체를 그대로 배열에 담을 것! 설명이나 마크다운 없이 오직 JSON 배열만 출력해)\n\n--- 보고서 시작 ---\n';

  topCandidates.forEach((p, i) => {
    const score = calcScore(p).toFixed(2);
    const tvl = parseFloat(p.liquidityUsd || 0).toFixed(0);
    const apr = p._apr.toFixed(2);
    const risk = p.inRange ? "Low (안전)" : "High (위험)";
    report += `- 포지션주소: ${p.positionAddress} | 풀: ${p._poolName} | APR: ${apr}% | TVL: $${tvl} | Range Risk: ${risk} | 1차점수: ${score}\n`;
  });
  report += "--- 보고서 끝 ---\n";

  try {
    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemma3:4b",
        prompt: report,
        stream: false,
      }),
    });

    const data = await response.json();
    let text = data.response;
    text = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    let picks = JSON.parse(text);

    // AI가 ID 앞에 "ID: " 와 같은 접두사를 붙였을 경우를 대비해 정제
    if (Array.isArray(picks)) {
      picks = picks.map((id) => id.replace(/^ID:\s*/i, "").trim());
    }

    return picks;
  } catch (error) {
    logger.warn(
      `❌ Ollama 연동 실패: ${error.message} (기본 로직으로 대체합니다)`,
    );
    return null;
  }
}
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
      // 풀의 현재 가격을 먼저 구함 (Range 패널티 계산용)
      let currentPrice = 0;
      try {
        const poolInfo = runCliJson(`pools info ${pool.address}`);
        currentPrice = parseFloat(
          poolInfo?.data?.pool?.current_price ||
            poolInfo?.data?.current_price ||
            0,
        );
      } catch (e) {}

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

  // 3. 전체 정렬 (복합 점수 기준)
  const sortFn = SORT_FN[CONFIG.sortBy] ?? SORT_FN.score;
  allCandidates.sort(sortFn);

  // 4. 전체 순위 상위 20개 출력 (1차 필터링 미리보기)
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

  // 5. AI 보조 어드바이저에게 2차 평가 요청
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
      if (found) finalCandidates.push(found);
    });

    // AI 추천 외 남은 후보들도 뒤쪽에 정렬 순서대로 배치 (폴백용)
    allCandidates.forEach((p) => {
      if (!finalCandidates.includes(p)) finalCandidates.push(p);
    });
  } else {
    logger.warn(
      `⚠️ AI 추천을 받지 못했습니다. 기존 점수 기준(Score)으로 진행합니다.`,
    );
    finalCandidates = allCandidates;
  }

  // 6. 폴백 복사: 1위부터 순서대로 시도, 성공 N개 달성 시 중단
  const flag = CONFIG.dryRun ? "--dry-run" : "--confirm";
  let successCount = 0;
  let tryCount = 0;

  for (const pos of finalCandidates) {
    if (successCount >= CONFIG.topN) break;
    tryCount++;

    logger.info(
      `[시도 ${tryCount}] [${pos._poolName}] 복사 → ${pos.positionAddress} (성공 ${successCount}/${CONFIG.topN})`,
    );
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
      const reason = e.message.includes("insufficient")
        ? "잔액 부족 → 다음 후보로"
        : e.message.split("\n")[0];
      logger.warn(`[${pos._poolName}] 실패 (${reason})`);
    }
  }

  if (successCount < CONFIG.topN) {
    logger.warn(
      `목표 ${CONFIG.topN}개 중 ${successCount}개만 성공 (후보 ${allCandidates.length}개 모두 시도)`,
    );
  } else {
    logger.ok(`목표 달성! ${successCount}개 복사 완료 (${tryCount}번 시도)`);
  }

  // 6. 내 포지션 요약
  let myList = [];
  try {
    myList = getMyPositions();

    logger.info(`\n내 전체 포지션: ${myList.length}개`);
    myList.forEach((p) => {
      const liq = parseFloat(p.liquidityUsd || 0).toFixed(2);
      const earned = parseFloat(p.earnedUsd || 0).toFixed(4);
      // inRange 필드가 API 배열 형태에서 안 올 수 있으므로 기본 문자열로 처리
      // (이후 cleanOutOfRange 단계에서 analyze를 통해 정확히 체크함)
      const status = p.inRange === false ? "⚠️ Out" : "✅ In(예상)";
      const age = formatAge(p.positionAgeMs); // (positionAgeMs 도 API에서 안 올 수 있음. 하단 리밸런싱에서 db 읽음)
      logger.info(
        `  • ${p.pair ?? p.poolAddress} | ${status} | Liq=$${liq} | Earned=$${earned} | ${p.nftMintAddress} | ${p.positionAddress}`,
      );
    });
  } catch (_) {}

  // 7. Out-of-Range 클로즈 & 리밸런싱
  if (CONFIG.autoCloseOutOfRange) {
    cleanOutOfRange(myList);
  }
  if (CONFIG.rebalanceEnabled) {
    rebalance(myList, allCandidates);
  }

  logger.info("========== 봇 실행 완료 ==========\n");
}
// ──────────────────────────────────────────────────────────────────────────────

// ── Out-of-Range 자동 클로즈 ─────────────────────────────────────────────────
async function cleanOutOfRange(myList) {
  // byreal-cli 'positions list' 출력 시 inRange가 없을 수 있음
  // status를 조회해야 정확한 inRange 여부를 알 수 있으므로 상태 체크.
  let outOfRange = [];
  const db = loadDb();

  for (const p of myList) {
    const nftMint = p.nftMintAddress ?? p.positionAddress;
    const createdAt = db[nftMint];
    const ageHours = createdAt
      ? (Date.now() - createdAt) / (60 * 60 * 1000)
      : 999;

    // 24시간(CONFIG.rebalanceMinAgeHours)이 안 지났으면 Out-of-Range라도 유지
    if (ageHours < CONFIG.rebalanceMinAgeHours) {
      continue;
    }

    if (p.inRange === false) {
      outOfRange.push(p);
    } else if (p.inRange === undefined) {
      // 확실하지 않으면 개별 상태 확인
      try {
        // positions analyze 명령으로 상세 상태 조회
        const info = runCliJson(`positions analyze ${nftMint}`);

        const isOut = info?.data?.position?.inRange === false;
        const isHighRisk = info?.data?.rangeHealth?.outOfRangeRisk === "high";

        if (isOut || (CONFIG.closeOnHighRisk && isHighRisk)) {
          // 범위를 아예 나갔거나, 설정에 의해 '고위험(high)' 상태인 것도 닫음
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
    logger.info(`  ❌ 클로즈: [${pos.pair}] NFT: ${nftMint}`);
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

      // 내 포지션 생성 경과 시간 확인
      const mint = p.nftMintAddress ?? p.positionAddress;
      const createdAt = db[mint];
      p._ageHours = createdAt
        ? (Date.now() - createdAt) / (60 * 60 * 1000)
        : 999; // DB에 없으면 그냥 오래된 것으로 간주

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

    const best = candidates[0]; // 이미 score 정렬됨
    const bestScore = calcScore(best);

    // 가장 수익률 높은 애를 기준으로 비교
    const myBest = myByPair[pair].sort(
      (a, b) => b._yieldRate - a._yieldRate,
    )[0];

    // 에이징 제한 체크 (최소 유지 시간 미달 시 스킵)
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
      const status = p.inRange === false ? "⚠️ Out" : "✅ In";
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
// ──────────────────────────────────────────────────────────────────────────────

// ── 시작 ──────────────────────────────────────────────────────────────────────
logger.info("LP Copy Bot v2 시작");
logger.info(`대상 풀: ${CONFIG.pools.map((p) => p.name).join(" / ")}`);
logger.info(
  `전략: ${CONFIG.sortBy} 기준 전체 정렬 → 상위 ${CONFIG.topN}개 복사 (1시간마다)`,
);
logger.info(`모니터링: 풀 현황 + 내 포지션 (10분마다)\n`);

// 주기 스케줄
setInterval(monitor, CONFIG.monitorIntervalMs); // 10분마다 모니터링
setInterval(run, CONFIG.intervalMs); // 1시간마다 복사

// 즉시 1회 메뉴
monitor();
if (CONFIG.runOnStart) {
  run();
} else {
  logger.info(
    `\n⏳ 최초 복사(run)는 스킵되었습니다. 첫 번째 복사 및 리밸런싱은 1시간 뒤에 시작됩니다.`,
  );
}
