from __future__ import annotations

import asyncio
import shelve
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


async def cleanup_saved_games(app: web.Application) -> None:
    async def _cleanup_saved_games() -> None:
        while True:
            with shelve.open(app[app_keys.games_shelf_path]) as shelf:  # type: ignore[arg-type]
                for key in shelf.keys():
                    try:
                        saved_game = shelf[key]
                    except Exception:
                        del shelf[key]
                    else:
                        if not saved_game.is_valid:
                            del shelf[key]

            await asyncio.sleep(12 * 60 * 60)

    app[app_keys.cleanup_task] = asyncio.create_task(_cleanup_saved_games())


async def add_headers(
    request: web.Request, response: web.StreamResponse  # noqa: ARG001
) -> None:
    response.headers["Content-Security-Policy"] = (
        "default-src 'none'; "
        "connect-src 'self'; "
        "img-src 'self'; "
        "script-src 'self'; "
        "style-src 'self'; "
        "base-uri 'none'; "
        "form-action 'none'; "
    )


async def close_websockets(app: web.Application) -> None:
    async with asyncio.TaskGroup() as tg:
        websockets = app[app_keys.websockets]
        for ws in set(websockets):
            tg.create_task(ws.close(code=aiohttp.WSCloseCode.GOING_AWAY))


def main() -> None:
    env = Env()
    env.read_env()

    port = env.int("PORT")
    data_path = Path(__file__).parent.parent
    if data_path_ := env.str("DATA_PATH", default=""):
        data_path = Path(data_path_)

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

    app.on_startup.append(cleanup_saved_games)

    app.on_response_prepare.append(add_headers)

    app[app_keys.websockets] = WeakSet()
    app.on_shutdown.append(close_websockets)

    app[app_keys.games] = WeakValueDictionary()
    app[app_keys.games_shelf_path] = data_path / "games"

    web.run_app(app, port=port)


if __name__ == "__main__":
    main()
