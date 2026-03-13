const logger = require("../utils/logger");
const { calcScore } = require("./position");

async function askOllamaAdvisor(topCandidates) {
  let report =
    '너는 보조 퀀트 어드바이저야. 내가 1차로 필터링한 상위 후보지들이야.\n여기서 가장 안전하고 수익률이 좋은 최대 3개의 포지션 주소(positionAddress)를 골라서 JSON 배열 형식으로만 응답해.\n예시: ["Abcd123...", "Xxyz987...", "Qwrt555..."]\n(주의: 절대로 1,2,3 같은 순번 숫자나 임의의 ID를 만들지 말고, 내가 제공한 44자리 포지션 주소 전체를 그대로 배열에 담을 것! 설명이나 마크다운 없이 오직 JSON 배열만 출력해)\n\n--- 보고서 시작 ---\n';

  topCandidates.forEach((p) => {
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

    // AI가 ID 앞에 "ID: " 또는 "ID" 와 같은 접두사를 붙였을 경우를 대비해 정제 (솔라나 주소엔 대문자 I, O 가 없음)
    if (Array.isArray(picks)) {
      picks = picks.map((id) => id.replace(/^ID[:\-\s]*/i, "").trim());
    }

    return picks;
  } catch (error) {
    logger.warn(
      `❌ Ollama 연동 실패: ${error.message} (기본 로직으로 대체합니다)`,
    );
    return null;
  }
}

module.exports = {
  askOllamaAdvisor,
};
