# syntax=docker/dockerfile:1

FROM ghcr.io/nubjs/nub:0.9.7-alpine AS build
WORKDIR /app
COPY --chown=node:node package.json nub.lock ./
RUN nub ci
COPY --chown=node:node . .
RUN nub run build
RUN nub ci --prod

FROM ghcr.io/nubjs/nub:0.9.7-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./package.json
USER node
EXPOSE 3000
CMD ["nub", "run", "start"]
