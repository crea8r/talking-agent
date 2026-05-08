from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


MODULE_PATH = (
    Path(__file__).resolve().parents[3]
    / "packages"
    / "production-voice"
    / "production_voice_server.py"
)


def _load_package_module():
    spec = importlib.util.spec_from_file_location(
        "talking_agent_production_voice_server",
        MODULE_PATH,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load production voice server module from {MODULE_PATH}")

    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


_MODULE = _load_package_module()

create_app = _MODULE.create_app
ProductionVoiceRuntime = _MODULE.ProductionVoiceRuntime
main = _MODULE.main


if __name__ == "__main__":
    main()
