.PHONY: bootstrap backend frontend test test-backend test-frontend contracts contracts-check verify

bootstrap:
	./scripts/bootstrap-local.sh

backend:
	cd Backend && .venv/bin/uvicorn app.main:create_app --factory --reload --host 127.0.0.1 --port 8000

frontend:
	cd frontend && npm run dev

test: test-backend test-frontend

test-backend:
	cd Backend && PYTHONPATH=. .venv/bin/pytest -q

test-frontend:
	cd frontend && npm test -- --run

contracts:
	./scripts/generate-contracts.sh

contracts-check:
	./scripts/generate-contracts.sh --check

verify:
	cd Backend && PYTHONPATH=. .venv/bin/pytest -q
	cd frontend && npm test -- --run
	cd frontend && npm run build
	./scripts/generate-contracts.sh --check
	git diff --check
