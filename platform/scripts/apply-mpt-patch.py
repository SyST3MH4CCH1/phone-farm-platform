#!/usr/bin/env python
"""apply-mpt-patch — aplica (o verifica) el parche de endurecimiento de
MoneyPrinterTurbo sobre el checkout de platform/third_party.

Uso:
  python scripts/apply-mpt-patch.py            # aplica si falta (idempotente)
  python scripts/apply-mpt-patch.py --check    # solo verifica estado
  python scripts/apply-mpt-patch.py --revert   # deshace el parche

Requisitos: checkout fijado al commit de docs/THIRD-PARTY-LOCK.md
(MoneyPrinterTurbo 1.3.3 @ 254cd02). Si el checkout diverge, `git apply`
falla y se reporta — no se fuerza nunca.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent / "third_party" / "MoneyPrinterTurbo"
PATCH = Path(__file__).resolve().parent.parent / "patches" / "mpt-verify-token.patch"
EXPECTED_COMMIT = "254cd02"  # ver docs/THIRD-PARTY-LOCK.md


def _git(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], cwd=str(REPO), capture_output=True, text=True, check=check)


def main() -> int:
    if not REPO.is_dir():
        print(f"[ERROR] checkout MPT no encontrado: {REPO}")
        return 2
    head = _git("rev-parse", "--short", "HEAD").stdout.strip()
    if not head.startswith(EXPECTED_COMMIT):
        print(f"[ERROR] checkout MPT en {head}, esperado {EXPECTED_COMMIT} (docs/THIRD-PARTY-LOCK.md)")
        return 2

    applied = _git("apply", "--reverse", "--check", str(PATCH), check=False).returncode == 0

    if "--check" in sys.argv:
        print("PATCH APLICADO" if applied else "PATCH NO APLICADO")
        return 0 if applied else 1
    if "--revert" in sys.argv:
        if not applied:
            print("no hay parche que revertir")
            return 0
        _git("apply", "--reverse", str(PATCH))
        print("parche revertido")
        return 0
    if applied:
        print("parche ya aplicado (idempotente)")
        return 0
    _git("apply", str(PATCH))
    print("parche aplicado sobre MPT", head)
    return 0


if __name__ == "__main__":
    sys.exit(main())
