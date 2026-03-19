# 1. Base Image
FROM node:20-slim

# shell 인코딩이나 로딩을 방지하기 위함 (기본 curl 필요량 등)
RUN apt-get update && apt-get install -y \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# 2. b-byreal-cli를 글로벌로 설치
RUN npm install -g @byreal-io/byreal-cli

# 3. 작업 디렉토리 설정
WORKDIR /app

# 4. 앱 디펜던시 복사
COPY package*.json ./
# 디바이스 기본 노드 모듈이 없을 수도 있으니 설치
RUN npm install --production

# 5. 소스 코드 복사
COPY . .

# 6. 진입 스크립트 실행 권한
RUN chmod +x ./entrypoint.sh

# 7. 진입점 설정 및 실행
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "src/main.js"]
