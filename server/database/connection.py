from urllib.parse import urlparse, urlunparse
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from server.config import settings

def get_normalized_db_config(raw_url: str):
    parsed = urlparse(raw_url.strip())
    scheme = parsed.scheme
    if scheme in ("postgres", "postgresql"):
        scheme = "postgresql+asyncpg"
    
    connect_args = {}
    if "neon.tech" in parsed.netloc or "sslmode" in parsed.query or "ssl" in parsed.query or "channel_binding" in parsed.query:
        connect_args["ssl"] = "require"
    
    # Strip all query parameters for asyncpg
    clean_url = urlunparse((scheme, parsed.netloc, parsed.path, "", "", ""))
    return clean_url, connect_args

db_url, connect_args = get_normalized_db_config(settings.DATABASE_URL)

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
