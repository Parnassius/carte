FROM python:3.13-alpine@sha256:323a717dc4a010fee21e3f1aac738ee10bb485de4e7593ce242b36ee48d6b352 as base

ENV PYTHONUNBUFFERED=1

ENV DATA_PATH=/data
WORKDIR /app


FROM base as builder

ENV UV_COMPILE_BYTECODE=1
ENV UV_FROZEN=1
ENV UV_LINK_MODE=copy

RUN apk upgrade --no-cache
RUN apk add --no-cache gcc musl-dev libffi-dev

COPY --from=ghcr.io/astral-sh/uv@sha256:8257f3d17fd04794feaf89d83b4ccca3b2eaa5501de9399fa53929843c0a5b55 /uv /bin/uv

RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --no-install-project --no-dev --no-editable

COPY . .
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --no-dev --no-editable


FROM builder as test

RUN apk add --no-cache nodejs npm
RUN apk add --no-cache make

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --no-editable
RUN npm ci

RUN make lint
RUN make pytest


FROM base as final

ENV PATH="/app/.venv/bin:$PATH"
COPY --from=builder /app/.venv .venv
COPY ./entrypoint.sh /entrypoint.sh

ENTRYPOINT [ "/entrypoint.sh" ]
