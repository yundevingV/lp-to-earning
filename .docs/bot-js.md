# bot.js 상세 문서

나스닥 / 엔비디아 / 테슬라 3개 풀을 대상으로 **1시간마다** 최적 포지션을 자동 복사하는 Node.js 봇.  
Mac / Windows / Linux 모두 동작하는 크로스플랫폼 구성.

---

## 설정값 (CONFIG)

`bot.js` 상단 `CONFIG` 객체에서 모든 동작을 제어합니다.

| 키                  | 기본값    | 설명                                                  |
| ------------------- | --------- | ----------------------------------------------------- |
| `copyAmountUsd`     | `1`       | 포지션 복사 금액 ($)                                  |
| `topN`              | `3`       | 성공 복사 목표 개수                                   |
| `sortBy`            | `'score'` | 정렬 기준: `'score'` \| `'tvl'` \| `'fee'` \| `'apr'` |
| `minAprPercent`     | `20`      | 최소 연환산 APR 필터 (%)                              |
| `requireInRange`    | `true`    | `true`면 In-Range 포지션만 선택                       |
| `intervalMs`        | `3600000` | 복사 주기 (ms) — 기본 1시간                           |
| `monitorIntervalMs` | `600000`  | 모니터링 주기 (ms) — 기본 10분                        |
| `dryRun`            | `false`   | CLI 인자 또는 환경변수로 오버라이드 가능              |

### 대상 풀

| 풀                    | 주소                                           | 풀 APR |
| --------------------- | ---------------------------------------------- | ------ |
| QQQx/USDC · 나스닥    | `FSLSua26xaXSLUG31SnyifgS6wgkRh5SirbCZW9zXNoG` | ~30%   |
| NVDAx/USDC · 엔비디아 | `GjLusGo2z3mnXPmebhhNt9ocMDJgfdxrDFctVF8Ev3Kg` | ~274%  |
| TSLAx/USDC · 테슬라   | `6FQQyf7UcyU86TZC1cmAcfC4a18SJyDggEKtQfTJWmfs` | ~210%  |

---

## 실행

### 실제 실행 (기본값)

```bash
node bot.js
```

### 시뮬레이션 (dry-run)

```bash
# CLI 인자로
node bot.js --dry-run

# 환경변수로
DRY_RUN=true node bot.js
```

### 백그라운드 실행 (터미널 꺼도 계속)

```bash
# 실제 실행
nohup node bot.js > logs/bot.log 2>&1 &

# 시뮬레이션
nohup node bot.js --dry-run > logs/bot.log 2>&1 &
```

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

## 복합 점수 (Score) 계산 방식

`sortBy: 'score'` 사용 시 아래 공식으로 포지션의 효율을 평가합니다.

```
Score = APR^0.35 × ln(TVL + 1)^0.40 × FeeRate^0.25 × PnL패널티
```

| 항목       | 가중치 | 의미                               |
| ---------- | ------ | ---------------------------------- |
| APR        | 0.35   | 수익률                             |
| ln(TVL)    | 0.40   | 안정성 (로그 압축으로 극단값 완화) |
| FeeRate    | 0.25   | 수수료 효율 (fee/TVL)              |
| PnL 패널티 | ×      | 손실(IL) 중이면 감점               |

> **기하평균** 방식이라 세 지표 중 하나라도 나쁘면 전체 점수가 급락합니다 — 균형 잡힌 포지션만 상위권에 올라옵니다.

---

## 폴백 복사 로직

복사 실패 시 다음 순위 후보로 자동으로 넘어갑니다.

```
1위 시도 → 성공 → 완료
         → 실패(잔액 부족) → 2위 시도 → 성공 → ...
                             → 실패     → 3위 시도 → ...
topN개 성공하면 중단
```

- 잔액이 특정 토큰 쌍에만 없어도 다른 풀 포지션으로 자동 전환됩니다.
- 모든 후보를 시도해도 topN 미달 시 경고 로그 출력.

---

## 로그 예시

```
[INFO ] LP Copy Bot v2 시작
[INFO ] 전략: score 기준 전체 정렬 → 상위 3개 복사 (1시간마다)
[INFO ] ┌──── 📊 모니터링 [2026. 3. 12. 오전 10:34:19] ────
[INFO ] │ [엔비디아] 가격=$184.75 | TVL=$344K | APR=276.2% | 24h Fee=$2.76
[INFO ] │ 💼 내 포지션 총 7개 | 총 유동성=$7.00 | 총 수수료=$0.0029
[INFO ] └──────────────────────────────────────────────────
[INFO ]    1위 [엔비디아] Score=23.99 | TVL=$12K | Fee=$109 | APR≈734% | ✅ In
[INFO ]    2위 [테슬라]   Score=19.22 | TVL=$32K | Fee=$1846 | APR≈93%  | ✅ In
[INFO ] [시도 1] [엔비디아] 복사 → qbE3vVO... (성공 0/3)
[OK   ] [엔비디아] 복사 성공! NFT: ...
[INFO ] [시도 2] [테슬라] 복사 → D8aYLUN... (성공 1/3)
[OK   ] 목표 달성! 3개 복사 완료 (3번 시도)
```

---

## 에러 대응

| 에러                          | 원인                | 해결                    |
| ----------------------------- | ------------------- | ----------------------- |
| `insufficient funds`          | USDC 잔액 부족      | 자동으로 다음 후보 시도 |
| `WALLET_NOT_CONFIGURED`       | 지갑 미설정         | `byreal-cli setup` 실행 |
| `insufficient funds for rent` | SOL 잔액 부족       | SOL 충전 (0.01 이상)    |
| `조건 만족하는 포지션 없음`   | 필터 기준 너무 높음 | `minAprPercent` 낮추기  |
