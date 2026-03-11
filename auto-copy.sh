#!/bin/bash
# ============================================================
# QQQx/USDC (나스닥) 최고 TVL 포지션 자동 복사 스크립트
# 전략: 저수익 고안정성 | TVL 1위 포지션 | $1 복사
# ============================================================

set -e

# ── 설정 ────────────────────────────────────────────────────
POOL="FSLSua26xaXSLUG31SnyifgS6wgkRh5SirbCZW9zXNoG"  # QQQx/USDC 풀
AMOUNT_USD=1                                             # 복사 금액 ($1)
DRY_RUN="${DRY_RUN:-true}"                               # true = 시뮬레이션만, false = 실제 실행 (기본: 시뮬레이션)
# ────────────────────────────────────────────────────────────

echo ""
echo "======================================"
echo "  QQQx/USDC Auto Copy Bot"
echo "  Pool : $POOL"
echo "  Amount: \$$AMOUNT_USD"
echo "  DryRun: $DRY_RUN"
echo "======================================"
echo ""

# Step 1. 지갑 확인
echo "▶ [1/4] 지갑 확인 중..."
WALLET_OUTPUT=$(byreal-cli wallet address 2>&1)
if echo "$WALLET_OUTPUT" | grep -q "WALLET_NOT_CONFIGURED"; then
  echo "❌ 지갑이 설정되지 않았습니다. 먼저 'byreal-cli setup'을 실행하세요."
  exit 1
fi
WALLET_ADDR=$(echo "$WALLET_OUTPUT" | grep -Eo '[1-9A-HJ-NP-Za-km-z]{32,44}' | head -1)
echo "   지갑: $WALLET_ADDR"
echo ""

# Step 2. TVL 1위 포지션 조회 (JSON 파싱)
echo "▶ [2/4] 풀 상위 포지션 조회 중..."
RAW_JSON=$(byreal-cli positions top-positions --pool "$POOL" -o json 2>&1)

# Node.js로 positionAddress(NFT mint) 추출 — liquidityUsd 기준 1위
TOP_POSITION=$(echo "$RAW_JSON" | node -e "
  let data = '';
  process.stdin.on('data', d => data += d);
  process.stdin.on('end', () => {
    const json = JSON.parse(data);
    const positions = json.data.positions;
    // liquidityUsd 기준 정렬 후 1위
    const top = positions.sort((a, b) => parseFloat(b.liquidityUsd) - parseFloat(a.liquidityUsd))[0];
    console.log(top.positionAddress);
  });
")

if [ -z "$TOP_POSITION" ]; then
  echo "❌ 포지션을 가져오지 못했습니다."
  exit 1
fi

# 포지션 정보 출력
TOP_INFO=$(echo "$RAW_JSON" | node -e "
  let data = '';
  process.stdin.on('data', d => data += d);
  process.stdin.on('end', () => {
    const json = JSON.parse(data);
    const positions = json.data.positions;
    const top = positions.sort((a, b) => parseFloat(b.liquidityUsd) - parseFloat(a.liquidityUsd))[0];
    const tvl = parseFloat(top.liquidityUsd).toFixed(2);
    const pnl = (parseFloat(top.pnlUsdPercent) * 100).toFixed(2);
    const inRange = top.inRange ? '✅ In' : '⚠️  Out';
    console.log('   TVL 1위 포지션: ' + top.positionAddress);
    console.log('   Liquidity    : \$' + tvl);
    console.log('   PnL          : ' + pnl + '%');
    console.log('   Range Status : ' + inRange);
    console.log('   Price Range  : ' + top.priceLower + ' → ' + top.priceUpper);
  });
")
echo "$TOP_INFO"
echo ""

# Step 3. In-Range 체크 (Out이면 경고)
IN_RANGE=$(echo "$RAW_JSON" | node -e "
  let data = '';
  process.stdin.on('data', d => data += d);
  process.stdin.on('end', () => {
    const json = JSON.parse(data);
    const positions = json.data.positions;
    const top = positions.sort((a, b) => parseFloat(b.liquidityUsd) - parseFloat(a.liquidityUsd))[0];
    console.log(top.inRange ? 'true' : 'false');
  });
")

if [ "$IN_RANGE" = "false" ]; then
  echo "⚠️  경고: 해당 포지션이 현재 Out-of-Range 상태입니다."
  echo "   수수료가 발생하지 않을 수 있습니다. 계속하려면 Enter를 누르세요."
  read -r
fi

# Step 4. 포지션 복사 실행
echo "▶ [3/4] 포지션 복사 실행..."
if [ "$DRY_RUN" = "true" ]; then
  echo "   [DRY RUN 모드] 실제 트랜잭션 실행 안 함"
  byreal-cli positions copy \
    --position "$TOP_POSITION" \
    --amount-usd "$AMOUNT_USD" \
    --dry-run
else
  byreal-cli positions copy \
    --position "$TOP_POSITION" \
    --amount-usd "$AMOUNT_USD" \
    --confirm
fi

echo ""
echo "▶ [4/4] 내 포지션 목록 확인..."
byreal-cli positions list

echo ""
echo "======================================"
echo "  ✅ 완료!"
echo "======================================"
