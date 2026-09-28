#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <Adafruit_Fingerprint.h>
#include <SPI.h>
#include <MFRC522.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <RTClib.h>
#include <Preferences.h>

// =========================================================================
//                     SMART ATTENDANCE SYSTEM FIRMWARE
//           ESP32 + R307S Fingerprint + RC522 RFID + DS3231 RTC
//             Offline-First Flash Queue + Cloud WebSocket Sync
// =========================================================================

// =====================================================
//             WI-FI & SERVER CONFIGURATION
// =====================================================
// Connect ESP32 to ANY Wi-Fi network (Home, Office, or Mobile Hotspot)
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Server WebSocket Connection Settings:
// [Production on Render Cloud] (Connects from ANY Wi-Fi, Office, or Mobile Hotspot!)
const char* WS_HOST       = "smart-attendance-backend-tzp4.onrender.com"; // Render backend domain (without https://)
const int   WS_PORT       = 443;                                          // Secure SSL WSS port
const char* WS_PATH       = "/ws/device?device_id=ESP32_TRONIX_01&api_key=esp32_device_secret_key";
const bool  USE_SSL       = true;                                         // true enables wss:// encryption

// [Option 2: Local LAN Testing] (Only when testing with localhost on same Wi-Fi)
// const char* WS_HOST    = "192.168.1.100"; // Your PC's LAN IP
// const int   WS_PORT    = 8000;
// const char* WS_PATH    = "/ws/device?device_id=ESP32_TRONIX_01&api_key=esp32_device_secret_key";
// const bool  USE_SSL    = false;

// =====================================================
//                 R307S FINGERPRINT SENSOR
// =====================================================
#define FINGER_RX 16
#define FINGER_TX 17
HardwareSerial FingerSerial(2);
Adafruit_Fingerprint finger(&FingerSerial);

// =====================================================
//                    RC522 RFID SENSOR
// =====================================================
#define RFID_SS   5
#define RFID_RST  4
MFRC522 rfid(RFID_SS, RFID_RST);

// =====================================================
//                  I2C & LCD & RTC
// =====================================================
#define I2C_SDA 21
#define I2C_SCL 22
LiquidCrystal_I2C lcd(0x27, 16, 2);
RTC_DS3231 rtc;
bool rtcOK = false;

// =====================================================
//                     BUZZER
// =====================================================
#define BUZZER_PIN 27
#define BUZZER_ON  HIGH
#define BUZZER_OFF LOW

// =====================================================
//            PERSISTENT FLASH STORAGE (NVS)
// =====================================================
Preferences prefsEmps;     // namespace "emp_roster": maps Slot/RFID -> "Name|Code|RFID"
Preferences prefsQueue;    // namespace "punch_q": offline attendance queue
Preferences prefsDebounce; // namespace "punch_deb": 1-hour anti-bounce tracking

// Queue State
uint32_t queueHead       = 0;
uint32_t queueTail       = 0;
bool     waitingAck      = false;
String   waitingAckId    = "";
unsigned long ackSentTime = 0;
const unsigned long ACK_TIMEOUT = 6000; // 6s timeout before retrying punch

// WebSocket Client Instance
WebSocketsClient webSocket;

// State flags & timers
bool isWsConnected       = false;
bool isEnrolling         = false;
unsigned long lastPing   = 0;
const unsigned long PING_INTERVAL  = 25000; // 25s keepalive ping
unsigned long lastScanCooldown    = 0;
const unsigned long SCAN_COOLDOWN = 3500;  // 3.5s cooldown between consecutive sensor reads

// =====================================================
//                 BUZZER PATTERNS
// =====================================================
void beepSuccess() {
  digitalWrite(BUZZER_PIN, BUZZER_ON);
  delay(100);
  digitalWrite(BUZZER_PIN, BUZZER_OFF);
  delay(70);
  digitalWrite(BUZZER_PIN, BUZZER_ON);
  delay(130);
  digitalWrite(BUZZER_PIN, BUZZER_OFF);
}

void beepShort() {
  digitalWrite(BUZZER_PIN, BUZZER_ON);
  delay(80);
  digitalWrite(BUZZER_PIN, BUZZER_OFF);
}

