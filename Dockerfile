FROM node:26-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY index.html ./
COPY public ./public
COPY server ./server
COPY src ./src
COPY scripts ./scripts
COPY deploy ./deploy
COPY docs ./docs
COPY README.md ./

ENV PORT=4273
EXPOSE 4273

VOLUME ["/app/storage"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4273) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["npm", "run", "start"]
