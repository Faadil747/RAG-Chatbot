"""
Starts (or reconnects to) the project's local embedded Postgres via
`pgserver`, for dev environments with no Docker and no system Postgres
install (see README §14) -- on a FIXED port, so `backend/.env`'s
DATABASE_URL never needs editing between restarts.

Data lives in `.pgdata/` at the repo root (git-ignored, persists across
restarts). pgserver's public API (`get_server()`) always binds to a random
free OS port with no way to pin it, which meant every restart required
copy-pasting a new DATABASE_URL into backend/.env -- a manual, easy-to-skip
step. (That's exactly how this project's data looked "lost" after an
environment reset once: nobody knew to look for Postgres on a new port.)
This script bypasses that by driving the same underlying `pg_ctl` binary
pgserver installs directly, with an explicit `-p PORT`.

Usage:
    ai-service/.venv/Scripts/python.exe ai-service/scripts/start_local_db.py

Idempotent: if Postgres is already running on PORT against this pgdata, does
nothing. The server process is independent of this script (not a child tied
to its lifetime) -- kill it via its PID (printed) if you need to stop it.

Windows quirk: if the previous postgres.exe was force-killed (taskkill --
unavoidable when an environment/session just disappears), the data directory
comes up "not properly shut down" on next start, which triggers WAL
recovery. On Windows that recovery path can race with something holding a
lock on `.pgdata/log`, hitting a "sharing violation" that retries for ~30s.
This script passes a generous 90s timeout to `pg_ctl` to ride that out; if it
still times out, wait ~20s then check `tasklist | findstr postgres` and
`netstat -ano | findstr LISTENING` for the real live PID rather than
re-running this script (each re-run spawns another overlapping attempt).
"""
from __future__ import annotations

from pathlib import Path

import pgserver
from pgserver._commands import pg_ctl
from pgserver.utils import PostmasterInfo

PGDATA = Path(__file__).resolve().parent.parent.parent / ".pgdata"

# Fixed on purpose -- must match backend/.env's DATABASE_URL port. Change
# both together if this ever needs to move (e.g. a real conflict on this
# machine), never just one.
PORT = 55679


def _is_running() -> bool:
    info = PostmasterInfo.read_from_pgdata(PGDATA)
    return info is not None and info.port == PORT and info.is_running()


def main() -> None:
    if _is_running():
        info = PostmasterInfo.read_from_pgdata(PGDATA)
        print(f"Postgres already running on port {PORT} (PID {info.pid}).")
        return

    if not (PGDATA / "PG_VERSION").exists():
        # First-ever run on a fresh .pgdata: let pgserver do initdb + start
        # once (accepting whatever random port it picks for just this one
        # bootstrap), then stop it so we can restart cleanly on our fixed
        # port below.
        print("No existing data directory found -- initializing (first run only)...")
        server = pgserver.get_server(PGDATA, cleanup_mode="stop")
        del server  # cleanup_mode="stop" stops postgres when this handle is released

    pg_ctl(
        ["-w", "-o", f'-p {PORT} -h "127.0.0.1"', "-l", str(PGDATA / "log"), "start"],
        pgdata=PGDATA,
        timeout=90,
    )
    info = PostmasterInfo.read_from_pgdata(PGDATA)
    print(f"Postgres started on port {PORT} (PID {info.pid if info else '?'}).")
    print(f"backend/.env DATABASE_URL should be: postgresql://postgres:@127.0.0.1:{PORT}/postgres?schema=public")


if __name__ == "__main__":
    main()
