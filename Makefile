.venv: uv.lock
	@uv sync
	@touch .venv

node_modules: package-lock.json
	@npm ci
	@touch node_modules

.PHONY: deps
deps: .venv node_modules

.PHONY: format
format:
	@uv run ruff check src tests --fix-only
	@uv run ruff format src tests
	@npx --no prettier src/carte/templates --write
	@npx --no @biomejs/biome check src --write

.PHONY: format-check
format-check:
	@uv run ruff format src tests --check
	@npx --no prettier src/carte/templates --check

.PHONY: mypy
mypy:
	@uv run mypy src tests

.PHONY: ruff
ruff:
	@uv run ruff check src tests

.PHONY: biome
biome:
	@npx --no @biomejs/biome ci --error-on-warnings src

.PHONY: pytest
pytest:
	@uv run pytest

.PHONY: lint
lint: format-check mypy ruff biome

.PHONY: all
all: format mypy ruff biome pytest

.DEFAULT_GOAL := all
