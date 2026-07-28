from __future__ import annotations

from pathlib import Path
import subprocess

import pytest


ROOT = Path(__file__).resolve().parents[3]


@pytest.mark.parametrize(
    "relative_path",
    [
        "scripts/bootstrap-local.sh",
        "scripts/generate-contracts.sh",
        "scripts/run-e2e-backend.sh",
    ],
)
def test_shell_automation_has_valid_syntax(relative_path: str):
    script = ROOT / relative_path

    checked = subprocess.run(
        ["bash", "-n", str(script)],
        capture_output=True,
        text=True,
        check=False,
    )

    assert script.exists()
    assert checked.returncode == 0, checked.stderr


def test_local_delivery_documentation_and_make_targets_exist():
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    makefile = (ROOT / "Makefile").read_text(encoding="utf-8")

    assert "./scripts/bootstrap-local.sh" in readme
    assert "REAL_DATA_ENABLED=false" in readme
    assert "verify:" in makefile
    assert "contracts-check:" in makefile
