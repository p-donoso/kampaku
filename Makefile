.PHONY: bootstrap build dev up start stop install test-e2e test-agents-e2e

bootstrap:
	cd kampaku-core && npm run build && npm run bootstrap

build:
	cd kampaku-core && npm install && npm run build
	cd kampaku-worker && npm install && npm run build
	cd kampaku-web && npm install && npm run build

install:
	./scripts/install.sh

dev up:
	@PATH="$$HOME/.local/bin:$$PATH" $(MAKE) -s _dev

_dev:
	@if command -v kampaku >/dev/null 2>&1; then \
		kampaku up; \
	elif [ -x ./scripts/kampaku ]; then \
		./scripts/kampaku up; \
	else \
		cd kampaku-core && npx tsx src/cli.ts up; \
	fi

start:
	./scripts/start.sh

stop:
	./scripts/stop.sh

test-e2e:
	KAMPAKU_PLANNER=stub KAMPAKU_EXECUTOR=echo ./scripts/smoke-e2e.sh

test-agents-e2e:
	KAMPAKU_AGENT=stub ./scripts/smoke-agents-e2e.sh
