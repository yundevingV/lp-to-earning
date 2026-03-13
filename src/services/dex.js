const { execSync } = require("child_process");

/**
 * byreal-cli를 JSON 출력 모드로 실행하고 파싱합니다.
 * [DRY RUN], [CONFIRM] 등 CLI의 메타 정보 출력 라인을 제거하고 순수 JSON만 추출합니다.
 */
function runCliJson(args) {
  // -o json 중복 방지 및 강제 추가
  const cmdArgs = args.includes("-o json") ? args : `${args} -o json`;

  try {
    const raw = execSync(`byreal-cli ${cmdArgs}`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    // 1. [BRACKET]로 시작하는 줄들을 모두 필터링하여 제거
    // 2. 혹시나 남을 수 있는 빈 줄들 제거
    const lines = raw.split("\n");
    const jsonLines = lines.filter((line) => {
      const trimmed = line.trim();
      // 대괄호로 시작하거나(메타 정보), 빈 라인은 무시
      if (trimmed.startsWith("[") && trimmed.includes("]")) return false;
      if (!trimmed) return false;
      return true;
    });

    const cleanJson = jsonLines.join("\n").trim();

    // JSON 문자열의 시작 '{' 또는 '[' 위치 찾기
    const startIndex = cleanJson.indexOf("{");
    const startArrayIndex = cleanJson.indexOf("[");

    let finalJson = cleanJson;
    const effectiveStart =
      startIndex !== -1 &&
      (startArrayIndex === -1 || startIndex < startArrayIndex)
        ? startIndex
        : startArrayIndex;

    if (effectiveStart !== -1) {
      finalJson = cleanJson.substring(effectiveStart);
    }

    return JSON.parse(finalJson);
  } catch (e) {
    // 만약 에러 로그 자체가 JSON 형식을 띄고 있다면 파싱 시도
    try {
      const errorMsg = e.stdout || e.stderr || e.message;
      const jsonMatch = errorMsg.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch (parseErr) {}

    throw e;
  }
}

function runCliText(args) {
  return execSync(`byreal-cli ${args}`, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
}

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

module.exports = {
  runCliJson,
  runCliText,
  getMyPositions,
};
