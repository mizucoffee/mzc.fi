FROM node:22-bookworm-slim

ENV PORT 3000

RUN apt-get update -y && apt-get install -y openssl
ADD . /mzcfi
WORKDIR /mzcfi
RUN npm i && npm run build

CMD ["node", "dist"]