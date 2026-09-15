# platform/data/ — Docker-only seeds (OBSOLETE)

**Do not edit files here expecting native effects.**

## What this directory is

Contains JSON seed files from the Docker deployment run on **2026-08-03**:
`accounts.json`, `proxies.json`, `queue.json`, `content_profiles.json`,
`sessions/`, `logs/`, `videos/`, `master.key`. Volume-mounted into the Docker container at `/app/data`.

## What this directory is NOT

It is **not** the active data directory for native execution.

- **Native mode**: `PHONE_FARM_DATA_DIR` defaults to `platform/` (the repo `platform/` directory itself). Active data lives in `platform/accounts.json`, `platform/proxies.json`, etc.
- **Docker mode**: `PHONE_FARM_DATA_DIR=/app/data` in `docker-compose.yml`; this directory is the Docker volume mount.
- **Persistence**: active persistence is SQLite (`phonefarm.db` in this directory), managed by `platform_data.py`. The JSON files here are stale snapshots.

## Why hand-editing has no effect (native)

`platform/phonefarm/proxy_manager.py:37` and `engagement.py:33` both resolve:

```python
DATA_DIR = Path(os.getenv("PHONE_FARM_DATA_DIR", BASE_DIR))
```

Where `BASE_DIR` is `platform/`. So on native execution, `DATA_DIR = platform/` — the JSON files in `platform/data/` are never read.

See full canónico vs duplicado explanation: **docs/INTERCONEXION.md:144**
