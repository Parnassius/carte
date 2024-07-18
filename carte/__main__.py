from __future__ import annotations

import asyncio
import urllib.parse
from pathlib import Path
from typing import Any
from weakref import WeakSet, WeakValueDictionary

import aiohttp
import aiohttp_jinja2
import jinja2
from aiohttp import web
from typenv import Env

from carte import app_keys
from carte.games import BaseGame
from carte.routes import routes


async def cookie_ctx_processor(request: web.Request) -> dict[str, Any]:
    defaults = {
        "card_type": "piacentine",
        "theme": "theme-system",
        "username": "",
    }
    return {
        key: urllib.parse.unquote(request.cookies.get(key, val))
        for key, val in defaults.items()
    }


async def close_websockets(app: web.Application) -> None:
    async with asyncio.TaskGroup() as tg:
        websockets = app[app_keys.websockets]
        for ws in set(websockets):
            tg.create_task(ws.close(code=aiohttp.WSCloseCode.GOING_AWAY))


def main() -> None:
    env = Env()
    env.read_env()

    port = env.int("PORT")

    app = web.Application()

    jinja_env = aiohttp_jinja2.setup(
        app,
        context_processors=[cookie_ctx_processor],
        loader=jinja2.PackageLoader("carte"),
    )
    jinja_env.globals["games"] = {k: v.game_name for k, v in BaseGame.GAMES.items()}
    app.add_routes(routes)

    app[aiohttp_jinja2.static_root_key] = "/static"
    app.router.add_static("/static", Path(__file__).parent / "static", name="static")

    app[app_keys.websockets] = WeakSet()
    app.on_shutdown.append(close_websockets)

    app[app_keys.games] = WeakValueDictionary()

    web.run_app(app, port=port)


if __name__ == "__main__":
    main()
