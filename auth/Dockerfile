FROM golang:1.20-alpine AS builder

# Install gcc and musl-dev because go-sqlite3 requires CGO
RUN apk add --no-cache gcc musl-dev

WORKDIR /app

COPY go.mod main.go ./
RUN go mod tidy
RUN CGO_ENABLED=1 GOOS=linux go build -o auth-server main.go

FROM alpine:latest
WORKDIR /app
# Install sqlite libs just in case, though static build might not need it, CGO build usually dynamic links libc
RUN apk add --no-cache sqlite-libs

COPY --from=builder /app/auth-server .
EXPOSE 8080
CMD ["./auth-server"]
