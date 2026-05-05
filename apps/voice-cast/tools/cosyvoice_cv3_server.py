from __future__ import annotations

import argparse
import base64
import io
import os
import sys
import tempfile
import time
import wave
from pathlib import Path

import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
import uvicorn


ROOT_DIR = Path(__file__).resolve().parents[1]
COSYVOICE_DIR = ROOT_DIR / "vendor" / "CosyVoice"
sys.path.append(str(COSYVOICE_DIR))
sys.path.append(str(COSYVOICE_DIR / "third_party" / "Matcha-TTS"))

from cosyvoice.cli.cosyvoice import AutoModel  # noqa: E402


DEFAULT_MODEL_DIR = COSYVOICE_DIR / "pretrained_models" / "Fun-CosyVoice3-0.5B"
DEFAULT_ASSISTANT_PROMPT = "You are a helpful assistant."
END_OF_PROMPT = "<|endofprompt|>"


def normalize_bool(value: str | bool) -> bool:
    return f"{value}".strip().lower() == "true"


def normalize_instruct_text(text: str) -> str:
    normalized = text.strip()
    if not normalized:
        return ""
    if END_OF_PROMPT in normalized:
        return normalized
    return f"{DEFAULT_ASSISTANT_PROMPT} {normalized}{END_OF_PROMPT}"


def normalize_prompt_transcript(text: str) -> str:
    normalized = text.strip()
    if not normalized:
        return ""
    if END_OF_PROMPT in normalized:
        return normalized
    return f"{DEFAULT_ASSISTANT_PROMPT}{END_OF_PROMPT}{normalized}"


def render_wav_bytes(sample_rate: int, speech_chunks: list[np.ndarray]) -> bytes:
    pcm = np.concatenate(speech_chunks) if speech_chunks else np.zeros(1, dtype=np.float32)
    pcm = np.clip(pcm, -1.0, 1.0)
    pcm16 = (pcm * 32767.0).astype(np.int16)

    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm16.tobytes())
    return buffer.getvalue()


async def persist_prompt_wav(upload: UploadFile) -> str:
    suffix = Path(upload.filename or "prompt.wav").suffix or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as handle:
        handle.write(await upload.read())
        return handle.name


def create_app(cosyvoice):
    app = FastAPI()

    @app.get("/healthz")
    async def healthz():
        return {"ok": True, "app": "cosyvoice-cv3"}

    @app.post("/generate")
    async def generate(
        model: str = Form(default="Fun-CosyVoice3-0.5B"),
        mode: str = Form(default="instruct2"),
        productionText: str = Form(default=""),
        instructText: str = Form(default=""),
        promptTranscript: str = Form(default=""),
        stream: str = Form(default="true"),
        speed: str = Form(default="1.0"),
        promptWav: UploadFile = File(...),
    ):
        mode = mode.strip()
        spoken_text = productionText.strip()
        if not spoken_text:
            raise HTTPException(status_code=400, detail="Production text is required.")
        if mode not in {"instruct2", "zero_shot"}:
            raise HTTPException(status_code=400, detail="Mode must be instruct2 or zero_shot.")

        try:
            speed_value = float(speed)
        except ValueError as error:
            raise HTTPException(status_code=400, detail="Speed must be a number.") from error

        prompt_wav_path = await persist_prompt_wav(promptWav)
        started_at = time.perf_counter()

        try:
            if mode == "instruct2":
                raw_instruct = instructText.strip()
                if not raw_instruct:
                    raise HTTPException(status_code=400, detail="Instruct text is required for instruct2 mode.")
                effective_instruct = normalize_instruct_text(raw_instruct)
                inference = cosyvoice.inference_instruct2(
                    spoken_text,
                    effective_instruct,
                    prompt_wav_path,
                    stream=normalize_bool(stream),
                    speed=speed_value,
                )
                meta = {
                    "mode": mode,
                    "model": model,
                    "sampleRate": cosyvoice.sample_rate,
                    "spokenText": spoken_text,
                    "voiceDirection": raw_instruct,
                    "effectiveInstructText": effective_instruct,
                    "promptWavName": promptWav.filename or "prompt.wav",
                }
            else:
                raw_prompt_transcript = promptTranscript.strip()
                if not raw_prompt_transcript:
                    raise HTTPException(status_code=400, detail="Prompt transcript is required for zero_shot mode.")
                effective_prompt_transcript = normalize_prompt_transcript(raw_prompt_transcript)
                inference = cosyvoice.inference_zero_shot(
                    spoken_text,
                    effective_prompt_transcript,
                    prompt_wav_path,
                    stream=normalize_bool(stream),
                    speed=speed_value,
                )
                meta = {
                    "mode": mode,
                    "model": model,
                    "sampleRate": cosyvoice.sample_rate,
                    "spokenText": spoken_text,
                    "promptTranscript": raw_prompt_transcript,
                    "effectivePromptTranscript": effective_prompt_transcript,
                    "promptWavName": promptWav.filename or "prompt.wav",
                }

            speech_chunks = []
            duration_ms = 0
            for item in inference:
                speech = item["tts_speech"].cpu().numpy().reshape(-1)
                speech_chunks.append(speech)
                duration_ms += int(round((speech.shape[0] / cosyvoice.sample_rate) * 1000))

            wav_bytes = render_wav_bytes(cosyvoice.sample_rate, speech_chunks)
            synthesis_ms = int(round((time.perf_counter() - started_at) * 1000))

            return {
                "audioBase64": base64.b64encode(wav_bytes).decode("ascii"),
                "mimeType": "audio/wav",
                "timing": {
                    "durationMs": duration_ms,
                    "synthesisMs": synthesis_ms,
                },
                "meta": meta,
            }
        finally:
            try:
                os.unlink(prompt_wav_path)
            except FileNotFoundError:
                pass

    return app


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=50002)
    parser.add_argument("--model-dir", default=str(DEFAULT_MODEL_DIR))
    args = parser.parse_args()

    cosyvoice = AutoModel(model_dir=args.model_dir)
    app = create_app(cosyvoice)
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