void beepWarning() {
  digitalWrite(BUZZER_PIN, BUZZER_ON);
  delay(100);
  digitalWrite(BUZZER_PIN, BUZZER_OFF);
  delay(80);
  digitalWrite(BUZZER_PIN, BUZZER_ON);
  delay(100);
  digitalWrite(BUZZER_PIN, BUZZER_OFF);
}

void beepError() {
  digitalWrite(BUZZER_PIN, BUZZER_ON);
  delay(400);
  digitalWrite(BUZZER_PIN, BUZZER_OFF);
}

// =====================================================
//                    LCD HELPERS
// =====================================================
void updateLcd(const String& line1, const String& line2) {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(line1.substring(0, 16));
  lcd.setCursor(0, 1);
  lcd.print(line2.substring(0, 16));
}

void showReady() {
  if (isEnrolling) return;

  String timeStr = "";
  if (rtcOK) {
    DateTime now = rtc.now();
    char buf[10];
    snprintf(buf, sizeof(buf), "%02d:%02d", now.hour(), now.minute());
    timeStr = String(buf);
  }

  if (isWsConnected) {
    if (timeStr.length() > 0) {
      updateLcd("Scan RFID / FP", "Cloud OK " + timeStr);
    } else {
      updateLcd("Scan RFID / FP", "Cloud WS: ONLINE");
    }
  } else {
    if (timeStr.length() > 0) {
      updateLcd("Scan RFID / FP", "Offline  " + timeStr);
    } else {
      updateLcd("Scan RFID / FP", "Offline Mode");
    }
  }
}

// =====================================================
//          LOCAL FLASH EMPLOYEE ROSTER (NVS)
// =====================================================
// Saves employee details permanently in ESP32 Flash memory
void saveLocalEmployee(int fid, const String& name, const String& code, const String& rfid) {
  prefsEmps.begin("emp_roster", false);
  String val = name + "|" + code + "|" + rfid;
  if (fid > 0) {
    prefsEmps.putString(("f_" + String(fid)).c_str(), val);
  }
  if (rfid.length() > 0) {
    String cleanRfid = rfid;
    cleanRfid.replace(" ", "");
    cleanRfid.toUpperCase();
    prefsEmps.putString(("r_" + cleanRfid).c_str(), val);
  }
  prefsEmps.end();
  Serial.printf("[ROSTER SAVE] Slot #%d, RFID '%s' -> %s (%s)\n", fid, rfid.c_str(), name.c_str(), code.c_str());
}

// Looks up employee name instantly from Flash (0% Wi-Fi/Server dependency)
String getLocalEmployeeName(int fid, const String& rfid = "") {
  prefsEmps.begin("emp_roster", true);
  String val = "";
  if (fid > 0) {
    val = prefsEmps.getString(("f_" + String(fid)).c_str(), "");
  }
  if (val.length() == 0 && rfid.length() > 0) {
    String cleanRfid = rfid;
    cleanRfid.replace(" ", "");
    cleanRfid.toUpperCase();
    val = prefsEmps.getString(("r_" + cleanRfid).c_str(), "");
  }
  prefsEmps.end();

  if (val.length() > 0) {
    int sep = val.indexOf('|');
    if (sep > 0) return val.substring(0, sep);
    return val;
  }
  return "";
}

// Deletes employee from Flash
void deleteLocalEmployee(int fid, const String& rfid = "") {
  prefsEmps.begin("emp_roster", false);
  if (fid > 0) {
    prefsEmps.remove(("f_" + String(fid)).c_str());
  }
  if (rfid.length() > 0) {
    String cleanRfid = rfid;
    cleanRfid.replace(" ", "");
    cleanRfid.toUpperCase();
    prefsEmps.remove(("r_" + cleanRfid).c_str());
  }
  prefsEmps.end();
  Serial.printf("[ROSTER DELETE] Removed Slot #%d, RFID '%s'\n", fid, rfid.c_str());
}

// Clears all employee records from Flash
void clearLocalEmployees() {
  prefsEmps.begin("emp_roster", false);
  prefsEmps.clear();
  prefsEmps.end();
  Serial.println("[ROSTER CLEAR] All local employee records erased from flash.");
}

