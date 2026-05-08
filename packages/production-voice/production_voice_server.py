from __future__ import annotations

import argparse
import os
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import Response
from pydantic import BaseModel, Field
import uvicorn


PACKAGE_DIR = Path(__file__).resolve().parent
REPO_ROOT = PACKAGE_DIR.parent.parent


def resolve_vendor_root() -> Path:
    explicit_root = os.environ.get("PRODUCTION_VOICE_VENDOR_ROOT", "").strip()
    if explicit_root:
        return Path(explicit_root).expanduser().resolve()

    default_candidates = [
        PACKAGE_DIR / "vendor",
        REPO_ROOT / "apps" / "voice-cast" / "vendor",
    ]

    for candidate in default_candidates:
        if candidate.exists():
            return candidate

    return default_candidates[0]


VENDOR_ROOT = resolve_vendor_root()
MELO_DIR = VENDOR_ROOT / "MeloTTS"
OPENVOICE_DIR = VENDOR_ROOT / "OpenVoice"
CHECKPOINTS_DIR = OPENVOICE_DIR / "checkpoints_v2"
DEFAULT_PROCESSED_DIR = REPO_ROOT / "output" / "production-voice" / "processed"
LOCAL_CACHE_DIR = PACKAGE_DIR / ".cache"
NLTK_DATA_DIR = LOCAL_CACHE_DIR / "nltk_data"

LOCAL_CACHE_DIR.mkdir(parents=True, exist_ok=True)
os.environ.setdefault("HF_HOME", str(LOCAL_CACHE_DIR / "hf"))
os.environ.setdefault("XDG_CACHE_HOME", str(LOCAL_CACHE_DIR))
os.environ.setdefault("NLTK_DATA", str(NLTK_DATA_DIR))

sys.path.append(str(MELO_DIR))
sys.path.append(str(OPENVOICE_DIR))


class GenerateRequest(BaseModel):
    replyText: str = Field(min_length=1)
    meloBaseSpeakerId: str = Field(min_length=1)
    referenceWavPath: str = Field(min_length=1)


def create_app(runtime):
    app = FastAPI()

    @app.get("/healthz")
    async def healthz():
        return {"ok": True, "app": "production-voice"}

    @app.get("/speakers")
    async def speakers():
        return {"speakers": runtime.list_english_speakers()}

    @app.post("/generate")
    async def generate(payload: GenerateRequest):
        audio_bytes = runtime.generate_reply(
            payload.replyText,
            payload.meloBaseSpeakerId,
            payload.referenceWavPath,
        )
        return Response(audio_bytes, media_type="audio/wav")

    return app


@dataclass
class CachedSpeakerEmbedding:
    path: str
    mtime_ns: int
    embedding: object


class ProductionVoiceRuntime:
    def __init__(self, *, device: str, checkpoints_dir: Path, processed_dir: Path):
        import nltk
        import torch
        from melo.api import TTS
        from openvoice.api import ToneColorConverter

        NLTK_DATA_DIR.mkdir(parents=True, exist_ok=True)
        for resource_path, resource_name in [
            ("taggers/averaged_perceptron_tagger_eng", "averaged_perceptron_tagger_eng"),
            ("corpora/cmudict", "cmudict"),
        ]:
            try:
                nltk.data.find(resource_path)
            except LookupError:
                nltk.download(resource_name, download_dir=str(NLTK_DATA_DIR))

        self.torch = torch
        self.device = device
        self.checkpoints_dir = checkpoints_dir
        self.processed_dir = processed_dir
        self.processed_dir.mkdir(parents=True, exist_ok=True)

        self.tts = TTS(language="EN", device=device)
        self.speaker_ids = dict(self.tts.hps.data.spk2id)

        converter_dir = checkpoints_dir / "converter"
        self.tone_color_converter = ToneColorConverter(
            f"{converter_dir}/config.json",
            device=device,
        )
        self.tone_color_converter.load_ckpt(f"{converter_dir}/checkpoint.pth")
        self.tone_color_converter.watermark_model = None

        self.source_embeddings = {}
        self.target_embedding_cache: dict[str, CachedSpeakerEmbedding] = {}

        for speaker_key in self.speaker_ids.keys():
            embedding_name = speaker_key.lower().replace("_", "-")
            embedding_path = checkpoints_dir / "base_speakers" / "ses" / f"{embedding_name}.pth"
            if embedding_path.exists():
                self.source_embeddings[speaker_key] = self.torch.load(
                    str(embedding_path),
                    map_location=device,
                )

    def list_english_speakers(self):
        return [speaker for speaker in self.speaker_ids.keys() if speaker in self.source_embeddings]

    def _get_target_embedding(self, reference_wav_path: str):
        stat = os.stat(reference_wav_path)
        cached = self.target_embedding_cache.get(reference_wav_path)
        if cached and cached.mtime_ns == stat.st_mtime_ns:
            return cached.embedding

        embedding = self.tone_color_converter.extract_se(reference_wav_path)
        self.target_embedding_cache[reference_wav_path] = CachedSpeakerEmbedding(
            path=reference_wav_path,
            mtime_ns=stat.st_mtime_ns,
            embedding=embedding,
        )
        return embedding

    def generate_reply(self, reply_text: str, speaker_id: str, reference_wav_path: str):
        if speaker_id not in self.speaker_ids:
            raise ValueError(f"Unknown speaker: {speaker_id}")
        if speaker_id not in self.source_embeddings:
            raise ValueError(f"Missing source embedding for speaker: {speaker_id}")
        if not os.path.isfile(reference_wav_path):
            raise FileNotFoundError(reference_wav_path)

        target_embedding = self._get_target_embedding(reference_wav_path)
        source_embedding = self.source_embeddings[speaker_id]

        with tempfile.TemporaryDirectory(dir=self.processed_dir) as temp_dir:
            src_path = os.path.join(temp_dir, "source.wav")
            out_path = os.path.join(temp_dir, "converted.wav")

            self.tts.tts_to_file(
                reply_text,
                self.speaker_ids[speaker_id],
                src_path,
                speed=1.0,
                quiet=True,
            )
            self.tone_color_converter.convert(
                audio_src_path=src_path,
                src_se=source_embedding,
                tgt_se=target_embedding,
                output_path=out_path,
                message="@VoiceCast",
            )

            with open(out_path, "rb") as handle:
                return handle.read()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=50003)
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--checkpoints-dir", default=str(CHECKPOINTS_DIR))
    parser.add_argument("--processed-dir", default=str(DEFAULT_PROCESSED_DIR))
    args = parser.parse_args()

    runtime = ProductionVoiceRuntime(
        device=args.device,
        checkpoints_dir=Path(args.checkpoints_dir),
        processed_dir=Path(args.processed_dir),
    )
    app = create_app(runtime)
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
