from __future__ import annotations

import unittest

from fastapi.testclient import TestClient

from production_voice_server import create_app


class FakeRuntime:
    def __init__(self):
        self.calls = []

    def list_english_speakers(self):
        return ["EN-Default", "EN-US", "EN-BR"]

    def generate_reply(self, reply_text, speaker_id, reference_wav_path):
        self.calls.append(
            {
                "reply_text": reply_text,
                "speaker_id": speaker_id,
                "reference_wav_path": reference_wav_path,
            }
        )
        return b"RIFF"


class ProductionVoiceServerTest(unittest.TestCase):
    def test_speakers_route_returns_english_speakers(self):
        runtime = FakeRuntime()
        client = TestClient(create_app(runtime))

        response = client.get("/speakers")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["speakers"], ["EN-Default", "EN-US", "EN-BR"])

    def test_generate_route_requires_text_speaker_and_reference_path(self):
        runtime = FakeRuntime()
        client = TestClient(create_app(runtime))

        response = client.post("/generate", json={})

        self.assertEqual(response.status_code, 422)

    def test_generate_route_returns_wav_bytes_from_runtime(self):
        runtime = FakeRuntime()
        client = TestClient(create_app(runtime))

        response = client.post(
            "/generate",
            json={
                "replyText": "All set.",
                "meloBaseSpeakerId": "EN-US",
                "referenceWavPath": "/tmp/reference.wav",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b"RIFF")
        self.assertEqual(response.headers["content-type"], "audio/wav")
        self.assertEqual(runtime.calls[0]["speaker_id"], "EN-US")


if __name__ == "__main__":
    unittest.main()
