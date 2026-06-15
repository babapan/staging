FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY . .

RUN mkdir -p /app/apk-files

EXPOSE 3002

CMD ["node", "server.js"]
