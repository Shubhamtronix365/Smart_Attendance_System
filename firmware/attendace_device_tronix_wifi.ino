#include <WiFi.h>
#include <HTTPClient.h>
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
// Replace with your local Wi-Fi SSID and password
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Target Server: Local FastAPI backend running on user's machine
const char* SERVER_BASE_URL = "http://172.20.176.83:8000";
const char* DEVICE_API_KEY  = "esp32_device_secret_key";

// =====================================================
//                 R307S FINGERPRINT
// =====================================================
#define FINGER_RX 16
#define FINGER_TX 17
HardwareSerial FingerSerial(2);
Adafruit_Fingerprint finger(&FingerSerial);

// =====================================================
//                    RC522 RFID
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

// Timing & state
unsigned long lastPollTime       = 0;
const unsigned long POLL_INTERVAL = 2000; // Poll enrollment task every 2s
unsigned long lastPunchTime      = 0;
const unsigned long PUNCH_COOLDOWN= 4000; // Prevent spamming attendance

bool isEnrolling = false;

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
  updateLcd("Scan RFID or", "Fingerprint");
}

// =====================================================
//               HTTP HELPER FUNCTIONS
// =====================================================
bool sendEnrollStep(const String& sessionId, const String& step,
                    const String& l1, const String& l2,
                    int fingerId = 0, const String& rfidUid = "",
                    const String& errMsg = "") {
  if (WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;
  String url = String(SERVER_BASE_URL) + "/api/device/enroll/step";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_API_KEY);

  StaticJsonDocument<300> doc;
  doc["session_id"] = sessionId;
  doc["step"] = step;
  doc["lcd_line1"] = l1;
  doc["lcd_line2"] = l2;
  if (fingerId > 0) doc["fingerprint_id"] = fingerId;
  if (rfidUid.length() > 0) doc["rfid_uid"] = rfidUid;
  if (errMsg.length() > 0) doc["error_message"] = errMsg;

  String requestBody;
  serializeJson(doc, requestBody);

  int httpCode = http.POST(requestBody);
  http.end();
  return (httpCode == 200);
}

void sendCheckin(int fingerId, const String& rfidUid) {
  if (WiFi.status() != WL_CONNECTED) {
    updateLcd("Wi-Fi Offline", "Cannot Check In");
    beepError();
    delay(1500);
    showReady();
    return;
  }

  HTTPClient http;
  String url = String(SERVER_BASE_URL) + "/api/device/checkin";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_API_KEY);

  StaticJsonDocument<256> doc;
  if (fingerId > 0) {
    doc["fingerprint_id"] = fingerId;
  }
  if (rfidUid.length() > 0) {
    doc["rfid_uid"] = rfidUid;
  }
  doc["device_id"] = "ESP32_TRONIX_01";

  String requestBody;
  serializeJson(doc, requestBody);

  int httpCode = http.POST(requestBody);
  if (httpCode == 200) {
    String response = http.getString();
    StaticJsonDocument<256> resDoc;
    deserializeJson(resDoc, response);
    String empName = resDoc["employee_name"] | "Employee";
    String punchType = resDoc["punch_type"] | "PUNCH";

    updateLcd(empName, punchType + " OK");
    beepSuccess();
    delay(2000);
  } else if (httpCode == 404) {
    updateLcd("User Not Found", "Unregistered");
    beepError();
    delay(1500);
  } else {
    updateLcd("Server Error", "Code: " + String(httpCode));
    beepError();
    delay(1500);
  }

  http.end();
  showReady();
}