// =====================================================
//               1-HOUR ANTI-BOUNCE RULE
// =====================================================
// Returns:
// 0: Blocked (< 3600s since last check-in) -> "Already Marked!"
// 1: Check-In (first punch of the day)
// 2: Check-Out (>= 3600s after check-in)
int checkAntiBounce(int fid, const String& rfid, uint32_t nowEpoch) {
  prefsDebounce.begin("punch_deb", false);
  String key = (fid > 0) ? ("df_" + String(fid)) : ("dr_" + rfid);
  key.replace(" ", "");

  uint32_t lastEpoch = prefsDebounce.getUInt(key.c_str(), 0);
  int status = 1; // Default: Check-In

  if (lastEpoch > 0 && nowEpoch >= lastEpoch) {
    uint32_t diff = nowEpoch - lastEpoch;
    if (diff < 3600) {
      // Less than 1 hour -> Block duplicate punch!
      prefsDebounce.end();
      return 0;
    } else if (diff < 54000) { // Within ~15 hours -> Mark as Check-Out
      status = 2;
    } else {
      status = 1; // Fresh Day Check-In
    }
  }

  // Update last punch timestamp
  prefsDebounce.putUInt(key.c_str(), nowEpoch);
  prefsDebounce.end();
  return status;
}

// =====================================================
//       OFFLINE ATTENDANCE QUEUE & CLOUD ACK SYNC
// =====================================================
void initQueue() {
  prefsQueue.begin("punch_q", false);
  queueHead = prefsQueue.getUInt("head", 0);
  queueTail = prefsQueue.getUInt("tail", 0);
  prefsQueue.end();
  Serial.printf("[QUEUE INIT] Head: %u, Tail: %u, Pending: %u\n",
                queueHead, queueTail, (queueTail >= queueHead ? queueTail - queueHead : 0));
}

// Store punch in persistent Flash memory queue
void enqueuePunch(int fid, const String& rfid, const String& timeStr) {
  prefsQueue.begin("punch_q", false);
  queueHead = prefsQueue.getUInt("head", 0);
  queueTail = prefsQueue.getUInt("tail", 0);

  // Generate unique punch ID using timestamp & random number
  String punchId = String(millis()) + "_" + String(random(1000, 9999));

  // Format: punchId,fid,rfid,timeStr
  String payload = punchId + "," + String(fid) + "," + rfid + "," + timeStr;

  String key = "p_" + String(queueTail);
  prefsQueue.putString(key.c_str(), payload);
  queueTail++;
  prefsQueue.putUInt("tail", queueTail);
  prefsQueue.end();

  Serial.printf("[QUEUE] Enqueued punch [%s] at slot %u. Total Pending: %u\n",
                punchId.c_str(), queueTail - 1, queueTail - queueHead);
}

// Called when cloud sends punch_ack: PERMANENTLY PURGES FROM FLASH!
void handlePunchAck(const String& punchId) {
  if (waitingAck && punchId == waitingAckId) {
    Serial.printf("[QUEUE ACK] Cloud verified punch ID: %s. DELETING FROM FLASH!\n", punchId.c_str());

    prefsQueue.begin("punch_q", false);
    queueHead = prefsQueue.getUInt("head", 0);
    queueTail = prefsQueue.getUInt("tail", 0);

    // Remove acknowledged punch from flash
    String key = "p_" + String(queueHead);
    prefsQueue.remove(key.c_str());

    queueHead++;
    if (queueHead >= queueTail) {
      // All synced! Reset indices to 0
      queueHead = 0;
      queueTail = 0;
      prefsQueue.putUInt("head", 0);
      prefsQueue.putUInt("tail", 0);
      Serial.println("[QUEUE] All offline attendance punches successfully synced to cloud!");
    } else {
      prefsQueue.putUInt("head", queueHead);
    }
    prefsQueue.end();

    waitingAck = false;
    waitingAckId = "";
  }
}

