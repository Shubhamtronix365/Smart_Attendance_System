#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <Adafruit_Fingerprint.h>
#include <SPI.h>
#include <MFRC522.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <RTClib.h>

// =====================================================
//             WI-FI & SERVER CONFIGURATION
// =====================================================
// Connect ESP32 to ANY Wi-Fi network (Home, Office, or Mobile Hotspot)
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Server WebSocket Connection Settings:
// [Option 1: Local Testing] (When on same LAN)
const char* WS_HOST       = "172.20.176.83";
const int   WS_PORT       = 8000;
const char* WS_PATH       = "/ws/device?device_id=ESP32_TRONIX_01&api_key=esp32_device_secret_key";
const bool  USE_SSL       = false;

// [Option 2: Production on Render Cloud] (Connects from ANY Wi-Fi, Office, or Mobile Hotspot!)
// To deploy, comment Option 1 above and uncomment Option 2 with your Render hostname:
// const char* WS_HOST    = "smart-attendance-backend.onrender.com"; // Your Render domain (no https://)
// const int   WS_PORT    = 443;                                     // Render secure SSL port
// const char* WS_PATH    = "/ws/device?device_id=ESP32_TRONIX_01&api_key=esp32_device_secret_key";
// const bool  USE_SSL    = true;                                    // true enables wss:// encryption

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

// WebSocket Client Instance
WebSocketsClient webSocket;

// State flags & timers
bool isWsConnected       = false;
bool isEnrolling         = false;
unsigned long lastPing   = 0;
const unsigned long PING_INTERVAL = 25000; // 25s keepalive ping
unsigned long lastPunch  = 0;
const unsigned long PUNCH_COOLDOWN = 3500;

// =====================================================
//                 BUZZER PATTERNS
// =====================================================
void beepSuccess() {
  digitalWrite(BUZZER_PIN, BUZZER_ON);
  delay(100);
  digitalWrite(BUZZER_PIN, BUZZER_OFF);
  delay(80);
  digitalWrite(BUZZER_PIN, BUZZER_ON);
  delay(120);
  digitalWrite(BUZZER_PIN, BUZZER_OFF);
}

void beepShort() {
  digitalWrite(BUZZER_PIN, BUZZER_ON);
  delay(80);
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
  if (isWsConnected) {
    updateLcd("Scan RFID / FP", "Cloud WS: ONLINE");
  } else {
    updateLcd("Connecting WS...", "Please Wait");
  }
}

// =====================================================
//             WEBSOCKET EVENT EMITTER
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

void sendWsCheckin(int fingerId, const String& rfidUid) {
  if (!isWsConnected) {
    updateLcd("Server Offline", "Cannot Check In");
    beepError();
    delay(1500);
    showReady();
    return;
  }

  StaticJsonDocument<256> doc;
  doc["event"] = "checkin";
  if (fingerId > 0) doc["fingerprint_id"] = fingerId;
  if (rfidUid.length() > 0) doc["rfid_uid"] = rfidUid;

  String output;
  serializeJson(doc, output);
  webSocket.sendTXT(output);
}

