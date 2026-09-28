import json
import logging
from datetime import date, datetime
from typing import Dict, Set, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from sqlalchemy import select, and_

from server.config import settings
from server.database.connection import async_session_maker
from server.models import Employee, Attendance, AttendanceStatus
from server.services.attendance_service import determine_status, calculate_hours
from server.routes.device import enrollment_session, get_next_free_fingerprint_id
from server.utils.time_utils import get_current_local_time, get_current_local_date

logger = logging.getLogger("smart_attendance.websocket")
router = APIRouter(tags=["WebSockets"])

# ─── WebSocket Connection Manager ─────────────────────────────────────────────
class ConnectionManager:
    def __init__(self):
        # Web clients (browsers / admin dashboard / enrollment modal)
        self.active_clients: Set[WebSocket] = set()
        # ESP32 hardware devices mapped by device_id (e.g. "ESP32_TRONIX_01")
        self.active_devices: Dict[str, WebSocket] = {}

    # ── Client Handlers ────────────────────────
    async def connect_client(self, websocket: WebSocket):
        await websocket.accept()
        self.active_clients.add(websocket)
        logger.info(f"Web client connected. Total active clients: {len(self.active_clients)}")
        # Send initial status snapshot to client
        is_hardware_online = len(self.active_devices) > 0
        device_ids = list(self.active_devices.keys())
        await websocket.send_json({
            "event": "system_status",
            "hardware_online": is_hardware_online,
            "connected_devices": device_ids,
            "enrollment_state": enrollment_session.to_dict()
        })

    def disconnect_client(self, websocket: WebSocket):
        self.active_clients.discard(websocket)
        logger.info(f"Web client disconnected. Total active clients: {len(self.active_clients)}")

    async def broadcast_to_clients(self, message: dict):
        dead_clients = set()
        for client in self.active_clients:
            try:
                await client.send_json(message)
            except Exception as e:
                logger.warning(f"Error broadcasting to client: {e}")
                dead_clients.add(client)
        for dead in dead_clients:
            self.active_clients.discard(dead)

    # ── Device Handlers ────────────────────────
    async def connect_device(self, device_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_devices[device_id] = websocket
        logger.info(f"Hardware device '{device_id}' connected via WebSocket. Total devices: {len(self.active_devices)}")
        # Notify web clients that hardware is now online
        await self.broadcast_to_clients({
            "event": "device_online",
            "device_id": device_id,
            "timestamp": datetime.utcnow().isoformat()
        })

    def disconnect_device(self, device_id: str):
        if device_id in self.active_devices:
            del self.active_devices[device_id]
            logger.info(f"Hardware device '{device_id}' disconnected. Remaining devices: {len(self.active_devices)}")
        # Notify web clients
        import asyncio
        asyncio.create_task(self.broadcast_to_clients({
            "event": "device_offline",
            "device_id": device_id,
            "timestamp": datetime.utcnow().isoformat()
        }))

    async def send_to_device(self, device_id: str, message: dict) -> bool:
        ws = self.active_devices.get(device_id)
        if not ws and len(self.active_devices) > 0:
            # Fall back to first connected device if specific id not found
            ws = next(iter(self.active_devices.values()))
        if ws:
            try:
                await ws.send_json(message)
                return True
            except Exception as e:
                logger.error(f"Failed to send to device '{device_id}': {e}")
                return False
        return False

    async def broadcast_to_devices(self, message: dict):
        for dev_id, ws in list(self.active_devices.items()):
            try:
                await ws.send_json(message)
            except Exception as e:
                logger.error(f"Error broadcasting to device '{dev_id}': {e}")

ws_manager = ConnectionManager()

# ─── Database Attendance Helper for WS Check-in ──────────────────────────────
async def process_attendance_punch(
    fingerprint_id: Optional[int],
    rfid_uid: Optional[str],
    device_time: Optional[str] = None
) -> dict:
    async with async_session_maker() as db:
        employee = None
        scan_source = "biometric"

        if fingerprint_id is not None and fingerprint_id > 0:
            stmt = select(Employee).where(
                and_(
                    Employee.fingerprint_id == fingerprint_id,
                    Employee.is_active.is_(True)
                )
            )
            res = await db.execute(stmt)
            employee = res.scalar_one_or_none()
            scan_source = "biometric"
        elif rfid_uid:
            clean_rfid = rfid_uid.strip().upper()
            stmt = select(Employee).where(
                and_(
                    Employee.rfid_uid == clean_rfid,
                    Employee.is_active.is_(True)
                )
            )
            res = await db.execute(stmt)
            employee = res.scalar_one_or_none()
            scan_source = "rfid"

        if not employee:
            return {
                "success": False,
                "status": "not_found",
                "message": "User not found or inactive",
                "employee_name": "Unknown",
                "method": scan_source
            }

        now = get_current_local_time()
        if device_time:
            try:
                if "T" in device_time:
                    punch_dt = datetime.fromisoformat(device_time)
                else:
                    punch_dt = datetime.strptime(device_time, "%Y-%m-%d %H:%M:%S")
            except Exception:
                punch_dt = now
        else:
            punch_dt = now

        today = punch_dt.date()

        att_stmt = select(Attendance).where(
            and_(
                Attendance.employee_id == employee.employee_id,
                Attendance.date == today
            )
        )
        att_res = await db.execute(att_stmt)
        attendance = att_res.scalar_one_or_none()

        if not attendance:
            # Check-In
            check_in_time = punch_dt.time()
            attendance_status = determine_status(check_in_time)

            attendance = Attendance(
                employee_id=employee.employee_id,
                date=today,
                check_in=punch_dt,
                check_out=None,
                status=attendance_status,
                source=scan_source,
                created_at=now
            )
            db.add(attendance)
            await db.commit()
            status_msg = "check_in"
            msg = f"Welcome {employee.name}!"
        else:
            if attendance.check_out is not None:
                return {
                    "success": True,
                    "status": "already_done",
                    "message": f"Already checked out today, {employee.name}.",
                    "employee_name": employee.name,
                    "method": scan_source,
                    "time": punch_dt.strftime("%H:%M:%S")
                }

            # 1-Hour Rule: Check time elapsed since check_in
            time_diff_sec = (punch_dt - attendance.check_in).total_seconds()
            if time_diff_sec < 3600:
                return {
                    "success": True,
                    "status": "already_marked",
                    "message": f"In already marked! Try after 1 hr.",
                    "employee_name": employee.name,
                    "method": scan_source,
                    "time": punch_dt.strftime("%H:%M:%S")
                }

            # Check-Out (After 1 hour)
            attendance.check_out = punch_dt
            working_hours, overtime_hours = calculate_hours(attendance.check_in, punch_dt)
            attendance.working_hours = working_hours
            attendance.overtime_hours = overtime_hours
            if attendance.status == AttendanceStatus.ABSENT:
                attendance.status = AttendanceStatus.PRESENT
            await db.commit()
            status_msg = "check_out"
            msg = f"Goodbye {employee.name}! ({working_hours:.1f}h)"

        return {
            "success": True,
            "status": status_msg,
            "message": msg,
            "employee_name": employee.name,
            "method": scan_source,
            "time": punch_dt.strftime("%H:%M:%S")
        }

# ─── Endpoint: Web Client WebSocket (/ws/client) ─────────────────────────────
@router.websocket("/ws/client")
async def websocket_client_endpoint(websocket: WebSocket):
    """
    Subscribed to by the web browser frontend (e.g. HardwareEnrollmentModal and Admin Dashboard).
    Receives instantaneous hardware telemetry, LCD frame updates, and live attendance feeds.
    """
    await ws_manager.connect_client(websocket)
    try:
        while True:
            data = await websocket.receive_json()
            action = data.get("action")
            logger.info(f"Received action from web client: {action}")

            # Client initiates enrollment via WebSocket
            if action == "start_enroll":
                emp_code = data.get("employee_code", "EMP001")
                emp_name = data.get("name", "New Employee")
                custom_fid = data.get("fingerprint_id")

                if custom_fid and int(custom_fid) > 0:
                    free_fid = int(custom_fid)
                else:
                    async with async_session_maker() as db:
                        free_fid = await get_next_free_fingerprint_id(db)

                enrollment_session.reset()
                enrollment_session.active = True
                enrollment_session.status = "initiated"
                enrollment_session.employee_code = emp_code
                enrollment_session.name = emp_name
                enrollment_session.fingerprint_id = free_fid
                enrollment_session.lcd_line1 = "Register Emp"
                enrollment_session.lcd_line2 = emp_name[:16]
                enrollment_session.message = f"Starting enrollment for {emp_name}. Assigned slot #{free_fid}."

                # Send command directly to ESP32 device
                command_payload = {
                    "command": "start_enroll",
                    "session_id": "ws_session",
                    "employee_code": emp_code,
                    "name": emp_name,
                    "fingerprint_id": free_fid
                }
                sent = await ws_manager.send_to_device("ESP32_TRONIX_01", command_payload)
                if not sent:
                    await ws_manager.broadcast_to_devices(command_payload)

                # Broadcast state update to all web clients
                await ws_manager.broadcast_to_clients({
                    "event": "enrollment_update",
                    "data": enrollment_session.to_dict()
                })

            elif action == "cancel_enroll":
                enrollment_session.reset()
                enrollment_session.status = "cancelled"
                enrollment_session.message = "Registration cancelled."

                await ws_manager.broadcast_to_devices({
                    "command": "cancel_enroll"
                })
                await ws_manager.broadcast_to_clients({
                    "event": "enrollment_update",
                    "data": enrollment_session.to_dict()
                })

    except WebSocketDisconnect:
        ws_manager.disconnect_client(websocket)
    except Exception as e:
        logger.error(f"Error on web client websocket: {e}")
        ws_manager.disconnect_client(websocket)

# ─── Endpoint: ESP32 Hardware Device WebSocket (/ws/device) ───────────────────
@router.websocket("/ws/device")
async def websocket_device_endpoint(
    websocket: WebSocket,
    device_id: str = Query("ESP32_TRONIX_01"),
    api_key: Optional[str] = Query(None)
):
    """
    Subscribed to by the ESP32 Tronix hardware client over persistent WebSocket.
    Can connect from any network (local Wi-Fi, remote branch, or mobile hotspot).
    """
    # Verify API key
    if api_key and api_key != settings.DEVICE_API_KEY:
        await websocket.close(code=1008, reason="Unauthorized device key")
        return

    await ws_manager.connect_device(device_id, websocket)

    try:
        while True:
            try:
                raw_msg = await websocket.receive_text()
            except WebSocketDisconnect:
                break
            except Exception as rx_err:
                logger.warning(f"Device '{device_id}' transport closed: {rx_err}")
                break

            try:
                data = json.loads(raw_msg)
            except Exception:
                # Raw text or keepalive ping frame
                if "ping" in raw_msg.lower():
                    await websocket.send_text("pong")
                continue

            event = data.get("event") or data.get("command")

            # 1. Hardware enrollment step update
            if event == "step":
                step = data.get("step", "unknown")
                fid = data.get("fingerprint_id")
                rfid = data.get("rfid_uid")
                l1 = data.get("lcd_line1", "")
                l2 = data.get("lcd_line2", "")
                err = data.get("error_message")

                enrollment_session.status = step
                if fid:
                    enrollment_session.fingerprint_id = int(fid)
                if rfid:
                    enrollment_session.rfid_uid = rfid
                if l1:
                    enrollment_session.lcd_line1 = l1
                if l2:
                    enrollment_session.lcd_line2 = l2
                if err:
                    enrollment_session.error = err
                enrollment_session.updated_at = datetime.utcnow()

                # Broadcast live virtual LCD & sensor state to web client
                await ws_manager.broadcast_to_clients({
                    "event": "enrollment_step",
                    "step": step,
                    "lcd_line1": enrollment_session.lcd_line1,
                    "lcd_line2": enrollment_session.lcd_line2,
                    "fingerprint_id": enrollment_session.fingerprint_id,
                    "rfid_uid": enrollment_session.rfid_uid,
                    "error": enrollment_session.error,
                    "state": enrollment_session.to_dict()
                })

            # 2. Hardware attendance punch (Fingerprint or RFID)
            elif event == "checkin":
                fid = data.get("fingerprint_id")
                rfid = data.get("rfid_uid")
                device_time = data.get("device_time") or data.get("timestamp")
                punch_id = data.get("punch_id", "")
                result = await process_attendance_punch(fid, rfid, device_time)

                # Send ACK response back to ESP32 device
                ack_payload = {
                    "event": "punch_ack",
                    "punch_id": punch_id,
                    "success": result["success"],
                    "status": result["status"],
                    "message": result["message"],
                    "employee_name": result.get("employee_name", "Unknown"),
                    "punch_type": result.get("status", "PUNCH").upper(),
                    "time": result.get("time", "")
                }
                await websocket.send_json(ack_payload)

                # Also send checkin_result for legacy compatibility
                legacy_payload = dict(ack_payload)
                legacy_payload["event"] = "checkin_result"
                await websocket.send_json(legacy_payload)

                # Broadcast live checkin feed and attendance update to all connected web clients
                if result["success"]:
                    await ws_manager.broadcast_to_clients({
                        "event": "live_attendance",
                        "employee_name": result["employee_name"],
                        "punch_type": result["status"],
                        "method": result["method"],
                        "time": result["time"]
                    })
                    await ws_manager.broadcast_to_clients({
                        "event": "attendance_updated"
                    })

            # 3. Synchronize Employee Roster & Calibrate RTC Clock
            elif event == "sync_roster":
                async with async_session_maker() as db:
                    emp_stmt = select(Employee).where(Employee.is_active == True)
                    emp_res = await db.execute(emp_stmt)
                    employees = emp_res.scalars().all()
                    roster = [
                        {
                            "fingerprint_id": emp.fingerprint_id,
                            "name": emp.name,
                            "employee_code": emp.employee_code or f"EMP{emp.employee_id:03d}",
                            "rfid_uid": emp.rfid_uid or ""
                        }
                        for emp in employees if emp.fingerprint_id
                    ]
                now_local = get_current_local_time()
                await websocket.send_json({
                    "event": "roster_data",
                    "count": len(roster),
                    "employees": roster,
                    "clock": {
                        "year": now_local.year,
                        "month": now_local.month,
                        "day": now_local.day,
                        "hour": now_local.hour,
                        "minute": now_local.minute,
                        "second": now_local.second
                    }
                })

            # 4. Heartbeat ping-pong & Time Sync
            elif event == "ping":
                now_local = get_current_local_time()
                await websocket.send_json({
                    "event": "pong",
                    "time": now_local.isoformat(),
                    "clock": {
                        "year": now_local.year,
                        "month": now_local.month,
                        "day": now_local.day,
                        "hour": now_local.hour,
                        "minute": now_local.minute,
                        "second": now_local.second
                    }
                })

    except WebSocketDisconnect:
        ws_manager.disconnect_device(device_id)
    except Exception as e:
        logger.error(f"Error on device websocket '{device_id}': {e}")
        ws_manager.disconnect_device(device_id)