// Syncs pending offline punches one by one to cloud WebSocket
void processSyncQueue() {
  if (!isWsConnected) {
    waitingAck = false;
    return;
  }

  // Handle timeout if ack was missed
  if (waitingAck && (millis() - ackSentTime > ACK_TIMEOUT)) {
    Serial.printf("[QUEUE TIMEOUT] No ACK for punch %s. Retrying...\n", waitingAckId.c_str());
    waitingAck = false;
  }

  if (waitingAck) return; // Wait for pending ACK

  prefsQueue.begin("punch_q", true);
  queueHead = prefsQueue.getUInt("head", 0);
  queueTail = prefsQueue.getUInt("tail", 0);

  if (queueHead >= queueTail) {
    prefsQueue.end();
    return; // Queue is empty
  }

  String key = "p_" + String(queueHead);
  String payload = prefsQueue.getString(key.c_str(), "");
  prefsQueue.end();

  if (payload.length() == 0) {
    // Blank/corrupt record, advance head
    prefsQueue.begin("punch_q", false);
    queueHead++;
    prefsQueue.putUInt("head", queueHead);
    prefsQueue.end();
    return;
  }

  // Parse: punchId,fid,rfid,timeStr
  int idx1 = payload.indexOf(',');
  int idx2 = payload.indexOf(',', idx1 + 1);
  int idx3 = payload.indexOf(',', idx2 + 1);

  if (idx1 == -1 || idx2 == -1 || idx3 == -1) {
    prefsQueue.begin("punch_q", false);
    queueHead++;
    prefsQueue.putUInt("head", queueHead);
    prefsQueue.end();
    return;
  }

  String punchId = payload.substring(0, idx1);
  int fid = payload.substring(idx1 + 1, idx2).toInt();
  String rfid = payload.substring(idx2 + 1, idx3);
  String timeStr = payload.substring(idx3 + 1);

  StaticJsonDocument<320> doc;
  doc["event"] = "checkin";
  doc["punch_id"] = punchId;
  if (fid > 0) doc["fingerprint_id"] = fid;
  if (rfid.length() > 0) doc["rfid_uid"] = rfid;
  if (timeStr.length() > 0) doc["device_time"] = timeStr;

  String jsonOut;
  serializeJson(doc, jsonOut);
  webSocket.sendTXT(jsonOut);

  waitingAck = true;
  waitingAckId = punchId;
  ackSentTime = millis();

  Serial.printf("[QUEUE SYNC] Uploading punch %s (Pending: %u)...\n",
                punchId.c_str(), queueTail - queueHead);
}

// =====================================================
//             ENROLLMENT STATE MACHINE
// =====================================================
void sendWsStep(const String& step, const String& l1, const String& l2,
                int fingerId = 0, const String& rfidUid = "", const String& err = "") {
  if (!isWsConnected) return;

  StaticJsonDocument<300> doc;
  doc["event"] = "step";
  doc["step"] = step;
  doc["lcd_line1"] = l1;
  doc["lcd_line2"] = l2;
  if (fingerId > 0) doc["fingerprint_id"] = fingerId;
  if (rfidUid.length() > 0) doc["rfid_uid"] = rfidUid;
  if (err.length() > 0) doc["error_message"] = err;

  String output;
  serializeJson(doc, output);
  webSocket.sendTXT(output);
}

