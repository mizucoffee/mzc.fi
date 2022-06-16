FROM node:16-alpine

ENV PORT 3000
ADD . /mzcfi

WORKDIR /mzcfi
RUN yarn && yarn build

CMD ["node", "dist"]