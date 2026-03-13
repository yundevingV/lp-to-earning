# LP to Earning 🤖

나스닥 / 엔비디아 / 테슬라 xStock CLMM 풀에서 최적 포지션을 자동으로 복사하고 리밸런싱하는 **AI 기반 Solana DeFi 자동화 봇**입니다.

## 🚀 주요 기능 및 동작 방식

```text
실행 (1시간마다)
  │
  ├─ 1. 지갑 및 잔액 확인
  ├─ 2. 풀별 후보 수집 (나스닥 → 엔비디아 → 테슬라)
  │      ├─ 필터: inRange=true + APR ≥ 20%
  │      └─ 1차 점수화: Score = TVL × APR
  │
  ├─ 3. AI 보조 어드바이저 (Ollama - gemma3)
  │      └─ 상위 10개 후보 중 최적의 안정성과 수익률을 가진 포지션 선별
  │
  ├─ 4. 자동 복사 (Auto-Copy)
  │      └─ $5 씩 목표 개수(Top N)만큼 포지션 복사
  │
  └─ 5. 리밸런싱 및 사후 관리
         ├─ 범위를 벗어난(Out-of-Range) 노후 포지션 자동 클로즈
         └─ 동일 페어 내 더 높은 수익률의 포지션 발견 시 리밸런싱 (가스비 방어 최적화)
```

## ⚙️ 사전 요구사항

1. **Byreal CLI 설치 및 지갑 연동**

```bash
npm install -g @byreal-io/byreal-cli
byreal-cli setup
```

> **지갑 조건**: 포지션 복사용 USDC 및 가스비용 SOL (최소 0.01 이상 권장)

2. **Ollama 로컬 AI 설치**
   보조 퀀트 어드바이저 역할을 수행할 로컬 AI 모델이 필요합니다.
   [Ollama 공식 웹사이트](https://ollama.com/)에서 설치 후 아래 명령어로 실행합니다.

```bash
ollama run gemma3:4b
```

## 🏃 빠른 실행

```bash
# 의존성 패키지 설치
npm install

# 테스트 모드 (실제 돈이 복사되지 않음)
npm start -- --dry-run
# 또는
node src/main.js --dry-run

# 실제 실행 (가스비와 USDC가 소모됨)
npm start
```

## 🔧 설정 (Config)

모든 주요 설정(복사 금액, 목표 APR, 대상 풀 등)은 프로젝트 루트의 `config.js` 파일에서 손쉽게 수정할 수 있습니다.
코드를 직접 수정할 필요 없이 리밸런싱 주기율(Threshold) 등을 커스텀 가능합니다.

## 📁 파일 구조

이번 리팩토링을 통해 계층형 아키텍처(Layered Architecture) 기반으로 모듈화되었습니다.

```text
lp-to-earning/
 ├─ config.js            # ⚙️ 봇 주요 설정값 관리 (필터링 조건, 투자 금액 등)
 ├─ package.json         # 📦 패키지 및 스크립트 (npm start 등)
 │
 ├─ src/                 # 🚀 메인 소스코드
 │   ├─ main.js          # 모듈을 조립하고 실행하는 메인 파이프라인
 │   ├─ services/        # 핵심 비즈니스 로직
 │   │   ├─ dex.js       # byreal-cli 통신 및 온체인 데이터 조회
 │   │   ├─ ai.js        # Ollama 연동 및 프롬프트 파싱
 │   │   ├─ position.js  # Score 계산 로직
 │   │   └─ rebalance.js # 범위 이탈 클로즈 및 자동 리밸런싱
 │   └─ utils/           # 유틸리티 로직
 │       ├─ logger.js    # 콘솔 및 파일 로그 시스템
 │       └─ db.js        # 로컬 포지션 상태 저장 (positions_db.json)
 │
 ├─ logs/                # 📝 실행 로그 및 DB 폴더
 └─ legacy/              # 📦 레거시 모음 (과거 봇 스크립트 등 보관용)
```
