const cp = require("child_process");
const fs = require("fs");
const path = require("path");

function getAllPositions() {
  const allPos = [];
  let page = 1;
  const pageSize = 50;
  console.log("포지션 데이터를 불러오는 중입니다...");
  while (true) {
    try {
      const raw = cp
        .execSync(
          `byreal-cli positions list --page ${page} --page-size ${pageSize} -o json`,
          { stdio: ["pipe", "pipe", "pipe"], encoding: "utf-8" },
        )
        .toString();
      const pos = JSON.parse(raw)?.data?.positions ?? [];
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

const posList = getAllPositions();
if (posList.length === 0) {
  console.log("현재 활성화된 포지션이 없습니다.");
  process.exit(0);
}

// 종합 통계 계산
const totalLiq = posList.reduce(
  (acc, p) => acc + parseFloat(p.liquidityUsd || 0),
  0,
);
const totalEarned = posList.reduce(
  (acc, p) => acc + parseFloat(p.earnedUsd || 0),
  0,
);
const totalPnl = posList.reduce((acc, p) => acc + parseFloat(p.pnlUsd || 0), 0);

// 풀별 통계 계산
const poolStats = {};
posList.forEach((p) => {
  const pair = p.pair || p.poolAddress;
  if (!poolStats[pair]) {
    poolStats[pair] = { count: 0, liq: 0, earned: 0, pnl: 0, positions: [] };
  }
  poolStats[pair].count++;
  poolStats[pair].liq += parseFloat(p.liquidityUsd || 0);
  poolStats[pair].earned += parseFloat(p.earnedUsd || 0);
  poolStats[pair].pnl += parseFloat(p.pnlUsd || 0);
  poolStats[pair].positions.push(p);
});

// 한국 시간 기준 파일명 생성
const now = new Date();
const timeStr = now.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
const yy = String(now.getFullYear()).slice(-2);
const mm = String(now.getMonth() + 1).padStart(2, "0");
const dd = String(now.getDate()).padStart(2, "0");
const hs = String(now.getHours()).padStart(2, "0");
const ms = String(now.getMinutes()).padStart(2, "0");
const fileName = `report-${yy}${mm}${dd}-${hs}${ms}.md`;

const reportDir = path.join(__dirname, ".report");
if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir);

const targetPath = path.join(reportDir, fileName);

let md = `# 📊 LP Copy Bot v2 - 보유 포지션 분석 보고서\n\n`;
md += `> **작성 일시:** ${timeStr}\n`;
md += `> **봇 기준 정보:** 최대 $50씩 투자 / 48시간 포지션 최소 유지 유무\n\n`;

md += `## 1. 💼 종합 자산 요약\n\n`;
md += `| 항목 | 요약 | 비고 |\n`;
md += `|---|---|---|\n`;
md += `| **총 운용 포지션 수** | **${posList.length} 개** | 현재 지갑에 활성화된 전체 CLMM 포지션 수 |\n`;
md += `| **총 투입 유동성 (Liquidity)** | **$${totalLiq.toFixed(2)}** | |\n`;
md += `| **총 확정 수수료 수익 (Fees)** | **+$${totalEarned.toFixed(4)}** | 미수령 수수료 합계 |\n`;
md += `| **총 비영구적 손실/이익 (PnL)** | **$${totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(4)}** | 시장 가격 변동에 따른 자산 가치 변화 |\n\n`;

md += `## 2. 📈 쌍(Pair)별 세부 현황\n\n`;

for (const [pair, stat] of Object.entries(poolStats)) {
  md += `### 🔹 ${pair}\n\n`;
  md += `- **보유 개수:** ${stat.count}개\n`;
  md += `- **투입된 자본:** $${stat.liq.toFixed(2)}\n`;
  md += `- **누적 수수료:** $${stat.earned.toFixed(4)}\n`;
  md += `- **평가 손익(PnL):** $${stat.pnl >= 0 ? "+" : ""}${stat.pnl.toFixed(4)}\n\n`;

  // 포지션 상세 테이블
  md += `| NFT (Mint Address) | Liquidity (달러) | Earned (달러) | PnL (달러) |\n`;
  md += `|---|---|---|---|\n`;

  stat.positions.forEach((p) => {
    const address = p.nftMintAddress || p.positionAddress;
    const liq = parseFloat(p.liquidityUsd || 0).toFixed(2);
    const earned = parseFloat(p.earnedUsd || 0).toFixed(4);
    const pnl = parseFloat(p.pnlUsd || 0).toFixed(4);

    md += `| \`${address}\` | $${liq} | $${earned} | $${pnl} |\n`;
  });
  md += `\n`;
}

md += `\n---\n`;
md += `*이 보고서는 LP Copy Bot 스크립트를 통해 생성된 자동화 문서입니다.*\n`;

fs.writeFileSync(targetPath, md);
console.log(`\n✅ 보고서가 성공적으로 생성되었습니다: ${targetPath}`);
