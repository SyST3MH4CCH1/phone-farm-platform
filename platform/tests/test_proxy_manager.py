"""Pruebas para proxy_manager — verify_proxy cacheo ipify."""

import threading
import time
from unittest.mock import patch


def test_verify_proxy_cache_300s_ttl(monkeypatch):
    """10 llamadas rápidas del mismo proxy = 1 llamada real a ipify."""
    from phonefarm import proxy_manager

    # Aislar el cache de otros tests
    proxy_manager._verify_cache.clear()

    # Stub find_proxy para que devuelva un proxy fake
    fake_proxy = {
        "id": "proxy_test",
        "host": "gw.dataimpulse.com",
        "port": 10001,
        "user": "testuser",
        "pass": "testpass",
    }
    monkeypatch.setattr(proxy_manager, "find_proxy", lambda pid: fake_proxy if pid == "proxy_test" else None)

    call_count = 0

    def fake_get(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        class Resp:
            ok = True
            def json(self):
                return {"ip": "1.2.3.4"}
        return Resp()

    with patch("phonefarm.proxy_manager.requests.get", side_effect=fake_get):
        for _ in range(10):
            proxy_manager.verify_proxy("proxy_test")

    assert call_count == 1, f"Expected 1 real call, got {call_count}"


def test_verify_proxy_cache_miss_different_proxy(monkeypatch):
    """Diferentes proxies = verificaciones independientes."""
    from phonefarm import proxy_manager

    proxy_manager._verify_cache.clear()

    fake_proxies = {
        "proxy_a": {"id": "proxy_a", "host": "gw.dataimpulse.com", "port": 10001, "user": "a", "pass": "a"},
        "proxy_b": {"id": "proxy_b", "host": "gw.dataimpulse.com", "port": 10002, "user": "b", "pass": "b"},
    }
    monkeypatch.setattr(proxy_manager, "find_proxy", lambda pid: fake_proxies.get(pid))

    call_count = 0

    def fake_get(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        class Resp:
            ok = True
            def json(self):
                return {"ip": "5.6.7.8"}
        return Resp()

    with patch("phonefarm.proxy_manager.requests.get", side_effect=fake_get):
        proxy_manager.verify_proxy("proxy_a")
        proxy_manager.verify_proxy("proxy_b")

    assert call_count == 2, f"Expected 2 calls for 2 different proxies, got {call_count}"


def test_verify_proxy_cache_invalidated_on_credential_change(monkeypatch):
    """Credenciales cambiadas = cache bypassed (clave distinta)."""
    from phonefarm import proxy_manager

    proxy_manager._verify_cache.clear()

    call_count = 0

    def fake_get(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        class Resp:
            ok = True
            def json(self):
                return {"ip": "9.9.9.9"}
        return Resp()

    fake_proxy_a = {"id": "proxy_x", "host": "gw.dataimpulse.com", "port": 10001, "user": "user_a", "pass": "pass_a"}
    fake_proxy_b = {"id": "proxy_x", "host": "gw.dataimpulse.com", "port": 10002, "user": "user_b", "pass": "pass_b"}

    lookups = [fake_proxy_a, fake_proxy_b]
    lookup_idx = [0]

    def fake_find(pid):
        return lookups[lookup_idx[0]]

    monkeypatch.setattr(proxy_manager, "find_proxy", fake_find)

    with patch("phonefarm.proxy_manager.requests.get", side_effect=fake_get):
        r1 = proxy_manager.verify_proxy("proxy_x")
        assert r1["ip"] == "9.9.9.9"
        assert call_count == 1

        # Simular que las credenciales cambiaron entre llamadas
        lookup_idx[0] = 1
        r2 = proxy_manager.verify_proxy("proxy_x")
        assert r2["ip"] == "9.9.9.9"

    # 2 llamadas reales: la clave de cache incluye host:port:user
    assert call_count == 2, f"Expected 2 calls after credential change, got {call_count}"


def test_verify_proxy_concurrent_same_proxy(monkeypatch):
    """Llamadas concurrentes del mismo proxy = exactamente 1 llamada real."""
    from phonefarm import proxy_manager

    proxy_manager._verify_cache.clear()

    call_count = 0
    call_count_lock = threading.Lock()

    def fake_get(*args, **kwargs):
        nonlocal call_count
        # Simular latencia de red
        time.sleep(0.1)
        with call_count_lock:
            call_count += 1
        class Resp:
            ok = True
            def json(self):
                return {"ip": "1.2.3.4"}
        return Resp()

    fake_proxy = {"id": "proxy_concurrent", "host": "gw.dataimpulse.com", "port": 10001, "user": "u", "pass": "p"}
    monkeypatch.setattr(proxy_manager, "find_proxy", lambda pid: fake_proxy if pid == "proxy_concurrent" else None)

    threads = []
    with patch("phonefarm.proxy_manager.requests.get", side_effect=fake_get):
        for _ in range(5):
            t = threading.Thread(target=proxy_manager.verify_proxy, args=("proxy_concurrent",))
            threads.append(t)
            t.start()
        for t in threads:
            t.join()

    assert call_count == 1, f"Expected 1 real call from concurrent threads, got {call_count}"