void runEnrollmentRoutine(int targetFingerId, const String& empCode, const String& empName) {
  isEnrolling = true;
  Serial.printf("\n>>> [SMART ENROLLMENT STARTED] Slot: %d, Code: %s, Name: %s <<<\n",
                targetFingerId, empCode.c_str(), empName.c_str());

  // 1. Step: Waiting Finger 1
  String l1 = "Enroll " + empCode;
  String l2 = "Place Finger 1";
  updateLcd(l1, l2);
  sendWsStep("waiting_finger_1", l1, l2, targetFingerId);

  unsigned long t0 = millis();
  int p = -1;
  while (p != FINGERPRINT_OK) {
    webSocket.loop();
    if (millis() - t0 > 25000) {
      updateLcd("Scan 1 Timeout", "Enroll Failed");
      sendWsStep("failed", "Scan 1 Timeout", "Enroll Failed", targetFingerId, "", "Scan 1 timed out.");
      beepError();
      delay(2000);
      showReady();
      isEnrolling = false;
      return;
    }
    p = finger.getImage();
    delay(40);
  }

  p = finger.image2Tz(1);
  if (p != FINGERPRINT_OK) {
    updateLcd("Scan 1 Bad", "Try Again");
    sendWsStep("failed", "Scan 1 Bad", "Try Again", targetFingerId, "", "Image 1 conversion failed.");
    beepError();
    delay(2000);
    showReady();
    isEnrolling = false;
    return;
  }

  // 2. Step: Remove Finger
  l1 = "Scan 1 OK";
  l2 = "Remove Finger";
  updateLcd(l1, l2);
  beepShort();
  sendWsStep("remove_finger", l1, l2, targetFingerId);

  delay(1000);
  while (finger.getImage() != FINGERPRINT_NOFINGER) {
    webSocket.loop();
    delay(80);
  }

  // 3. Step: Place Same Finger Again (Scan 2)
  l1 = "Place Finger";
  l2 = "Scan 2 Confirm";
  updateLcd(l1, l2);
  sendWsStep("waiting_finger_2", l1, l2, targetFingerId);

  t0 = millis();
  p = -1;
  while (p != FINGERPRINT_OK) {
    webSocket.loop();
    if (millis() - t0 > 25000) {
      updateLcd("Scan 2 Timeout", "Enroll Failed");
      sendWsStep("failed", "Scan 2 Timeout", "Enroll Failed", targetFingerId, "", "Scan 2 timed out.");
      beepError();
      delay(2000);
      showReady();
      isEnrolling = false;
      return;
    }
    p = finger.getImage();
    delay(40);
  }

  p = finger.image2Tz(2);
  if (p != FINGERPRINT_OK) {
    updateLcd("Scan 2 Bad", "Try Again");
    sendWsStep("failed", "Scan 2 Bad", "Try Again", targetFingerId, "", "Image 2 conversion failed.");
    beepError();
    delay(2000);
    showReady();
    isEnrolling = false;
    return;
  }

  // 4. Create Model & Store in R307S Sensor
  updateLcd("Creating Model", "Please Wait...");
  p = finger.createModel();
  if (p != FINGERPRINT_OK) {
    updateLcd("Finger Mismatch", "Try Again");
    sendWsStep("failed", "Finger Mismatch", "Try Again", targetFingerId, "", "Fingerprints did not match.");
    beepError();
    delay(2000);
    showReady();
    isEnrolling = false;
    return;
  }

  p = finger.storeModel(targetFingerId);
  if (p != FINGERPRINT_OK) {
    updateLcd("Sensor Error", "Flash Store Fail");
    sendWsStep("failed", "Sensor Error", "Flash Store Fail", targetFingerId, "", "Flash store failed.");
    beepError();
    delay(2000);
    showReady();
    isEnrolling = false;
    return;
  }

  // Fingerprint Enrolled!
  l1 = "Finger Saved!";
  l2 = "Slot ID: " + String(targetFingerId);
  updateLcd(l1, l2);
  beepSuccess();
  sendWsStep("finger_enrolled", l1, l2, targetFingerId);
  delay(1500);

  // 5. Step: Optional RFID Card Scan
  l1 = "Tap RFID Card";
  l2 = "Or Skip on Web";
  updateLcd(l1, l2);
  sendWsStep("waiting_rfid", l1, l2, targetFingerId);

  String capturedUid = "";
  t0 = millis();
  while (millis() - t0 < 15000) {
    webSocket.loop();
    if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
      for (byte i = 0; i < rfid.uid.size; i++) {
        if (i > 0) capturedUid += " ";
        if (rfid.uid.uidByte[i] < 0x10) capturedUid += "0";
        capturedUid += String(rfid.uid.uidByte[i], HEX);
      }
      capturedUid.toUpperCase();
      rfid.PICC_HaltA();
      rfid.PCD_StopCrypto1();
      break;
    }
    delay(50);
  }

  if (capturedUid.length() > 0) {
    l1 = "RFID Linked!";
    l2 = capturedUid;
    updateLcd(l1, l2);
    beepSuccess();
    sendWsStep("rfid_captured", l1, l2, targetFingerId, capturedUid);
    delay(1500);
  } else {
    l1 = "RFID Skipped";
    l2 = "Finger Only";
    updateLcd(l1, l2);
    sendWsStep("rfid_captured", l1, l2, targetFingerId, "");
    delay(1200);
  }

  // SAVE IMMEDIATELY TO LOCAL FLASH ROSTER!
  saveLocalEmployee(targetFingerId, empName, empCode, capturedUid);

  // 6. Complete
  l1 = "Done! Save in";
  l2 = "Web Admin App";
  updateLcd(l1, l2);
  beepSuccess();
  sendWsStep("completed", l1, l2, targetFingerId, capturedUid);
  delay(2000);

  showReady();
  isEnrolling = false;
  Serial.println(">>> [SMART ENROLLMENT COMPLETED] <<<\n");
}

