from __future__ import annotations

import asyncio
from pathlib import Path
from weakref import WeakSet, WeakValueDictionary

from aiohttp import web

from carte.games import BaseGame
from carte.games.base import Player

cleanup_task = web.AppKey("cleanup_task", asyncio.Task[None])
websockets = web.AppKey("websockets", WeakSet[web.WebSocketResponse])
games = web.AppKey("games", WeakValueDictionary[tuple[str, str], BaseGame[Player]])
games_shelf_path = web.AppKey("games_shelf_path", Path)