// =====================================================
//            ENROLLMENT STATE MACHINE
// =====================================================
void runEnrollmentRoutine(int targetFingerId, const String& empCode, const String& empName) {
  isEnrolling = true;
  Serial.printf("\n>>> [REMOTE WS ENROLLMENT STARTED] Slot: %d, Code: %s, Name: %s <<<\n",
                targetFingerId, empCode.c_str(), empName.c_str());

  // 1. Step: Waiting Finger 1
  String l1 = "Enroll " + empCode;
  String l2 = "Place Finger 1";
  updateLcd(l1, l2);
  sendWsStep("waiting_finger_1", l1, l2, targetFingerId);

  unsigned long t0 = millis();
  int p = -1;
  while (p != FINGERPRINT_OK) {
    webSocket.loop(); // keep WS alive
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

  // 6. Complete
  l1 = "Done! Save in";
  l2 = "Web Admin App";
  updateLcd(l1, l2);
  beepSuccess();
  sendWsStep("completed", l1, l2, targetFingerId, capturedUid);
  delay(2000);

  showReady();
  isEnrolling = false;
  Serial.println(">>> [REMOTE WS ENROLLMENT FINISHED] <<<\n");
}

// =====================================================
//            WEBSOCKET EVENT CALLBACK
// =====================================================
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      isWsConnected = false;
      Serial.println("[WS] Disconnected from Server");
      updateLcd("WS Disconnected", "Reconnecting...");
      break;

    case WStype_CONNECTED:
      isWsConnected = true;
      Serial.println("[WS] Connected to Server Successfully!");
      updateLcd("WS Connected!", "Device Online");
      beepSuccess();
      delay(1500);
      showReady();
      break;

    case WStype_TEXT: {
      String msg = String((char*)payload);
      Serial.printf("[WS Message Received]: %s\n", msg.c_str());

      StaticJsonDocument<384> doc;
      DeserializationError error = deserializeJson(doc, msg);
      if (error) return;

      const char* command = doc["command"];
      const char* event   = doc["event"];

      // Remote Enrollment Trigger
      if (command && strcmp(command, "start_enroll") == 0) {
        int fid = doc["fingerprint_id"] | 1;
        String code = doc["employee_code"] | "EMP";
        String name = doc["name"] | "Employee";
        runEnrollmentRoutine(fid, code, name);
      }
      else if (command && strcmp(command, "cancel_enroll") == 0) {
        isEnrolling = false;
        updateLcd("Enrollment", "Cancelled");
        beepError();
        delay(1500);
        showReady();
      }
      // Attendance punch feedback from server
      else if (event && strcmp(event, "checkin_result") == 0) {
        bool success = doc["success"] | false;
        String empName = doc["employee_name"] | "Employee";
        String punchType = doc["punch_type"] | "PUNCH";

        if (success) {
          updateLcd(empName, punchType + " OK");
          beepSuccess();
          delay(2000);
        } else {
          updateLcd("Not Registered", "Access Denied");
          beepError();
          delay(1800);
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
//               CHECK RFID ATTENDANCE
// =====================================================
void checkRFIDAttendance() {
  if (isEnrolling) return;
  if (!rfid.PICC_IsNewCardPresent()) return;
  if (!rfid.PICC_ReadCardSerial()) return;

  if (millis() - lastPunch < PUNCH_COOLDOWN) {
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

  lastPunch = millis();
  Serial.print("RFID Card Scanned: ");
  Serial.println(uid);

  updateLcd("RFID Scanned", uid);
  sendWsCheckin(0, uid);
}

// =====================================================
//            CHECK FINGERPRINT ATTENDANCE
// =====================================================
void checkFingerprintAttendance() {
  if (isEnrolling) return;
  if (millis() - lastPunch < PUNCH_COOLDOWN) return;

  int p = finger.getImage();
  if (p != FINGERPRINT_OK) return;

  p = finger.image2Tz();
  if (p != FINGERPRINT_OK) return;

  p = finger.fingerSearch();
  if (p == FINGERPRINT_OK) {
    lastPunch = millis();
    int id = finger.fingerID;
    Serial.printf("Fingerprint Recognized: Slot %d (Confidence %d)\n", id, finger.confidence);
    updateLcd("Finger Detected", "Slot #" + String(id));
    sendWsCheckin(id, "");
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
  updateLcd("ESP32 Tronix WS", "Booting System..");
  delay(1200);

  // RTC Init
  if (rtc.begin()) {
    rtcOK = true;
    Serial.println("DS3231 RTC OK");
  } else {
    Serial.println("DS3231 RTC not detected");
  }

  // RC522 RFID Init
  SPI.begin(18, 19, 23, RFID_SS);
  rfid.PCD_Init();
  delay(200);

  // R307S Fingerprint Sensor Init
  FingerSerial.begin(57600, SERIAL_8N1, FINGER_RX, FINGER_TX);
  finger.begin(57600);

  if (finger.verifyPassword()) {
    Serial.println("R307S Fingerprint Sensor: ONLINE");
  } else {
    Serial.println("R307S Fingerprint Sensor: ERROR");
    updateLcd("Sensor Error", "Check R307S");
    beepError();
    delay(2000);
  }

  // Wi-Fi Connection (Can be any local Wi-Fi or Mobile Hotspot)
  updateLcd("Connecting WiFi", WIFI_SSID);
  Serial.print("Connecting to Wi-Fi: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int retries = 0;
  while (WiFi.status() != WL_CONNECTED && retries < 25) {
    delay(500);
    Serial.print(".");
    retries++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWi-Fi Connected!");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());
    updateLcd("WiFi Connected", WiFi.localIP().toString());
    beepSuccess();
    delay(1500);
  } else {
    Serial.println("\nWi-Fi Failed!");
    updateLcd("WiFi Failed", "Offline Mode");
    beepError();
    delay(2000);
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

  // 3. Sensor Attendance checks (when not in enrollment)
  checkRFIDAttendance();
  checkFingerprintAttendance();

  delay(20);
}