// =====================================================
//            WEBSOCKET EVENT CALLBACK
// =====================================================
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      isWsConnected = false;
      waitingAck = false;
      Serial.println("[WS] Disconnected from Server");
      showReady();
      break;

    case WStype_CONNECTED:
      isWsConnected = true;
      Serial.println("[WS] Connected to Server Successfully!");
      updateLcd("WS Connected!", "Ready");
      // Request latest roster from cloud without blocking loop
      webSocket.sendTXT("{\"event\":\"sync_roster\"}");
      break;

    case WStype_TEXT: {
      DynamicJsonDocument doc(2048);
      DeserializationError error = deserializeJson(doc, payload, length);
      if (error) {
        Serial.printf("[JSON PARSE ERROR]: %s\n", error.c_str());
        return;
      }

      const char* command = doc["command"];
      const char* event   = doc["event"];

      // 1. Cloud confirms attendance punch saved -> Purge from ESP32 Flash
      if (event && strcmp(event, "punch_ack") == 0) {
        const char* pId = doc["punch_id"];
        if (pId) {
          handlePunchAck(String(pId));
        }
      }
      // 2. Full Roster Received from Server -> Save to Flash & Calibrate RTC
      else if (event && strcmp(event, "roster_data") == 0) {
        if (doc.containsKey("clock") && rtcOK) {
          JsonObject clk = doc["clock"];
          int y = clk["year"] | 2026;
          int m = clk["month"] | 1;
          int d = clk["day"] | 1;
          int hh = clk["hour"] | 0;
          int mm = clk["minute"] | 0;
          int ss = clk["second"] | 0;
          rtc.adjust(DateTime(y, m, d, hh, mm, ss));
          Serial.printf("[RTC SYNC] Calibrated DS3231: %04d-%02d-%02d %02d:%02d:%02d\n", y, m, d, hh, mm, ss);
        }

        JsonArray emps = doc["employees"].as<JsonArray>();
        Serial.printf("[ROSTER] Received %u employees from server. Updating Flash...\n", emps.size());
        for (JsonObject emp : emps) {
          int fid = emp["fingerprint_id"] | 0;
          const char* name = emp["name"] | "";
          const char* code = emp["employee_code"] | "";
          const char* rfid = emp["rfid_uid"] | "";
          saveLocalEmployee(fid, String(name), String(code), String(rfid));
        }
        updateLcd("Roster Synced!", String(emps.size()) + " Emps Ready");
        showReady();
      }
      // 3. Delete single employee from Sensor and Flash
      else if (command && strcmp(command, "delete_employee") == 0) {
        int fid = doc["fingerprint_id"] | 0;
        const char* rfidUid = doc["rfid_uid"] | "";
        if (fid > 0) {
          finger.deleteModel(fid);
          Serial.printf("[SENSOR] Deleted Fingerprint model slot #%d\n", fid);
        }
        deleteLocalEmployee(fid, String(rfidUid));
        updateLcd("Employee Deleted", "Slot #" + String(fid));
        showReady();
      }
      // 4. Wipe ALL employees from Sensor and Flash (Full Bulk Cleanup)
      else if (command && strcmp(command, "clear_all_employees") == 0) {
        finger.emptyDatabase();
        clearLocalEmployees();
        Serial.println("[PURGE] All fingerprint models and local records wiped!");
        updateLcd("Database Purged", "All Emps Cleared");
        showReady();
      }
      // 5. Automatic DS3231 RTC Time Calibration
      else if (command && strcmp(command, "sync_time") == 0) {
        int y = doc["year"] | 2026;
        int m = doc["month"] | 1;
        int d = doc["day"] | 1;
        int hh = doc["hour"] | 0;
        int mm = doc["minute"] | 0;
        int ss = doc["second"] | 0;
        if (rtcOK) {
          rtc.adjust(DateTime(y, m, d, hh, mm, ss));
          Serial.printf("[RTC SYNC] DS3231 RTC calibrated: %04d-%02d-%02d %02d:%02d:%02d\n", y, m, d, hh, mm, ss);
        }
      }
      // 6. Remote Enrollment Triggers
      else if (command && strcmp(command, "start_enroll") == 0) {
        int fid = doc["fingerprint_id"] | 1;
        String code = doc["employee_code"] | "EMP";
        String name = doc["name"] | "Employee";
        runEnrollmentRoutine(fid, code, name);
      }
      else if (command && strcmp(command, "cancel_enroll") == 0) {
        isEnrolling = false;
        updateLcd("Enrollment", "Cancelled");
        showReady();
      }
      // 7. Real-time feedback from server
      else if (event && strcmp(event, "checkin_result") == 0) {
        bool success = doc["success"] | false;
        String empName = doc["employee_name"] | "Employee";
        const char* punchStatus = doc["status"] | "check_in";

        if (success) {
          if (strcmp(punchStatus, "check_out") == 0) {
            updateLcd(empName, "Check-Out OK!");
          } else if (strcmp(punchStatus, "already_done") == 0 || strcmp(punchStatus, "already_marked") == 0) {
            updateLcd(empName, "Already Marked!");
          } else {
            updateLcd(empName, "Check-In OK!");
          }
        } else {
          updateLcd("Not Registered", "Access Denied");
        }
        showReady();
      }
      break;
    }

    default:
      break;
  }
}

