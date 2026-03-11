# QQQx/USDC (나스닥) 포지션 복사 스크립트

## 주요 주소

march 11 Wed 기준

- **풀 주소 (QQQx/USDC)**: `FSLSua26xaXSLUG31SnyifgS6wgkRh5SirbCZW9zXNoG`
- **복사 대상 포지션 (Rank 1)**: `8v3kYXvXAxCPpX4E1xNSJGgbaJExorZNx9uWij4yCEev`
  - Liquidity: $51.03K | Earned: $817 | PnL: +1.9% | Copies: 23
  - Price Range: 573.686 → 634.018 (현재 In Range)

---

## Step 1. 지갑 확인

```bash
byreal-cli wallet address
```

---

## Step 2. 풀 분석 (APR, TVL, 변동성 확인)

```bash
byreal-cli pools analyze FSLSua26xaXSLUG31SnyifgS6wgkRh5SirbCZW9zXNoG
```

---

## Step 3. K-line 차트 (가격 추이 확인)

```bash
byreal-cli pools klines FSLSua26xaXSLUG31SnyifgS6wgkRh5SirbCZW9zXNoG
```

---

## Step 4. 상위 포지션 목록 조회

```bash
byreal-cli positions top-positions --pool FSLSua26xaXSLUG31SnyifgS6wgkRh5SirbCZW9zXNoG
```

---

## Step 5. Rank 1 포지션 상세 분석

```bash
byreal-cli positions analyze 8v3kYXvXAxCPpX4E1xNSJGgbaJExorZNx9uWij4yCEev
```

---

## Step 6. 포지션 복사 (dry-run 먼저!)

```bash
# 시뮬레이션 (실제 실행 안됨)
byreal-cli positions copy --position 8v3kYXvXAxCPpX4E1xNSJGgbaJExorZNx9uWij4yCEev --amount-usd 100 --dry-run
```

```bash
# 실제 실행 (금액 수정 후 사용)
byreal-cli positions copy --position 8v3kYXvXAxCPpX4E1xNSJGgbaJExorZNx9uWij4yCEev --amount-usd 100 --confirm
```

---

## Step 7. 내 포지션 확인

```bash
byreal-cli positions list
```

---
