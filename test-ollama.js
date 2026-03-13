// Ollama 테스트 스크립트 (Node.js 내장 fetch 사용)

async function testOllama() {
  const prompt = `
너는 퀀트 투자 전문가야. 아래의 시장 분석 보고서를 읽고, 
가장 투자하기 좋은 포지션의 ID 한 개를 JSON 형식으로만 응답해.
(다른 말은 절대 하지 말고 오직 JSON만 출력할 것)

--- 보고서 시작 ---
- ID: Abcd123 / Pool: TSLAx / APR: 350% / TVL: $10,000 / Range Risk: Low (가장 안전하면서 높은 수익률)
- ID: Xxyz987 / Pool: NVDAx / APR: 800% / TVL: $1,000 / Range Risk: High (위험함)
- ID: Qwrt555 / Pool: QQQx / APR: 120% / TVL: $50,000 / Range Risk: Low (안전하지만 상대적 수익률 낮음)
--- 보고서 끝 ---

응답 예시:
{
  "targetId": "추천하는아이디"
}  
`;

  console.log("Ollama에게 질문을 보내는 중...");

  try {
    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemma3:4b", // 설치되어 있는 모델명
        prompt: prompt,
        stream: false, // 한 번에 전체 답변 받기
      }),
    });

    const data = await response.json();
    console.log("\n[Ollama의 답변 (JSON)]");
    console.log(data.response);
  } catch (error) {
    console.error(
      "Ollama 연동 에러 (Ollama가 켜져있는지 확인하세요):",
      error.message,
    );
  }
}

testOllama();