// =====================================================
//           CORE ATTENDANCE SCAN HANDLER
// =====================================================
void onAttendanceScanned(int fid, const String& rfidUid) {
  // 1. Get current time from RTC DS3231
  DateTime now = rtcOK ? rtc.now() : DateTime(2026, 1, 1, 0, 0, 0);
  uint32_t nowEpoch = now.unixtime();

  char timeStr[25];
  snprintf(timeStr, sizeof(timeStr), "%04d-%02d-%02d %02d:%02d:%02d",
           now.year(), now.month(), now.day(), now.hour(), now.minute(), now.second());

  char shortTime[10];
  snprintf(shortTime, sizeof(shortTime), "%02d:%02d", now.hour(), now.minute());

  // 2. Lookup employee name from ESP32 Flash memory
  String empName = getLocalEmployeeName(fid, rfidUid);
  if (empName.length() == 0) {
    if (fid > 0) empName = "Slot #" + String(fid);
    else empName = "Card " + rfidUid.substring(0, 8);
  }

  // 3. 1-Hour Anti-Bounce Check
  int punchType = checkAntiBounce(fid, rfidUid, nowEpoch);

  if (punchType == 0) {
    // Blocked: Within 1 hour!
    Serial.printf("[ATTENDANCE] %s: Already marked within 1 hour. Blocked.\n", empName.c_str());
    updateLcd(empName, "Already Marked!");
    beepWarning();
    delay(2000);
    showReady();
    return;
  }

  // 4. Punch is valid (Check-In or Check-Out)
  String statusMsg = (punchType == 1) ? ("In OK " + String(shortTime)) : ("Out OK " + String(shortTime));
  Serial.printf("[ATTENDANCE] %s -> %s at %s\n", empName.c_str(), statusMsg.c_str(), timeStr);
  updateLcd(empName, statusMsg);
  beepSuccess();

  // 5. Store punch in persistent Flash queue
  enqueuePunch(fid, rfidUid, String(timeStr));

  delay(2000);
  showReady();

  // 6. Trigger immediate sync if connected to Wi-Fi
  if (isWsConnected) {
    processSyncQueue();
  }
}

// =====================================================
//               CHECK RFID ATTENDANCE
// =====================================================
void checkRFIDAttendance() {
  if (isEnrolling) return;
  if (!rfid.PICC_IsNewCardPresent()) return;
  if (!rfid.PICC_ReadCardSerial()) return;

  if (millis() - lastScanCooldown < SCAN_COOLDOWN) {
    rfid.PICC_HaltA();
    rfid.PCD_StopCrypto1();
    return;
  }

  String uid = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (i > 0) uid += " ";
    if (rfid.uid.uidByte[i] < 0x10) uid += "0";
    uid += String(rfid.uid.uidByte[i], HEX);
  }
  uid.toUpperCase();

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();

  lastScanCooldown = millis();
  Serial.printf("\n[SCAN] RFID Card Detected: %s\n", uid.c_str());
  onAttendanceScanned(0, uid);
}

