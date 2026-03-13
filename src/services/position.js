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

function calcApr(pos) {
  const earned = parseFloat(pos.earnedUsd || 0);
  const liq = parseFloat(pos.liquidityUsd || 1);
  const ageYears = (pos.positionAgeMs || 1) / (365 * 24 * 60 * 60 * 1000);
  if (ageYears === 0 || liq === 0) return 0;
  return (earned / liq / ageYears) * 100;
}

function calcScore(pos) {
  const tvl = Math.max(parseFloat(pos.liquidityUsd || 0), 0);
  const apr = Math.max(calcApr(pos), 0);
  if (tvl < 10) return 0;
  return tvl * apr;
}

const SORT_FN = {
  score: (a, b) => calcScore(b) - calcScore(a),
  tvl: (a, b) => parseFloat(b.liquidityUsd) - parseFloat(a.liquidityUsd),
  fee: (a, b) => parseFloat(b.earnedUsd) - parseFloat(a.earnedUsd),
  apr: (a, b) => calcApr(b) - calcApr(a),
};

module.exports = {
  formatAge,
  calcApr,
  calcScore,
  SORT_FN,
};
