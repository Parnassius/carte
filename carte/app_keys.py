from __future__ import annotations

from weakref import WeakSet, WeakValueDictionary

from aiohttp import web

from carte.games import BaseGame

websockets = web.AppKey("websockets", WeakSet[web.WebSocketResponse])
games = web.AppKey("games", WeakValueDictionary[tuple[str, str], BaseGame])
