# LP to Earning 🤖

나스닥 / 엔비디아 / 테슬라 xStock CLMM 풀에서 최적 포지션을 자동으로 복사하는 Solana DeFi 자동화 봇.

## 동작 방식

```
실행 (1시간마다)
  │
  ├─ 1. 지갑 확인
  ├─ 2. 내 기존 포지션 목록 조회
  │
  └─ 3. 풀별 순회 (나스닥 → 엔비디아 → 테슬라)
         ├─ 상위 포지션 조회
         ├─ 필터: inRange=true + APR ≥ 50%
         ├─ score 계산
         └─ $5로 포지션 복사 + 로그 기록
```

## 사전 요구사항

```bash
npm install -g @byreal-io/byreal-cli
byreal-cli setup
```

> **지갑 조건**: USDC $5 이상 + SOL 0.01 이상 (가스비) 및 기타 자산

## 빠른 실행

```bash
# bot.js — 나스닥 + 엔비디아 + 테슬라 (크로스플랫폼)
node bot.js

# auto-copy.sh — 나스닥 단일 풀 (Mac/Linux)
DRY_RUN=false bash auto-copy.sh
```

## 파일 구조

```
├── bot.js              # 메인 봇 (Node.js, 3개 풀)
├── auto-copy.sh        # 쉘 스크립트 (단일 풀)
├── script.md           # 수동 커맨드 모음
├── .docs/
│   ├── bot-js.md       # bot.js 상세 문서
│   └── auto-copy-sh.md # auto-copy.sh 상세 문서
└── logs/
    ├── bot.log
    └── auto-copy.log
```

> 상세 사용법은 [`.docs/bot-js.md`](.docs/bot-js.md) 및 [`.docs/auto-copy-sh.md`](.docs/auto-copy-sh.md) 참고.
