# LP to Earning 🤖

QQQx/USDC (나스닥) 풀의 최고 TVL 포지션을 자동으로 복사하는 Solana DeFi 자동화 봇.

## 전략

| 항목          | 내용                             |
| ------------- | -------------------------------- |
| **풀**        | QQQx/USDC (나스닥 100 추종)      |
| **리스크**    | 저수익 고안정성                  |
| **복사 기준** | TVL(유동성) 1위 포지션 자동 선택 |
| **복사 금액** | $1 (고정)                        |
| **실행 주기** | 1시간마다 자동 실행 (cron)       |

## 주요 파일

```
├── auto-copy.sh          # 자동 복사 스크립트 (핵심)
├── script.md             # 수동 실행 커맨드 모음
└── logs/
    └── auto-copy.log     # 실행 로그
```

---

## 빠른 시작

### 1. 사전 요구사항

```bash
# byreal-cli 설치
npm install -g @byreal-io/byreal-cli

# 지갑 최초 설정
byreal-cli setup
```

### 2. 지갑 잔액 확인

```bash
byreal-cli wallet balance
```

> USDC $1 이상 + SOL 소량(가스비용, 최소 0.01 SOL 이상) 필요

### 3. 시뮬레이션 (dry-run)

```bash
bash auto-copy.sh
```

### 4. 실제 실행

```bash
DRY_RUN=false bash auto-copy.sh
```

---

## 자동화 (1시간마다 cron)

### cron 등록

```bash
(crontab -l 2>/dev/null; echo "0 * * * * DRY_RUN=false bash /Users/dbstjd/Documents/project/lp-to-earning/auto-copy.sh >> /Users/dbstjd/Documents/project/lp-to-earning/logs/auto-copy.log 2>&1") | crontab -
```

### cron 관리

```bash
# 등록 확인
crontab -l

# 로그 실시간 확인
tail -f logs/auto-copy.log

# cron 비활성화 (멈추고 싶을 때)
crontab -r
```

---

## 수동 커맨드 참고

```bash
# 지갑 확인
byreal-cli wallet address

# TVL 상위 포지션 목록
byreal-cli positions top-positions --pool FSLSua26xaXSLUG31SnyifgS6wgkRh5SirbCZW9zXNoG

# 포지션 복사 (시뮬)
byreal-cli positions copy --position <nft-mint> --amount-usd 1 --dry-run

# 포지션 복사 (실행)
byreal-cli positions copy --position <nft-mint> --amount-usd 1 --confirm

# 내 포지션 확인
byreal-cli positions list
```

---
