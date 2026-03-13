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

module.exports = CONFIG;
