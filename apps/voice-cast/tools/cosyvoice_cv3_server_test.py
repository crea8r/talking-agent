from __future__ import annotations

import importlib.util
import pathlib
import unittest


MODULE_PATH = pathlib.Path(__file__).with_name("cosyvoice_cv3_server.py")
SPEC = importlib.util.spec_from_file_location("cosyvoice_cv3_server", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class CosyVoiceCv3ServerTest(unittest.TestCase):
    def test_normalize_instruct_text_adds_prefix_and_end_token(self):
        self.assertEqual(
            MODULE.normalize_instruct_text("Speak warmly and clearly."),
            "You are a helpful assistant. Speak warmly and clearly.<|endofprompt|>",
        )

    def test_normalize_instruct_text_keeps_existing_end_token(self):
        self.assertEqual(
            MODULE.normalize_instruct_text("Already complete<|endofprompt|>"),
            "Already complete<|endofprompt|>",
        )

    def test_normalize_prompt_transcript_adds_prefix_and_end_token(self):
        self.assertEqual(
            MODULE.normalize_prompt_transcript("I found it."),
            "You are a helpful assistant.<|endofprompt|>I found it.",
        )

    def test_normalize_prompt_transcript_keeps_existing_end_token(self):
        self.assertEqual(
            MODULE.normalize_prompt_transcript("Prefix<|endofprompt|>I found it."),
            "Prefix<|endofprompt|>I found it.",
        )

    def test_normalize_bool(self):
        self.assertTrue(MODULE.normalize_bool("true"))
        self.assertTrue(MODULE.normalize_bool(True))
        self.assertFalse(MODULE.normalize_bool("false"))


if __name__ == "__main__":
    unittest.main()
