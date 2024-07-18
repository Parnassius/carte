#!/bin/sh
set -e

if [ -d /static ]; then
    rm -rf /static/*
    cp -r /app/.venv/lib/python*/site-packages/carte/static/* /static
fi

exec carte "$@"
