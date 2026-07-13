.PHONY: help setup up down logs test lint e2e e2e-ui build-prod up-prod

PASSWORD ?= changeme

help:
	@echo "Ear Candy — available targets:"
	@echo ""
	@echo "  setup            Generate .env with bcrypt hash (PASSWORD=yourpassword)"
	@echo "  up               Start dev stack (docker compose up)"
	@echo "  down             Stop dev stack"
	@echo "  logs             Tail dev stack logs"
	@echo "  test             Run server + client test suites"
	@echo "  lint             Lint server + client"
	@echo "  e2e              Run Playwright E2E tests (requires: make up)"
	@echo "  e2e-ui           Open Playwright UI mode"
	@echo "  build-prod       Build production Docker images"
	@echo "  up-prod          Start production stack (detached)"
	@echo ""
	@echo "  Example: make setup PASSWORD=mysecretpassword"

setup:
	@if [ -f .env ]; then \
		echo ".env already exists — delete it first if you want to regenerate"; \
		exit 1; \
	fi
	@echo "Generating bcrypt hash for password: $(PASSWORD)"
	@HASH=$$(docker run --rm \
		-v $(PWD)/server:/app \
		-w /app \
		-e PW=$(PASSWORD) \
		node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 \
		sh -c 'npm ci --quiet >/dev/null 2>&1 && node -e "const b=require(\"bcrypt\"); b.hash(process.env.PW, 10).then(h=>process.stdout.write(h))"' \
	) && \
	printf 'ADMIN_PASSWORD_HASH=%s\nCOOKIE_SECRET=dev-local-secret-change-me\n' "$$(echo "$$HASH" | sed 's/\$$/$$$$/g')" > .env
	@echo "Created .env — run 'make up' to start"

up:
	docker compose up --build

down:
	docker compose down

logs:
	docker compose logs -f

test:
	cd server && npm test
	cd client && npm test

lint:
	cd server && npm run lint
	cd client && npm run lint

e2e:
	@if ! curl -s http://localhost:5173 > /dev/null 2>&1; then \
		echo "Dev stack not running. Start it first with: make up"; \
		exit 1; \
	fi
	cd e2e && npm test

e2e-ui:
	@if ! curl -s http://localhost:5173 > /dev/null 2>&1; then \
		echo "Dev stack not running. Start it first with: make up"; \
		exit 1; \
	fi
	cd e2e && npm run test:ui

build-prod:
	docker build -t ear-candy .

up-prod:
	docker compose -f docker-compose.prod.yml up -d
