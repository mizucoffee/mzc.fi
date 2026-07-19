FROM node:22-bookworm-slim AS builder

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /mzcfi

COPY package.json package-lock.json ./
RUN npm ci

# tsc が生成済みクライアントの型に依存するため、build 前に generate が必要
COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim

ENV NODE_ENV=production
ENV PORT=3000

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /mzcfi

COPY package.json package-lock.json ./
# @prisma/client の optional peer (prisma CLI, typescript) は devOptional 扱いのため
# dev と optional の両方を omit しないと除外されない
RUN npm ci --omit=dev --omit=optional && npm cache clean --force

# prisma generate の成果物(生成済みクライアント)をビルドステージから持ってくる
COPY --from=builder /mzcfi/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /mzcfi/dist ./dist

COPY prisma ./prisma
COPY views ./views
COPY public ./public

USER node

CMD ["node", "dist"]
