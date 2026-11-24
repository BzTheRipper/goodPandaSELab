FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
# Only runtime dependencies: tests and the in-memory Mongo are dev-only.
RUN npm ci --omit=dev

COPY src ./src

EXPOSE 5000
CMD ["node", "src/index.js"]
