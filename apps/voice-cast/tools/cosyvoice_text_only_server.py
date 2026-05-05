from __future__ import annotations

import argparse
import base64
import io
import sys
import time
import wave
from pathlib import Path

import numpy as np
from fastapi import FastAPI
from pydantic import BaseModel, Field
import uvicorn


ROOT_DIR = Path(__file__).resolve().parents[1]
COSYVOICE_DIR = ROOT_DIR / "vendor" / "CosyVoice"
sys.path.append(str(COSYVOICE_DIR))
sys.path.append(str(COSYVOICE_DIR / "third_party" / "Matcha-TTS"))

from cosyvoice.cli.cosyvoice import AutoModel  # noqa: E402


DEFAULT_MODEL_DIR = COSYVOICE_DIR / "pretrained_models" / "CosyVoice-300M-Instruct"
END_OF_PROMPT = "<|endofprompt|>"


class GenerateRequest(BaseModel):
    model: str = Field(default="CosyVoice-300M-Instruct")
    presetSpeaker: str
    speed: float = Field(default=1.0, ge=0.5, le=2.0)
    characterPrompt: str = ""
    instructText: str = ""
    promptText: str


def normalize_voice_direction(text: str) -> str:
    normalized = text.strip()
    if not normalized:
        return ""
    if normalized.endswith(END_OF_PROMPT):
        return normalized
    return f"{normalized}{END_OF_PROMPT}"


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


def create_app(cosyvoice):
    app = FastAPI()

    @app.get("/healthz")
    async def healthz():
        return {"ok": True, "app": "cosyvoice-text-only"}

    @app.get("/speakers")
    async def speakers():
        return {"speakers": cosyvoice.list_available_spks()}

    @app.post("/generate")
    async def generate(payload: GenerateRequest):
        raw_voice_direction = payload.instructText.strip() or payload.characterPrompt.strip()
        effective_instruct = normalize_voice_direction(raw_voice_direction)
        started_at = time.perf_counter()

        if effective_instruct:
            inference = cosyvoice.inference_instruct(
                payload.promptText,
                payload.presetSpeaker,
                effective_instruct,
                speed=payload.speed,
                stream=False,
            )
            mode = "instruct"
        else:
            inference = cosyvoice.inference_sft(
                payload.promptText,
                payload.presetSpeaker,
                speed=payload.speed,
                stream=False,
            )
            mode = "sft"

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
            "meta": {
                "mode": mode,
                "model": payload.model,
                "presetSpeaker": payload.presetSpeaker,
                "sampleRate": cosyvoice.sample_rate,
                "spokenText": payload.promptText,
                "voiceDirection": raw_voice_direction,
            },
        }

    return app


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=50001)
    parser.add_argument("--model-dir", default=str(DEFAULT_MODEL_DIR))
    args = parser.parse_args()

    cosyvoice = AutoModel(model_dir=args.model_dir)
    app = create_app(cosyvoice)
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
