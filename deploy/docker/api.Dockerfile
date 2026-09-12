FROM golang:1.25-alpine AS builder

WORKDIR /src

COPY apps/api/go.mod apps/api/go.sum ./apps/api/
WORKDIR /src/apps/api
RUN go mod download

COPY apps/api/ ./

ARG TARGETOS=linux
ARG TARGETARCH
ARG APP_VERSION=0.1.0
ARG BUILD_SHA=development
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -trimpath -ldflags "-s -w -X main.buildVersion=${APP_VERSION} -X main.buildSHA=${BUILD_SHA}" -o /out/arkiwatch-api ./cmd/server \
    && CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -trimpath -ldflags "-s -w -X main.buildVersion=${APP_VERSION} -X main.buildSHA=${BUILD_SHA}" -o /out/arkiwatch-scheduler ./cmd/scheduler \
    && CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -trimpath -ldflags "-s -w -X main.buildVersion=${APP_VERSION} -X main.buildSHA=${BUILD_SHA}" -o /out/arkiwatch-bootstrap ./cmd/bootstrap \
    && CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -trimpath -ldflags "-s -w -X main.buildVersion=${APP_VERSION} -X main.buildSHA=${BUILD_SHA}" -o /out/arkiwatch-migrate ./cmd/migrate

FROM alpine:3.22 AS runtime

ARG APP_VERSION=0.0.0
ARG BUILD_SHA=development

RUN apk add --no-cache ca-certificates curl \
    && addgroup -S arkiwatch \
    && adduser -S -D -H -G arkiwatch arkiwatch

COPY --from=builder /out/arkiwatch-api /app/arkiwatch-api
COPY --from=builder /out/arkiwatch-scheduler /app/arkiwatch-scheduler
COPY --from=builder /out/arkiwatch-bootstrap /app/arkiwatch-bootstrap
COPY --from=builder /out/arkiwatch-migrate /app/arkiwatch-migrate

RUN chown arkiwatch:arkiwatch /app/arkiwatch-api /app/arkiwatch-scheduler /app/arkiwatch-bootstrap /app/arkiwatch-migrate

ENV API_HOST=0.0.0.0 \
    API_PORT=8000 \
    APP_VERSION=${APP_VERSION} \
    BUILD_SHA=${BUILD_SHA}

EXPOSE 8000

USER arkiwatch

CMD ["/app/arkiwatch-api"]
