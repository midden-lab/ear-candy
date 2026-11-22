.PHONY: help setup up down logs test lint e2e e2e-ui e2e-check-running e2e-reset-db build-prod up-prod

PASSWORD ?= changeme

help:
	@echo "Ear Candy — available targets:"
	@echo ""
	@echo "  setup            Generate .env with bcrypt hash (PASSWORD='16+ char passphrase')"
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
	@echo "  Example: PASSWORD='a-long-passphrase-16+-chars' make setup"

# `PASSWORD=... make setup` or `make setup PASSWORD=...` both work. Exported so
# the recipe can read it from the environment instead of having make splice it
# into the shell command text (a password containing a space, quote or `$`
# used to break — or inject into — the old interpolated command line).
export PASSWORD

# Admin password -> bcrypt hash, entirely inside a throwaway container:
#  - The password reaches the container through the environment (`-e PW`
#    with no value: docker copies it from this shell), never as a command-line
#    argument, and is never echoed.
#  - The real server/ directory is NOT bind-mounted. Only package.json and the
#    lockfile are mounted, read-only; `npm ci` runs on a copy inside the
#    container. The old `-v server:/app` + `npm ci` replaced the host's
#    macOS node_modules with Linux binaries. Installing from the lockfile
#    (not an unpinned `npm install bcrypt`) keeps npm's integrity checks on
#    the package that sees the real password. `--ignore-scripts` means no
#    package install script runs at all, and it is also what makes this work:
#    the old `npm ci` tried to COMPILE better-sqlite3 (no prebuilt binary for
#    Node 20 on musl/arm64, so on Apple Silicon it failed outright — `make
#    setup` was broken there) while bcrypt, the only module used here, ships
#    its own prebuilt binaries and needs no install step.
#  - Cost 12, matching scripts/hash-password.sh and the README (it was 10).
#    Existing hashes keep working: the cost is embedded in the hash.
setup:
	@if [ -f .env ]; then \
		echo ".env already exists — delete it first if you want to regenerate"; \
		exit 1; \
	fi
	@if [ -z "$$PASSWORD" ]; then \
		echo "PASSWORD is required, e.g.: PASSWORD='a-long-passphrase-16+-chars' make setup" >&2; \
		exit 1; \
	fi
	@if [ "$${#PASSWORD}" -lt 16 ]; then \
		echo "WARNING: that password is under 16 characters. The admin password is the only thing between the internet and full control of this site; use a long passphrase (16+ characters)." >&2; \
	fi
	@echo "Generating a bcrypt hash (cost 12) for the admin password..."
	@HASH=$$(PW="$$PASSWORD" docker run --rm \
		-e PW \
		-v "$(CURDIR)/server/package.json:/in/package.json:ro" \
		-v "$(CURDIR)/server/package-lock.json:/in/package-lock.json:ro" \
		node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 \
		sh -c 'mkdir /w && cp /in/package.json /in/package-lock.json /w/ && cd /w && npm ci --omit=dev --ignore-scripts --quiet >/dev/null 2>&1 && node -e "const b=require(\"bcrypt\"); b.hash(process.env.PW, 12).then(h=>process.stdout.write(h))"' \
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
