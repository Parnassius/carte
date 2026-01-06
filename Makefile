.venv: uv.lock
	@uv sync
	@touch .venv

node_modules: package-lock.json
	@npm ci
	@touch node_modules

.PHONY: deps
deps: .venv node_modules

.PHONY: format
format: deps
	@uv run ruff check src tests --fix-only
	@uv run ruff format src tests
	@npm exec --offline -- prettier src/carte/templates --write
	@npm exec --offline -- @biomejs/biome check src --write

.PHONY: format-check
format-check: deps
	@uv run ruff format src tests --check
	@npm exec --offline -- prettier src/carte/templates --check

.PHONY: mypy
mypy: deps
	@uv run mypy src tests

.PHONY: ruff
ruff: deps
	@uv run ruff check src tests

.PHONY: biome
biome: deps
	@npm exec --offline -- @biomejs/biome ci --error-on-warnings src

.PHONY: pytest
pytest: deps
	@uv run pytest

.PHONY: lint
lint: format-check mypy ruff biome

.PHONY: all
all: format mypy ruff biome pytest

.DEFAULT_GOAL := all
