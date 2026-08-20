from __future__ import annotations

from collections.abc import Callable, Iterator
from dataclasses import dataclass
from io import BytesIO
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
from typing import BinaryIO, Literal, Protocol
import wave


IO_BLOCK_BYTES = 64 * 1024
PROVIDER_LIMIT_BYTES = 25 * 1024 * 1024
SAMPLE_RATE = 16_000
SAMPLE_WIDTH_BYTES = 2
CHANNEL_COUNT = 1
AUDIO_CHUNK_SECONDS = 10 * 60
PCM_CHUNK_BYTES = (
    SAMPLE_RATE * SAMPLE_WIDTH_BYTES * CHANNEL_COUNT * AUDIO_CHUNK_SECONDS
)
MAX_TOOL_OUTPUT_BYTES = 1024 * 1024


class MediaValidationError(ValueError):
    pass


class EmptyMediaError(MediaValidationError):
    pass


class UnsupportedMediaError(MediaValidationError):
    pass


class NoAudioTrackError(MediaValidationError):
    pass


class MediaTooLargeError(MediaValidationError):
    pass


class MediaToolUnavailableError(RuntimeError):
    pass


@dataclass(frozen=True)
class MediaMetadata:
    media_type: Literal["video/mp4", "video/webm"]
    size_bytes: int
    duration_ms: int
    audio_stream_count: int


@dataclass(frozen=True)
class AudioChunk:
    index: int
    start_ms: int
    end_ms: int
    wav_bytes: bytes


@dataclass(frozen=True)
class _ToolResult:
    returncode: int
    stdout: bytes
    stderr: bytes


class _VideoService(Protocol):
    settings: object

    def iter_plain_chunks(self, video: object) -> Iterator[bytes]: ...


def _rewind(source: BinaryIO) -> None:
    # Buffered request files may have prefetched bytes before a subprocess reads
    # their descriptor. Seeking via EOF forces the Python buffer and descriptor
    # back into agreement instead of taking the in-buffer seek fast path.
    source.seek(0, os.SEEK_END)
    source.seek(0, os.SEEK_SET)


def _bounded_reader(stream: BinaryIO, target: bytearray) -> None:
    while True:
        block = stream.read(IO_BLOCK_BYTES)
        if not block:
            return
        remaining = MAX_TOOL_OUTPUT_BYTES - len(target)
        if remaining > 0:
            target.extend(block[:remaining])


