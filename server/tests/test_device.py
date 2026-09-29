import pytest
from httpx import AsyncClient, ASGITransport
from server.main import app

@pytest.mark.asyncio
async def test_device_enroll_status():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/api/device/enroll/status")
        assert res.status_code == 200
        data = res.json()
        assert "status" in data
        assert "active" in data

@pytest.mark.asyncio
async def test_device_enroll_cancel():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/device/enroll/cancel")
        assert res.status_code == 200
        assert res.json()["status"] == "cancelled"

@pytest.mark.asyncio
async def test_device_checkin_unauthorized():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post("/api/device/checkin", json={"fingerprint_id": 1})
        # Missing X-Device-Key header should be forbidden
        assert res.status_code == 403
