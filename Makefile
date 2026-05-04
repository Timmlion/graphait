.PHONY: install dev dev-api dev-ui test

install:
	pip install -r requirements.txt
	pip install -r requirements-dev.txt
	cd frontend && npm install

dev:
	@echo "Starting API + frontend..."
	@make -j2 dev-api dev-ui

dev-api:
	uvicorn graphait.main:app --reload --host 0.0.0.0 --port 8000

dev-ui:
	cd frontend && npm run dev

test:
	pytest tests/
