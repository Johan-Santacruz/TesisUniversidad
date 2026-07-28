from __future__ import annotations

import json
import logging
from typing import Any


SAFE_LOG_FIELDS = frozenset(
    {
        "analysis_id",
        "case_id",
        "duration_ms",
        "entity_id",
        "entity_type",
        "error_code",
        "event_id",
        "provider",
        "route_type",
        "stage",
        "state",
        "status",
        "user_id",
        "video_id",
    }
)


class SafeLogger:
    def __init__(self, logger: logging.Logger) -> None:
        self._logger = logger

    def _message(self, event: str, fields: dict[str, Any]) -> str:
        safe = {
            key: value
            for key, value in fields.items()
            if key in SAFE_LOG_FIELDS
            and isinstance(value, (str, int, float, bool, type(None)))
        }
        payload = {"event": event, **safe}
        return json.dumps(payload, ensure_ascii=True, sort_keys=True)

    def info(self, event: str, **fields: Any) -> None:
        self._logger.info(self._message(event, fields))

    def warning(self, event: str, **fields: Any) -> None:
        self._logger.warning(self._message(event, fields))

    def error(self, event: str, **fields: Any) -> None:
        self._logger.error(self._message(event, fields))


def get_logger(name: str) -> SafeLogger:
    return SafeLogger(logging.getLogger(name))

