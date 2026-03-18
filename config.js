const path = require("path");

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
    {
      name: "WETH/USDC",
      address: "HGxMfonx2vMRGVpHNvj6JbVM5JUjN8xYFS1UGXMYeaAo",
    },
    {
      name: "MNT/USDC",
      address: "8HPQzqMDoDcRDMh3Si75EGWh276QbcVrfHvrNFVPnW8s",
    },
  ],

  // ── 복사 기준 ──────────────────────────────────────────────────────────────
  topN: 3, // 성공 복사 목표 개수
  maxCopyAttempts: 10, // 실행당 최대 복사 시도 횟수 (후보 무한 시도 방지)
  sortBy: "score", // 'score' | 'tvl' | 'fee' | 'apr'  (정렬 기준)
  requireInRange: true, // true = In-Range 포지션만
  minAprPercent: 20, // 최소 포지션 연환산 APR(%) — calcApr 기준으로 필터

  // ── 복사 설정 ──────────────────────────────────────────────────────────────
  copyAmountUsd: 5, // 포지션당 복사 금액 ($) - 가스비(~$0.3) 대비 수익을 위해 $5 이상 권장
  dryRun:
    process.argv.includes("--dry-run") ||
    process.env.DRY_RUN === "true" ||
    false,

  // ── 스케줄 ─────────────────────────────────────────────────────────────────
  runOnStart: true, // 봇 시작 시 즉시 1회 실행 여부 (false면 1시간 뒤 첫 실행)
  intervalMs: 30 * 60 * 1000, // 복사 주기: 30분
  monitorIntervalMs: 10 * 60 * 1000, // 모니터링 주기: 10분

  // ── 자동 교체 ──────────────────────────────────────────────────────────────
  autoCloseOutOfRange: true, // Out-of-Range 포지션 자동 클로즈
  closeOnHighRisk: false, // 범위 이탈 위험이 'high'로 뜨는 아슬아슬한 포지션도 함께 클로즈할지 여부
  rebalanceEnabled: true, // 동일 페어 더 좋은 포지션 발견 시 자동 복사
  rebalanceThreshold: 0.5, // 50% 이상 수익률 개선될 때만 리밸런싱 (가스비 방어 최적화)
  rebalanceMinAgeHours: 6, // 최소 유지 시간 (6시간 이후 Out-of-Range 시 즉시 정리)

  // ── 안전 설정 (Safety) ──────────────────────────────────────────────────────
  safetyDelayMs: 10 * 60 * 1000, // 최초 실행 후 10분간은 실제 트랜잭션 금지 (실수 방지)

  // ── 자동 스왑/충전 (Slippage 방어) ──────────────────────────────────────────
  autoRecharge: {
    enabled: true,
    thresholdUsd: 2, // 토큰 잔고가 $1 미만이면 충전 시도
    rechargeAmountUsd: 5, // $5어치 USDC를 해당 토큰으로 스왑
    tokens: [
      // 충전 대상 토큰 (xStock)
      { name: "TSLAx", mint: "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB" },
      { name: "NVDAx", mint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh" },
      { name: "QQQx", mint: "Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ" },
      { name: "WETH", mint: "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs" },
      { name: "MNT", mint: "4SoQ8UkWfeDH47T56PA53CZCeW4KytYCiU65CwBWoJUt" },
    ],
  },

  logDir: path.join(__dirname, "logs"),
  dbFile: path.join(__dirname, "logs", "positions_db.json"),
};

module.exports = CONFIG;
