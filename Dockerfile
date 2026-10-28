# syntax=docker/dockerfile:1

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY package.json ./
COPY src ./src
USER app
EXPOSE 3000
CMD ["node", "src/index.js"]
