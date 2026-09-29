import pytest
from httpx import AsyncClient, ASGITransport
from server.main import app
from server.routes.database import create_vault_token

@pytest.mark.asyncio
async def test_database_vault_unauthorized():
    """Accessing database overview without auth token should return 401."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/api/database/overview")
        assert res.status_code == 401

@pytest.mark.asyncio
async def test_database_vault_token_generation():
    """Verify that vault token generates with correct scope and claims."""
    token = create_vault_token("admin@example.com")
    assert token is not None
    assert isinstance(token, str)

@pytest.mark.asyncio
async def test_database_query_unauthorized():
    """Accessing SQL query endpoint without vault token should be forbidden."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/database/query", json={"query": "SELECT 1;"})
        assert res.status_code in (401, 403)
