from __future__ import annotations


class CmdError(Exception):
    def __init__(self, message: str, command: str | None = None) -> None:
        super().__init__(message)

        self.command = command