// =====================================================
//            ENROLLMENT STATE MACHINE HANDLER
// =====================================================
void handleEnrollment(const String& sessionId, int targetFingerId,
                      const String& empCode, const String& empName) {
  isEnrolling = true;
  Serial.println("\n>>> [ENROLL MODE ACTIVATED] <<<");
  Serial.printf("Session: %s, FingerID: %d, Code: %s, Name: %s\n",
                sessionId.c_str(), targetFingerId, empCode.c_str(), empName.c_str());

  // 1. Step: Waiting Finger 1
  String l1 = "Enroll " + empCode;
  String l2 = "Place Finger 1";
  updateLcd(l1, l2);
  sendEnrollStep(sessionId, "waiting_finger_1", l1, l2, targetFingerId);

  // Poll for finger 1 (timeout 25 seconds)
  unsigned long t0 = millis();
  int p = -1;
  while (p != FINGERPRINT_OK) {
    if (millis() - t0 > 25000) {
      updateLcd("Enrollment", "Timed Out");
      sendEnrollStep(sessionId, "failed", "Enrollment", "Timed Out", targetFingerId, "", "Scan 1 timed out.");
      beepError();
      delay(2000);
      showReady();
      isEnrolling = false;
      return;
    }
    p = finger.getImage();
    delay(50);
  }

  p = finger.image2Tz(1);
  if (p != FINGERPRINT_OK) {
    updateLcd("Scan 1 Failed", "Bad Image");
    sendEnrollStep(sessionId, "failed", "Scan 1 Failed", "Bad Image", targetFingerId, "", "Could not convert image 1.");
    beepError();
    delay(2000);
    showReady();
    isEnrolling = false;
    return;
  }

  // 2. Step: Scan 1 OK -> Remove Finger
  l1 = "Scan 1 OK";
  l2 = "Remove Finger";
  updateLcd(l1, l2);
  beepShort();
  sendEnrollStep(sessionId, "remove_finger", l1, l2, targetFingerId);

  delay(1000);
  while (finger.getImage() != FINGERPRINT_NOFINGER) {
    delay(100);
  }

  // 3. Step: Place Same Finger Again (Scan 2)
  l1 = "Place Finger";
  l2 = "Scan 2 (Confirm)";
  updateLcd(l1, l2);
  sendEnrollStep(sessionId, "waiting_finger_2", l1, l2, targetFingerId);

  t0 = millis();
  p = -1;
  while (p != FINGERPRINT_OK) {
    if (millis() - t0 > 25000) {
      updateLcd("Scan 2", "Timed Out");
      sendEnrollStep(sessionId, "failed", "Scan 2", "Timed Out", targetFingerId, "", "Scan 2 timed out.");
      beepError();
      delay(2000);
      showReady();
      isEnrolling = false;
      return;
    }
    p = finger.getImage();
    delay(50);
  }

  p = finger.image2Tz(2);
  if (p != FINGERPRINT_OK) {
    updateLcd("Scan 2 Failed", "Bad Image");
    sendEnrollStep(sessionId, "failed", "Scan 2 Failed", "Bad Image", targetFingerId, "", "Could not convert image 2.");
    beepError();
    delay(2000);
    showReady();
    isEnrolling = false;
    return;
  }

  // 4. Create Model & Store in R307S Flash
  updateLcd("Creating Model", "Please Wait...");
  p = finger.createModel();
  if (p != FINGERPRINT_OK) {
    updateLcd("Finger Mismatch", "Try Again");
    sendEnrollStep(sessionId, "failed", "Finger Mismatch", "Try Again", targetFingerId, "", "Prints did not match.");
    beepError();
    delay(2000);
    showReady();
    isEnrolling = false;
    return;
  }

  p = finger.storeModel(targetFingerId);
  if (p != FINGERPRINT_OK) {
    updateLcd("Store Error", "Flash Failure");
    sendEnrollStep(sessionId, "failed", "Store Error", "Flash Failure", targetFingerId, "", "Sensor storage failed.");
    beepError();
    delay(2000);
    showReady();
    isEnrolling = false;
    return;
  }

  // Fingerprint Enrolled!
  l1 = "Finger Saved!";
  l2 = "ID: " + String(targetFingerId);
  updateLcd(l1, l2);
  beepSuccess();
  sendEnrollStep(sessionId, "finger_enrolled", l1, l2, targetFingerId);
  delay(1500);

  // 5. Step: RFID Card Scan (or Skip)
  l1 = "Tap RFID Card";
  l2 = "Or Skip on Web";
  updateLcd(l1, l2);
  sendEnrollStep(sessionId, "waiting_rfid", l1, l2, targetFingerId);

  String capturedUid = "";
  t0 = millis();
  // Allow up to 15 seconds to tap an RFID card
  while (millis() - t0 < 15000) {
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
    l1 = "RFID Attached";
    l2 = capturedUid;
    updateLcd(l1, l2);
    beepSuccess();
    sendEnrollStep(sessionId, "rfid_captured", l1, l2, targetFingerId, capturedUid);
    delay(1500);
  } else {
    // Skipped or timeout
    l1 = "RFID Skipped";
    l2 = "Finger Only";
    updateLcd(l1, l2);
    sendEnrollStep(sessionId, "rfid_captured", l1, l2, targetFingerId, "");
    delay(1200);
  }

  // 6. Complete
  l1 = "Ready in Web UI";
  l2 = "Save Details";
  updateLcd(l1, l2);
  beepSuccess();
  sendEnrollStep(sessionId, "completed", l1, l2, targetFingerId, capturedUid);
  delay(2000);

  showReady();
  isEnrolling = false;
  Serial.println(">>> [ENROLL MODE COMPLETED] <<<\n");
}

