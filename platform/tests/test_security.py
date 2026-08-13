"""Pruebas de seguridad de platform/ (paso 1: infraestructura).

Baseline: verifica comportamientos que la auditoría da por controlados
(escritura atómica) y que el paquete importa sin dependencias externas.
Las pruebas de los pasos siguientes se añaden aquí por directorio.
"""

import json
from pathlib import Path

import pytest

import phonefarm.platform_data as pd


@pytest.fixture
def tmp_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Aísla DATA_DIR en un directorio temporal."""
    monkeypatch.setattr(pd, "DATA_DIR", tmp_path)
    monkeypatch.setattr(pd, "ACCOUNTS_FILE", tmp_path / "accounts.json")
    monkeypatch.setattr(pd, "PROXIES_FILE", tmp_path / "proxies.json")
    monkeypatch.setattr(pd, "QUEUE_FILE", tmp_path / "queue.json")
    return tmp_path


def test_package_importable():
    import phonefarm.platform_data  # noqa: F401
    assert True


def test_atomic_write_no_deja_tmp(tmp_data_dir: Path):
    """Escritura atómica: tras save no queda fichero .tmp y el JSON es válido."""
    pd.save_accounts([{"id": "acc_1", "username": "u1"}])
    assert not list(tmp_data_dir.glob("*.tmp"))
    data = json.loads((tmp_data_dir / "accounts.json").read_text(encoding="utf-8"))
    assert data == [{"id": "acc_1", "username": "u1"}]


def test_load_vacio_devuelve_lista(tmp_data_dir: Path):
    assert pd.load_proxies() == []
    assert pd.load_queue() == []