def _run_piped_source(
    command: list[str],
    source: BinaryIO,
) -> _ToolResult:
    try:
        process = subprocess.Popen(
            command,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
    except FileNotFoundError as exc:
        raise MediaToolUnavailableError(command[0]) from exc
    assert process.stdin is not None
    assert process.stdout is not None
    assert process.stderr is not None
    stdout = bytearray()
    stderr = bytearray()

    def feed() -> None:
        try:
            while block := source.read(IO_BLOCK_BYTES):
                process.stdin.write(block)
        except BrokenPipeError:
            pass
        finally:
            process.stdin.close()

    threads = [
        threading.Thread(target=feed, daemon=True),
        threading.Thread(
            target=_bounded_reader,
            args=(process.stdout, stdout),
            daemon=True,
        ),
        threading.Thread(
            target=_bounded_reader,
            args=(process.stderr, stderr),
            daemon=True,
        ),
    ]
    for thread in threads:
        thread.start()
    returncode = process.wait()
    for thread in threads:
        thread.join()
    return _ToolResult(returncode, bytes(stdout), bytes(stderr))


def _source_descriptor(source: BinaryIO) -> int | None:
    try:
        descriptor = source.fileno()
        os.fstat(descriptor)
    except (AttributeError, OSError):
        return None
    descriptor_path = Path(f"/dev/fd/{descriptor}")
    return descriptor if descriptor_path.exists() else None


def _run_seekable_source(
    command_before_input: list[str],
    source: BinaryIO,
) -> _ToolResult:
    descriptor = _source_descriptor(source)
    if descriptor is None:
        return _run_piped_source(
            [*command_before_input, "pipe:0"],
            source,
        )
    try:
        completed = subprocess.run(
            [*command_before_input, f"/dev/fd/{descriptor}"],
            capture_output=True,
            check=False,
            pass_fds=(descriptor,),
        )
    except FileNotFoundError as exc:
        raise MediaToolUnavailableError(command_before_input[0]) from exc
    return _ToolResult(
        completed.returncode,
        completed.stdout[:MAX_TOOL_OUTPUT_BYTES],
        completed.stderr[:MAX_TOOL_OUTPUT_BYTES],
    )


class MediaValidator:
    def validate(self, source: BinaryIO, max_bytes: int) -> MediaMetadata:
        if max_bytes <= 0:
            raise ValueError("max_bytes must be positive")
        try:
            source.seek(0, os.SEEK_END)
            size_bytes = source.tell()
            _rewind(source)
            if size_bytes == 0:
                raise EmptyMediaError("media is empty")
            if size_bytes > max_bytes:
                raise MediaTooLargeError("media exceeds configured size limit")
            head = source.read(16)
            _rewind(source)
            if len(head) >= 12 and head[4:8] == b"ftyp":
                signature_type = "video/mp4"
            elif head.startswith(b"\x1aE\xdf\xa3"):
                signature_type = "video/webm"
            else:
                raise UnsupportedMediaError("unsupported media container")
            for command in ("ffprobe", "ffmpeg"):
                if shutil.which(command) is None:
                    raise MediaToolUnavailableError(command)

            probe = _run_seekable_source(
                [
                    "ffprobe",
                    "-v",
                    "error",
                    "-show_entries",
                    "format=format_name,duration:stream=codec_type",
                    "-of",
                    "json",
                ],
                source,
            )
            _rewind(source)
            if probe.returncode != 0:
                raise UnsupportedMediaError("corrupt media container")
            try:
                payload = json.loads(probe.stdout)
                format_value = payload["format"]
                format_names = set(
                    str(format_value["format_name"]).split(",")
                )
                streams = payload.get("streams") or []
                duration_ms = round(float(format_value["duration"]) * 1000)
            except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
                raise UnsupportedMediaError("invalid media metadata") from exc
            if signature_type == "video/mp4":
                if not format_names.intersection({"mov", "mp4"}):
                    raise UnsupportedMediaError("container is not MP4")
            elif "webm" not in format_names:
                raise UnsupportedMediaError("container is not WebM")
            if not any(stream.get("codec_type") == "video" for stream in streams):
                raise UnsupportedMediaError("media has no video stream")
            audio_stream_count = sum(
                stream.get("codec_type") == "audio" for stream in streams
            )
            if audio_stream_count == 0:
                raise NoAudioTrackError("media has no audio track")
            if duration_ms <= 0:
                raise EmptyMediaError("media has no duration")

            _rewind(source)
            decoded = self._decode_check(source)
            if decoded.returncode != 0:
                raise UnsupportedMediaError("media is not decodable")
            return MediaMetadata(
                media_type=signature_type,
                size_bytes=size_bytes,
                duration_ms=duration_ms,
                audio_stream_count=audio_stream_count,
            )
        finally:
            _rewind(source)

    @staticmethod
    def _decode_check(source: BinaryIO) -> _ToolResult:
        descriptor = _source_descriptor(source)
        input_name = (
            f"/dev/fd/{descriptor}" if descriptor is not None else "pipe:0"
        )
        command = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-xerror",
            "-i",
            input_name,
            "-map",
            "0:v:0",
            "-map",
            "0:a:0",
            "-f",
            "null",
            "-",
        ]
        if descriptor is None:
            return _run_piped_source(command, source)
        try:
            completed = subprocess.run(
                command,
                capture_output=True,
                check=False,
                pass_fds=(descriptor,),
            )
        except FileNotFoundError as exc:
            raise MediaToolUnavailableError("ffmpeg") from exc
        return _ToolResult(
            completed.returncode,
            completed.stdout[:MAX_TOOL_OUTPUT_BYTES],
            completed.stderr[:MAX_TOOL_OUTPUT_BYTES],
        )


class _DecodeFailure(RuntimeError):
    def __init__(self, message: str, *, emitted_audio: bool) -> None:
        super().__init__(message)
        self.emitted_audio = emitted_audio


def _wav_bytes(pcm: bytes) -> bytes:
    output = BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setnchannels(CHANNEL_COUNT)
        wav.setsampwidth(SAMPLE_WIDTH_BYTES)
        wav.setframerate(SAMPLE_RATE)
        wav.writeframes(pcm)
    value = output.getvalue()
    if len(value) >= PROVIDER_LIMIT_BYTES:
        raise RuntimeError("audio chunk exceeds provider limit")
    return value