// =====================================================
//              POLL PENDING ENROLLMENT TASK
// =====================================================
void pollEnrollment() {
  if (WiFi.status() != WL_CONNECTED || isEnrolling) return;

  HTTPClient http;
  String url = String(SERVER_BASE_URL) + "/api/device/enroll/poll";
  http.begin(url);
  http.addHeader("X-Device-Key", DEVICE_API_KEY);

  int httpCode = http.GET();
  if (httpCode == 200) {
    String payload = http.getString();
    StaticJsonDocument<384> doc;
    DeserializationError err = deserializeJson(doc, payload);
    if (!err) {
      const char* status = doc["status"];
      if (status && strcmp(status, "pending") == 0) {
        String sessionId = doc["session_id"] | "";
        int fId          = doc["fingerprint_id"] | 1;
        String empCode   = doc["employee_code"] | "EMP";
        String empName   = doc["name"] | "Employee";

        http.end();
        handleEnrollment(sessionId, fId, empCode, empName);
        return;
      }
    }
  }
  http.end();
}

// =====================================================
//               CHECK RFID ATTENDANCE
// =====================================================
void checkRFIDAttendance() {
  if (isEnrolling) return;
  if (!rfid.PICC_IsNewCardPresent()) return;
  if (!rfid.PICC_ReadCardSerial()) return;

  if (millis() - lastPunchTime < PUNCH_COOLDOWN) {
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

  lastPunchTime = millis();
  Serial.print("RFID Attendance Scan: ");
  Serial.println(uid);

  updateLcd("RFID Scanned", uid);
  sendCheckin(0, uid);
}

// =====================================================
//            CHECK FINGERPRINT ATTENDANCE
// =====================================================
void checkFingerprintAttendance() {
  if (isEnrolling) return;
  if (millis() - lastPunchTime < PUNCH_COOLDOWN) return;

  int p = finger.getImage();
  if (p != FINGERPRINT_OK) return;

  p = finger.image2Tz();
  if (p != FINGERPRINT_OK) return;

  p = finger.fingerSearch();
  if (p == FINGERPRINT_OK) {
    lastPunchTime = millis();
    int id = finger.fingerID;
    Serial.printf("Fingerprint Found: ID %d (Confidence %d)\n", id, finger.confidence);
    updateLcd("Finger Detected", "Slot #" + String(id));
    sendCheckin(id, "");
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
  updateLcd("ESP32 Tronix", "Booting System..");
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
    Serial.println("R307S Sensor: ONLINE");
  } else {
    Serial.println("R307S Sensor: ERROR");
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
    Serial.println("\nWi-Fi Connected!");
    Serial.print("ESP32 IP: ");
    Serial.println(WiFi.localIP());
    updateLcd("WiFi Connected", WiFi.localIP().toString());
    beepSuccess();
    delay(2000);
  } else {
    Serial.println("\nWi-Fi Connection Failed (Offline Mode)");
    updateLcd("WiFi Failed", "Offline Mode");
    beepError();
    delay(2000);
  }

  showReady();
}

// =====================================================
//                        LOOP
// =====================================================
void loop() {
  // 1. Periodically poll for web enrollment requests from FastAPI
  if (millis() - lastPollTime >= POLL_INTERVAL) {
    lastPollTime = millis();
    pollEnrollment();
  }

  // 2. Continuous attendance checks (Fingerprint & RFID)
  checkRFIDAttendance();
  checkFingerprintAttendance();

  delay(20);
}