// =====================================================
//            CHECK FINGERPRINT ATTENDANCE
// =====================================================
void checkFingerprintAttendance() {
  if (isEnrolling) return;
  if (millis() - lastScanCooldown < SCAN_COOLDOWN) return;

  int p = finger.getImage();
  if (p != FINGERPRINT_OK) return;

  p = finger.image2Tz();
  if (p != FINGERPRINT_OK) return;

  p = finger.fingerSearch();
  if (p == FINGERPRINT_OK) {
    lastScanCooldown = millis();
    int id = finger.fingerID;
    Serial.printf("\n[SCAN] Fingerprint Recognized: Slot %d (Confidence %d)\n", id, finger.confidence);
    onAttendanceScanned(id, "");
  } else {
    updateLcd("Finger Unknown", "Not Registered");
    beepError();
    delay(1200);
    showReady();
  }
}

// =====================================================
//                       SETUP
// =====================================================
void setup() {
  Serial.begin(115200);
  delay(500);

  // Buzzer Setup
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, BUZZER_OFF);

  // I2C Setup
  Wire.begin(I2C_SDA, I2C_SCL);

  // LCD Init
  lcd.init();
  lcd.backlight();
  updateLcd("Smart Attendance", "Booting System..");
  delay(1200);

  // RTC DS3231 Init
  if (rtc.begin()) {
    rtcOK = true;
    Serial.println("[HARDWARE] DS3231 RTC Detected & Ready.");
    if (rtc.lostPower()) {
      Serial.println("[HARDWARE] RTC lost power, resetting time to compile time.");
      rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));
    }
  } else {
    Serial.println("[HARDWARE WARNING] DS3231 RTC not detected! Check I2C wiring.");
  }

  // Load Offline Punch Queue State from Flash
  initQueue();

  // RC522 RFID Init
  SPI.begin(18, 19, 23, RFID_SS);
  rfid.PCD_Init();
  delay(150);

  // R307S Fingerprint Sensor Init
  FingerSerial.begin(57600, SERIAL_8N1, FINGER_RX, FINGER_TX);
  finger.begin(57600);

  if (finger.verifyPassword()) {
    Serial.println("[HARDWARE] R307S Fingerprint Sensor: ONLINE");
  } else {
    Serial.println("[HARDWARE ERROR] R307S Fingerprint Sensor: NOT FOUND");
    updateLcd("Sensor Error", "Check R307S");
    beepError();
    delay(2000);
  }

  // Wi-Fi Connection
  updateLcd("Connecting WiFi", WIFI_SSID);
  Serial.print("Connecting to Wi-Fi: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int retries = 0;
  while (WiFi.status() != WL_CONNECTED && retries < 20) {
    delay(500);
    Serial.print(".");
    retries++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WIFI] Connected Successfully!");
    Serial.print("[WIFI] IP Address: ");
    Serial.println(WiFi.localIP());
    updateLcd("WiFi Connected", WiFi.localIP().toString());
    beepSuccess();
    delay(1200);
  } else {
    Serial.println("\n[WIFI] Connection Failed! Operating in Offline-First Mode.");
    updateLcd("WiFi Failed", "Offline Mode");
    beepError();
    delay(1500);
  }

  // Initialize WebSocket Client
  if (USE_SSL) {
    webSocket.beginSSL(WS_HOST, WS_PORT, WS_PATH);
  } else {
    webSocket.begin(WS_HOST, WS_PORT, WS_PATH);
  }
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(3000);
  webSocket.enableHeartbeat(15000, 3000, 2);

  showReady();
}

// =====================================================
//                        LOOP
// =====================================================
void loop() {
  // 1. Maintain WebSocket pump and handle incoming events
  webSocket.loop();

  // 2. Keepalive ping
  if (millis() - lastPing > PING_INTERVAL) {
    lastPing = millis();
    if (isWsConnected) {
      webSocket.sendTXT("{\"event\":\"ping\"}");
    }
  }

  // 3. Process pending offline attendance sync queue
  processSyncQueue();

  // 4. Sensor Attendance checks (active when not in enrollment)
  checkRFIDAttendance();
  checkFingerprintAttendance();

  delay(20);
}
