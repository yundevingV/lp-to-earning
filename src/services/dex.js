const { execSync } = require("child_process");

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
