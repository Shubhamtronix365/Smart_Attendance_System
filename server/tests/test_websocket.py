import pytest
from server.routes.websocket import ws_manager

def test_websocket_manager_initial_state():
    assert len(ws_manager.active_clients) == 0
    assert len(ws_manager.active_devices) == 0

def test_websocket_manager_device_disconnect_safe():
    # Calling disconnect on non-existent device should not raise
    ws_manager.disconnect_device("NON_EXISTENT")
    assert len(ws_manager.active_devices) == 0
