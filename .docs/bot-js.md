# bot.js 상세 문서

나스닥 / 엔비디아 / 테슬라 3개 풀을 대상으로 **1시간마다** 최적 포지션을 자동 복사하는 Node.js 봇.  
Mac / Windows / Linux 모두 동작하는 크로스플랫폼 구성.

---

## 설정값 (CONFIG)

`bot.js` 상단 `CONFIG` 객체에서 모든 동작을 제어합니다.

| 키               | 기본값    | 설명                                |
| ---------------- | --------- | ----------------------------------- |
| `copyAmountUsd`  | `1`       | 포지션 복사 금액 ($)                |
| `minAprPercent`  | `10`      | 복사 기준 최소 연환산 APR (%)       |
| `requireInRange` | `true`    | `true`면 In-Range 포지션만 선택     |
| `intervalMs`     | `3600000` | 실행 주기 (ms) — 기본 1시간         |
| `dryRun`         | `false`   | `true`면 트랜잭션 없이 시뮬레이션만 |

### 대상 풀

| 풀                    | 주소                                           | 풀 APR |
| --------------------- | ---------------------------------------------- | ------ |
| QQQx/USDC · 나스닥    | `FSLSua26xaXSLUG31SnyifgS6wgkRh5SirbCZW9zXNoG` | ~30%   |
| NVDAx/USDC · 엔비디아 | `GjLusGo2z3mnXPmebhhNt9ocMDJgfdxrDFctVF8Ev3Kg` | ~274%  |
| TSLAx/USDC · 테슬라   | `6FQQyf7UcyU86TZC1cmAcfC4a18SJyDggEKtQfTJWmfs` | ~210%  |

---

## 실행

### 포그라운드 (터미널 유지)

```bash
node bot.js
```

### 백그라운드 (터미널 꺼도 계속 실행)

```bash
nohup node bot.js > logs/bot.log 2>&1 &
```

### 시뮬레이션만 실행하고 싶을 때

`bot.js` 상단 CONFIG에서 `dryRun: true`로 변경 후 실행.

---

## 관리

```bash
# 실행 중인 봇 확인
ps aux | grep bot.js

# 로그 실시간 확인
tail -f logs/bot.log

# 봇 종료
kill $(pgrep -f bot.js)
```

---

## 로그 예시

```
[2026-03-12T00:40:05.503Z] [INFO ] LP Copy Bot 시작
[2026-03-12T00:40:05.524Z] [INFO ] 복사 금액: $1 | 최소 APR: 10% | DryRun: false
[2026-03-12T00:40:06.160Z] [INFO ] 지갑: 8qKXngJiHP7BrF3oxkXiv58z6tt2ELJx7ZxShQkxwBv5
[2026-03-12T00:40:06.823Z] [INFO ] 내 포지션: 5개
[2026-03-12T00:40:07.601Z] [INFO ] [QQQx/USDC · 나스닥] 선택된 포지션: 8v3kYX... | TVL=$50841 | APR≈23.4% | ✅ In
[2026-03-12T00:40:07.602Z] [INFO ] [QQQx/USDC · 나스닥] 동일 범위 포지션 이미 보유 → 스킵
[2026-03-12T00:40:08.367Z] [INFO ] [NVDAx/USDC · 엔비디아] 선택된 포지션: Ef9mHm... | TVL=$47410 | APR≈12.1% | ✅ In
[2026-03-12T00:40:08.367Z] [INFO ] [NVDAx/USDC · 엔비디아] 새 포지션 복사 시작 (amount-usd=1)
[2026-03-12T00:40:10.374Z] [OK   ] [NVDAx/USDC · 엔비디아] 복사 성공!
```

---

## 포지션 APR 계산 방식

봇은 포지션의 연환산 APR을 직접 계산해서 필터에 사용합니다.

```
APR = (earnedUsd / liquidityUsd) / (positionAgeMs / 1년) × 100
```

- `earnedUsd`: 누적 수수료 수익
- `liquidityUsd`: 포지션 유동성 규모
- `positionAgeMs`: 포지션 생성 후 경과 시간

---

## 중복 복사 방지 로직

같은 풀에 **동일한 tick 범위** 포지션이 이미 있으면 스킵합니다.  
(같은 전략을 중복 실행하는 낭비 방지)

```
tickLower === target.tickLower AND tickUpper === target.tickUpper AND poolAddress 일치
→ 스킵
```

---

## 에러 대응

| 에러                          | 원인                | 해결                    |
| ----------------------------- | ------------------- | ----------------------- |
| `insufficient funds`          | USDC 잔액 부족      | USDC 충전               |
| `WALLET_NOT_CONFIGURED`       | 지갑 미설정         | `byreal-cli setup` 실행 |
| `insufficient funds for rent` | SOL 잔액 부족       | SOL 충전 (0.01 이상)    |
| `조건 만족하는 포지션 없음`   | 필터 기준 너무 높음 | `minAprPercent` 낮추기  |
