from __future__ import annotations

import asyncio
import itertools
import random
from collections.abc import Callable, Iterable, Iterator
from typing import Any, ClassVar, get_type_hints, overload
from weakref import WeakSet

import aiohttp
from aiohttp import web

from carte.exc import CmdError
from carte.types import Card, CardNumber, CmdFunc, Command, GameStatus, Player, Suit


def cmd(
    *, game_status: GameStatus | None = None, current_player: bool = False
) -> Callable[[CmdFunc], Command[CmdFunc]]:
    def decorator(func: CmdFunc) -> Command[CmdFunc]:
        return Command(func, game_status, current_player)

    return decorator


class BaseGame:
    GAMES: ClassVar[dict[str, type[BaseGame]]] = {}

    version: int
    game_name: str
    number_of_players: int
    hand_size: int

    def __init__(self) -> None:
        self.websockets: WeakSet[web.WebSocketResponse] = WeakSet()
        self._recv_lock = asyncio.Lock()
        self._send_lock = asyncio.Lock()
        self._players: list[Player] = []
        self._deck: list[Card]
        self._starting_player_id = random.randrange(self.number_of_players)
        self._current_player_id: int
        self._game_status = GameStatus.NOT_STARTED

    def __init_subclass__(
        cls,
        *,
        version: int,
        game_name: str | None = None,
        number_of_players: int,
        hand_size: int,
        **kwargs: Any,
    ) -> None:
        super().__init_subclass__(**kwargs)
        cls.version = version
        cls.game_name = game_name or cls.__name__
        cls.number_of_players = number_of_players
        cls.hand_size = hand_size
        cls.GAMES[cls.__name__.lower()] = cls

    def __getstate__(self) -> dict[str, Any]:
        state = self.__dict__.copy()
        del state["websockets"]
        del state["_recv_lock"]
        del state["_send_lock"]
        return state

    def __setstate__(self, state: dict[str, Any]) -> None:
        self.websockets = WeakSet()
        self._recv_lock = asyncio.Lock()
        self._send_lock = asyncio.Lock()
        self.__dict__.update(state)

    def _shuffle_deck(self) -> list[Card]:
        cards = [
            Card(suit, number) for suit, number in itertools.product(Suit, CardNumber)  # type: ignore[arg-type]
        ]
        random.shuffle(cards)
        return cards

    @property
    def current_player(self) -> Player:
        return self._players[self._current_player_id]

    def _board_state(self, ws_player: Player | None) -> Iterator[list[Any]]:
        raise NotImplementedError

    async def _send_str(self, ws: web.WebSocketResponse, msg: str) -> None:
        try:
            await ws.send_str(msg)
        except OSError as e:
            print(e)

    @overload
    async def _send(
        self,
        maybe_player_or_ws: Player | web.WebSocketResponse,
        *args: str | int | Card,
    ) -> None: ...

    @overload
    async def _send(
        self,
        maybe_player_or_ws: str | int | Card,
        *args: str | int | Card,
        websockets: Iterable[web.WebSocketResponse] | None = ...,
    ) -> None: ...

    async def _send(
        self,
        maybe_player_or_ws: Player | web.WebSocketResponse | str | int | Card,
        *args: str | int | Card,
        websockets: Iterable[web.WebSocketResponse] | None = None,
    ) -> None:
        if isinstance(maybe_player_or_ws, Player):
            await self._send(*args, websockets=maybe_player_or_ws.websockets)
            return
        if isinstance(maybe_player_or_ws, web.WebSocketResponse):
            await self._send(*args, websockets=[maybe_player_or_ws])
            return

        args = (maybe_player_or_ws, *args)
        async with self._send_lock, asyncio.TaskGroup() as tg:
            msg = "|".join(str(x).replace("|", "") for x in args)
            if websockets is None:
                websockets = self.websockets
            for ws in websockets:
                if not ws.closed:
                    tg.create_task(self._send_str(ws, msg))

    async def _send_others(
        self, player_or_ws: Player | web.WebSocketResponse, *args: Any
    ) -> None:
        websockets = (
            player_or_ws.websockets
            if isinstance(player_or_ws, Player)
            else {player_or_ws}
        )
        await self._send(*args, websockets=self.websockets - websockets)

    async def _send_current_state(
        self, ws: web.WebSocketResponse, player: Player | None = None
    ) -> None:
        await self._send(ws, "players", *(x.name for x in self._players))
        if player and self._game_status is not GameStatus.NOT_STARTED:
            await self._send(ws, "player_id", self._players.index(player))

        if self._game_status is GameStatus.STARTED:
            await self._send(ws, "animations", "off")
            await self._send(ws, "begin")
            for args in self._board_state(player):
                await self._send(ws, *args)
            await self._send(ws, "animations", "on")

        elif self._game_status is GameStatus.ENDED and player:
            await self.cmd_rematch.func(self, player)

    async def _send_results(self, results: list[int]) -> None:
        await self._send("results", *results)
        self._starting_player_id = (
            self._starting_player_id + 1
        ) % self.number_of_players
        for player in self._players:
            player.reset()

    async def _prepare_start(self) -> None:
        self._deck = self._shuffle_deck()
        self._current_player_id = self._starting_player_id
        self._game_status = GameStatus.STARTED

        await self._send("players", *(x.name for x in self._players))
        for player_id, player in enumerate(self._players):
            await self._send(player, "player_id", player_id)

        await self._send("begin")
        await self._start_game()
        await self._send(self.current_player, "turn")

    async def _start_game(self) -> None:
        raise NotImplementedError

    async def _draw_card(self, player: Player) -> None:
        card = self._deck.pop()
        player.hand.append(card)
        player_id = self._players.index(player)
        async with asyncio.TaskGroup() as tg:
            tg.create_task(self._send(player, "draw_card", player_id, card))
            tg.create_task(self._send_others(player, "draw_card", player_id))

    async def handle_raw_cmd(
        self, ws: web.WebSocketResponse, msg: aiohttp.WSMessage
    ) -> None:
        if msg.type != aiohttp.WSMsgType.TEXT:
            err = (
                f"Incorrect message type: "
                f"expected {aiohttp.WSMsgType.TEXT.name}, received {msg.type.name}"
            )
            raise CmdError(err)

        cmd, *args = msg.data.split("|")
        await self.handle_cmd(ws, cmd, *args)

    async def handle_cmd(
        self, ws: web.WebSocketResponse, raw_cmd: str, *raw_args_tuple: str
    ) -> None:
        try:
            cmd = getattr(self, f"cmd_{raw_cmd}")
            if not isinstance(cmd, Command):
                raise TypeError  # noqa: TRY301
        except (AttributeError, TypeError) as e:
            err = f"Invalid command {raw_cmd}"
            raise CmdError(err) from e

        if cmd.current_player and ws not in self.current_player.websockets:
            msg = "It's not your turn"
            raise CmdError(msg)

        if cmd.game_status and cmd.game_status is not self._game_status:
            msg = "Invalid game status"
            raise CmdError(msg)

        raw_args = iter(raw_args_tuple)
        params = get_type_hints(cmd.func)
        args: list[Any] = []
        for name, type_ in params.items():
            if type_ is web.WebSocketResponse:
                args.append(ws)
            elif type_ is Player:
                try:
                    idx = self._players.index(Player(ws.cookies["session_id"].value))
                except ValueError as e:
                    err = "You're not a player"
                    raise CmdError(err) from e
                args.append(self._players[idx])
            elif type_ == Player | None:
                try:
                    idx = self._players.index(Player(ws.cookies["session_id"].value))
                except ValueError:
                    args.append(None)
                else:
                    args.append(self._players[idx])
            elif type_ is Card:
                card = next(raw_args)
                try:
                    suit, number = card.split(":")
                    args.append(Card(Suit(suit), CardNumber(number)))
                except ValueError as e:
                    err = f"Invalid card: {card}"
                    raise CmdError(err) from e
            elif name != "return":
                args.append(next(raw_args))

        cmd_expected_params = len(params) - 1
        cmd_given_params = len(args)
        if cmd_expected_params != cmd_given_params:
            err = (
                f"Invalid number of parameters for command {raw_cmd}: "
                f"{cmd_expected_params} expected, {cmd_given_params} given"
            )
            raise CmdError(err)

        try:
            async with self._recv_lock:
                await cmd.func(self, *args)
        except CmdError as e:
            raise CmdError(str(e), raw_cmd) from e

    @cmd()
    async def cmd_current_state(
        self, ws: web.WebSocketResponse, player: Player | None
    ) -> None:
        await self._send_current_state(ws, player)

    @cmd()
    async def cmd_join(self, ws: web.WebSocketResponse, name: str) -> None:
        player = Player(ws.cookies["session_id"].value, name)
        try:
            idx = self._players.index(player)
        except ValueError:
            if len(self._players) >= self.number_of_players:
                await self._send_current_state(ws)
                return
            self._players.append(player)
            await self._send_others(ws, "players", *(x.name for x in self._players))
        else:
            player = self._players[idx]
            player.name = name

        player.websockets.add(ws)
        await self._send_current_state(ws, player)

        if (
            len(self._players) == self.number_of_players
            and self._game_status is GameStatus.NOT_STARTED
        ):
            random.shuffle(self._players)
            await self._prepare_start()

    @cmd()
    async def cmd_name(self, player: Player, name: str) -> None:
        player.name = name
        await self._send("players", *(x.name for x in self._players))

    @cmd(game_status=GameStatus.ENDED)
    async def cmd_rematch(self, player: Player) -> None:
        player.ready = True
        if all(x.ready for x in self._players):
            await self._prepare_start()
