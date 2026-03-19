#!/bin/sh

# 1. Solana Private Key 환경변수 주입
if [ -n "$SOLANA_WALLET_PRIVATE_KEY" ]; then
    echo "🔑 Configuring Solana Private Key..."
    byreal-cli wallet set --private-key "$SOLANA_WALLET_PRIVATE_KEY" --non-interactive
fi
# 2. 추가적인 CLI Config 설정 등
echo "🤖 byreal-cli setup 완료. 봇을 실행합니다..."

# 3. 본래 명령어 실행 (CMD)
exec "$@"
