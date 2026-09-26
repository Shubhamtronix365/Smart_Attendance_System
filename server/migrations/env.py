import sys
import os
import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection

from alembic import context

# Add project root to sys.path so we can import our server modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from server.config import settings
from server.models import Base

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# add your model's MetaData object here
target_metadata = Base.metadata

def get_normalized_url_and_args():
    from urllib.parse import urlparse, urlunparse
    parsed = urlparse(settings.DATABASE_URL.strip())
    scheme = parsed.scheme
    if scheme in ("postgres", "postgresql"):
        scheme = "postgresql+asyncpg"

    connect_args = {}
    if "neon.tech" in parsed.netloc or "sslmode" in parsed.query or "ssl" in parsed.query or "channel_binding" in parsed.query:
        connect_args["ssl"] = "require"

    clean_url = urlunparse((scheme, parsed.netloc, parsed.path, "", "", ""))
    return clean_url, connect_args

def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url, _ = get_normalized_url_and_args()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """In this scenario we need to create an Engine
    and associate a connection with the context.
    """
    from sqlalchemy.ext.asyncio import create_async_engine

    db_url, connect_args = get_normalized_url_and_args()

    # If running in Render CI/Build and DATABASE_URL is still default localhost, skip gracefully
    if ("localhost" in db_url or "127.0.0.1" in db_url) and os.getenv("RENDER"):
        print("[ALEMBIC NOTICE] DATABASE_URL is pointing to localhost on Render.")
        print("[ALEMBIC NOTICE] Set DATABASE_URL in Render Dashboard Environment tab. Skipping build-time migration.")
        return

    try:
        connectable = create_async_engine(
            db_url,
            connect_args=connect_args,
            poolclass=pool.NullPool,
        )

        async with connectable.connect() as connection:
            await connection.run_sync(do_run_migrations)

        await connectable.dispose()
    except Exception as e:
        if os.getenv("RENDER"):
            print(f"[ALEMBIC WARNING] Migration could not reach database ({e}).")
            print("[ALEMBIC WARNING] Migrations will run at service startup once DATABASE_URL is populated.")
            return
        raise e


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

