import unittest
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

module_path = Path(__file__).with_name("cosyvoice_text_only_server.py")
spec = spec_from_file_location("cosyvoice_text_only_server", module_path)
module = module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)

END_OF_PROMPT = module.END_OF_PROMPT
normalize_voice_direction = module.normalize_voice_direction


class NormalizeVoiceDirectionTest(unittest.TestCase):
    def test_appends_end_of_prompt_when_missing(self):
        self.assertEqual(
            normalize_voice_direction("Speak warmly and clearly."),
            f"Speak warmly and clearly.{END_OF_PROMPT}",
        )

    def test_does_not_duplicate_end_of_prompt(self):
        self.assertEqual(
            normalize_voice_direction(f"Speak warmly and clearly.{END_OF_PROMPT}"),
            f"Speak warmly and clearly.{END_OF_PROMPT}",
        )

    def test_keeps_empty_text_empty(self):
        self.assertEqual(normalize_voice_direction("   "), "")


if __name__ == "__main__":
    unittest.main()
