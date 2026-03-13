# auto-copy.sh 상세 문서

QQQx/USDC (나스닥) **단일 풀**을 대상으로 TVL 1위 포지션을 자동 복사하는 경량 쉘 스크립트.  
Mac / Linux 전용. Windows는 WSL 또는 Git Bash 사용.

---

## 설정값

`auto-copy.sh` 상단에서 직접 수정합니다.

| 변수         | 기본값            | 설명                       |
| ------------ | ----------------- | -------------------------- |
| `POOL`       | QQQx/USDC 풀 주소 | 대상 풀 주소               |
| `AMOUNT_USD` | `1`               | 복사 금액 ($)              |
| `DRY_RUN`    | `true`            | 환경변수로 오버라이드 가능 |

---

## 실행

```bash
# 시뮬레이션 (기본값 — 실제 트랜잭션 없음)
bash auto-copy.sh

# 실제 실행
DRY_RUN=false bash auto-copy.sh
```

---

## 실행 단계

```
Step 1. 지갑 확인 (WALLET_NOT_CONFIGURED이면 중단)
Step 2. 풀 상위 포지션 조회 → TVL 1위 자동 선택
Step 3. In-Range 여부 체크 (Out이면 경고 후 계속 여부 확인)
Step 4. 포지션 복사 (dry-run 또는 confirm)
Step 5. 내 포지션 목록 출력
```

---

## 자동화 — cron (1시간마다)

### 등록

```bash
(crontab -l 2>/dev/null; echo "0 * * * * DRY_RUN=false bash /Users/dbstjd/Documents/project/lp-to-earning/auto-copy.sh >> /Users/dbstjd/Documents/project/lp-to-earning/logs/auto-copy.log 2>&1") | crontab -
```

### 관리

```bash
# 등록 확인
crontab -l

# 로그 실시간 확인
tail -f logs/auto-copy.log

# 비활성화
crontab -r
```

> ⚠️ **주의**: Mac이 잠자기 상태이면 cron이 실행되지 않습니다.  
> 상시 실행이 필요하면 `bot.js` 백그라운드 실행을 권장합니다.

---

## bot.js와 차이점

| 항목      | auto-copy.sh           | bot.js                           |
| --------- | ---------------------- | -------------------------------- |
| 대상 풀   | QQQx/USDC (나스닥 1개) | 나스닥 + 엔비디아 + 테슬라 (3개) |
| 플랫폼    | Mac / Linux            | Mac / Windows / Linux            |
| 스케줄러  | cron (외부)            | setInterval (내장)               |
| 중복 방지 | 없음                   | 동일 tick 범위 중복 체크         |
| APR 필터  | 없음                   | minAprPercent 기준 필터          |
| 언어      | Bash                   | Node.js                          |

---

## 가스비 참고

트랜잭션 1회 기준 (실측):

| 항목   | 값                        |
| ------ | ------------------------- |
| 가스비 | ~23,700 lamports          |
| SOL    | ~0.0000237 SOL            |
| USD    | ~$0.003 (SOL ≈ $130 기준) |

월간(720회) 기준: **SOL 약 0.017개 ≈ $2.2**