class MediaPipeline:
    def __init__(
        self,
        video_service: _VideoService,
        *,
        on_seek_fallback: Callable[[Path], None] | None = None,
    ) -> None:
        self.video_service = video_service
        self.on_seek_fallback = on_seek_fallback

    def iter_audio_chunks(self, video: object) -> Iterator[AudioChunk]:
        if shutil.which("ffmpeg") is None:
            raise MediaToolUnavailableError("ffmpeg")
        try:
            yield from self._decode(video, input_name="pipe:0", feed_video=True)
            return
        except _DecodeFailure as exc:
            if (
                getattr(video, "media_type", None) != "video/mp4"
                or exc.emitted_audio
            ):
                raise NoAudioTrackError("video has no readable audio") from exc
        yield from self._decode_seekable_mp4(video)

    def _decode_seekable_mp4(self, video: object) -> Iterator[AudioChunk]:
        storage_dir = Path(
            getattr(self.video_service.settings, "storage_dir", "")
        ).resolve()
        with tempfile.TemporaryDirectory(prefix="senda-media-") as temporary:
            directory = Path(temporary)
            os.chmod(directory, 0o700)
            path = directory / "input.mp4"
            descriptor = os.open(
                path,
                os.O_WRONLY | os.O_CREAT | os.O_EXCL,
                0o600,
            )
            try:
                with os.fdopen(descriptor, "wb") as target:
                    for block in self.video_service.iter_plain_chunks(video):
                        target.write(block)
                os.chmod(path, 0o600)
                if storage_dir == directory or storage_dir in directory.parents:
                    raise RuntimeError(
                        "plaintext fallback cannot use application storage"
                    )
                if self.on_seek_fallback is not None:
                    self.on_seek_fallback(path)
                try:
                    yield from self._decode(
                        video,
                        input_name=str(path),
                        feed_video=False,
                    )
                except _DecodeFailure as exc:
                    raise NoAudioTrackError(
                        "video has no readable audio"
                    ) from exc
            finally:
                path.unlink(missing_ok=True)

    def _decode(
        self,
        video: object,
        *,
        input_name: str,
        feed_video: bool,
    ) -> Iterator[AudioChunk]:
        command = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            input_name,
            "-vn",
            "-ac",
            str(CHANNEL_COUNT),
            "-ar",
            str(SAMPLE_RATE),
            "-f",
            "s16le",
            "pipe:1",
        ]
        try:
            process = subprocess.Popen(
                command,
                stdin=subprocess.PIPE if feed_video else subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
        except FileNotFoundError as exc:
            raise MediaToolUnavailableError("ffmpeg") from exc
        assert process.stdout is not None
        assert process.stderr is not None
        stderr = bytearray()
        stderr_thread = threading.Thread(
            target=_bounded_reader,
            args=(process.stderr, stderr),
            daemon=True,
        )
        stderr_thread.start()
        feeder_thread: threading.Thread | None = None
        if feed_video:
            assert process.stdin is not None

            def feed() -> None:
                try:
                    for block in self.video_service.iter_plain_chunks(video):
                        process.stdin.write(block)
                except BrokenPipeError:
                    pass
                finally:
                    process.stdin.close()

            feeder_thread = threading.Thread(target=feed, daemon=True)
            feeder_thread.start()

        emitted_audio = False
        start_ms = 0
        index = 0
        try:
            while pcm := process.stdout.read(PCM_CHUNK_BYTES):
                if len(pcm) % SAMPLE_WIDTH_BYTES:
                    pcm = pcm[: -(len(pcm) % SAMPLE_WIDTH_BYTES)]
                if not pcm:
                    continue
                duration_ms = round(
                    len(pcm)
                    / (SAMPLE_RATE * SAMPLE_WIDTH_BYTES * CHANNEL_COUNT)
                    * 1000
                )
                emitted_audio = True
                yield AudioChunk(
                    index=index,
                    start_ms=start_ms,
                    end_ms=start_ms + duration_ms,
                    wav_bytes=_wav_bytes(pcm),
                )
                index += 1
                start_ms += duration_ms
            returncode = process.wait()
            if feeder_thread is not None:
                feeder_thread.join()
            stderr_thread.join()
            if returncode != 0 or not emitted_audio:
                raise _DecodeFailure(
                    bytes(stderr).decode("utf-8", errors="replace"),
                    emitted_audio=emitted_audio,
                )
        finally:
            if process.poll() is None:
                process.terminate()
                process.wait()
            if feeder_thread is not None and feeder_thread.is_alive():
                feeder_thread.join()
            if stderr_thread.is_alive():
                stderr_thread.join()
