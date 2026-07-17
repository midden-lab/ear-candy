.PHONY: help setup up down logs test lint e2e e2e-ui e2e-check-running e2e-reset-db build-prod up-prod

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
	@echo "  e2e              Run Playwright E2E tests (requires: make up). Wipes and re-seeds"
	@echo "                   the local dev database first for a clean, deterministic run —"
	@echo "                   any manually-added episodes/seasons/settings will be lost."
	@echo "  e2e-ui           Open Playwright UI mode (same DB reset as e2e)"
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
	COOKIE_SECRET=$$(openssl rand -hex 32) && \
	printf 'ADMIN_PASSWORD_HASH=%s\nCOOKIE_SECRET=%s\n' "$$(echo "$$HASH" | sed 's/\$$/$$$$/g')" "$$COOKIE_SECRET" > .env
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

e2e-check-running:
	@if ! curl -s http://localhost:5173 > /dev/null 2>&1; then \
		echo "Dev stack not running. Start it first with: make up"; \
		exit 1; \
	fi

# E2E specs share one real database and assert on exact content (episode
# titles, season names, counts) — any leftover local dev data (or a prior
# run's cleanup having been interrupted, e.g. by force-killing a hung test)
# collides with what the seeded fixtures create and produces confusing
# cascading failures that have nothing to do with the code under test. CI's
# e2e job never sees this because it runs against a fresh container with an
# empty database; resetting here makes local runs match that guarantee.
e2e-reset-db: e2e-check-running
	@echo "Resetting local dev database for a clean e2e run (this wipes server/data/db.sqlite*)..."
	docker compose stop server
	rm -f server/data/db.sqlite server/data/db.sqlite-shm server/data/db.sqlite-wal
	docker compose up -d server
	@echo "Waiting for the server to come back up..."
	@for i in $$(seq 1 30); do \
		curl -sf http://localhost:3001/api/health > /dev/null 2>&1 && exit 0; \
		sleep 1; \
	done; \
	echo "Server did not become healthy after reset" && exit 1

e2e: e2e-reset-db
	cd e2e && npm test

e2e-ui: e2e-reset-db
	cd e2e && npm run test:ui

build-prod:
	docker build -t ear-candy .

up-prod:
	docker compose -f docker-compose.prod.yml up -d
