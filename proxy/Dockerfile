FROM node:22-alpine

WORKDIR /app
COPY package.json server.js ./

ENV NODE_ENV=production
# Koyeb сам подставляет PORT; значение по умолчанию совпадает с local run.
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
