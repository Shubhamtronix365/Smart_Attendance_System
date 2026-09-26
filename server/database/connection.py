import re
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from server.config import settings

db_url = settings.DATABASE_URL.strip()

# 1. Normalize driver scheme for asyncpg
if db_url.startswith("postgres://"):
    db_url = "postgresql+asyncpg://" + db_url[len("postgres://"):]
elif db_url.startswith("postgresql://") and not db_url.startswith("postgresql+asyncpg://"):
    db_url = "postgresql+asyncpg://" + db_url[len("postgresql://"):]

# 2. Handle Neon DB SSL & serverless pooling
connect_args = {}
if "sslmode=" in db_url or "neon.tech" in db_url:
    # asyncpg expects ssl config in connect_args, not as sslmode query parameter
    db_url = re.sub(r"[?&]sslmode=[^&]+", "", db_url)
    connect_args["ssl"] = "require"

# Create async engine for PostgreSQL via asyncpg
engine = create_async_engine(
    db_url,
    connect_args=connect_args,
    pool_pre_ping=True,  # Crucial for Neon serverless DB reconnection
    echo=False,  # Set to True for SQL logging
)

# Create async session maker
async_session_maker = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

# Declarative base class for models
class Base(DeclarativeBase):
    pass

# Async dependency to obtain database session
async def get_db():
    async with async_session_maker() as session:
        try:
            yield session
        finally:
            await session.close()
