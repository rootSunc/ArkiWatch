FROM node:20-bookworm-slim AS deps

ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json

RUN pnpm install --frozen-lockfile --filter @arkiwatch/web...

FROM deps AS builder

ARG NEXT_PUBLIC_API_BASE_URL=
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}

COPY .eslintrc.base.json ./
COPY tsconfig.base.json ./
COPY apps/web apps/web

RUN pnpm --filter @arkiwatch/web build

FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json

RUN pnpm install --frozen-lockfile --prod --filter @arkiwatch/web...

COPY --from=builder /app/apps/web/.next apps/web/.next
COPY --from=builder /app/apps/web/public apps/web/public
COPY --from=builder /app/apps/web/next.config.mjs apps/web/next.config.mjs

EXPOSE 3000

USER node

CMD ["pnpm", "--filter", "@arkiwatch/web", "exec", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
