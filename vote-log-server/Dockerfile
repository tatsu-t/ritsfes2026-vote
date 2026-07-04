FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src/ ./src/
COPY public/ ./public/

USER node

CMD ["node", "src/main.js"]
