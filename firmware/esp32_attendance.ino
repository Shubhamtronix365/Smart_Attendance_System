/*
 * Smart Attendance System - ESP32 Biometric Firmware
 * Hardware: ESP32 DevKit V1 + AS608 / R307 Optical Fingerprint Sensor
 * 
 * Circuit Wiring:
 *   ESP32 GPIO 16 (RX2) <---> Sensor TX (Green wire)
 *   ESP32 GPIO 17 (TX2) <---> Sensor RX (White wire)
 *   ESP32 3.3V or 5V    <---> Sensor VCC (Red wire)
 *   ESP32 GND           <---> Sensor GND (Black wire)
 *   ESP32 GPIO 4        <---> Buzzer (+) [Optional]
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <Adafruit_Fingerprint.h>

// =========================================================================
// 1. Wi-Fi & Backend Server Configuration
// =========================================================================
const char* WIFI_SSID     = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// NOTE: Configured to your computer's Local IPv4 address on the Wi-Fi network:
const char* SERVER_URL    = "http://172.20.176.83:8000/api/device/checkin";
const char* DEVICE_API_KEY= "esp32_device_secret_key"; // Matches DEVICE_API_KEY in server/.env
const char* DEVICE_ID     = "esp32-01";

// =========================================================================
// 2. Hardware Pin Definitions
// =========================================================================
#define FINGERPRINT_RX 16 // Hardware UART2 RX
#define FINGERPRINT_TX 17 // Hardware UART2 TX
#define BUZZER_PIN     4  // Buzzer feedback pin

HardwareSerial sensorSerial(2);
Adafruit_Fingerprint finger = Adafruit_Fingerprint(&sensorSerial);

void beep(int ms) {
  digitalWrite(BUZZER_PIN, HIGH);
  delay(ms);
  digitalWrite(BUZZER_PIN, LOW);
}

void setup() {
  Serial.begin(115200);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  Serial.println("\n============================================");
  Serial.println("  Smart Attendance ESP32 Device Initializing ");
  Serial.println("============================================");

  // 1. Connect to Wi-Fi
  Serial.printf("[WiFi] Connecting to %s", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\n[WiFi] Connected successfully!");
  Serial.print("[WiFi] Assigned IP: ");
  Serial.println(WiFi.localIP());

  // 2. Connect to Fingerprint Sensor
  sensorSerial.begin(57600, SERIAL_8N1, FINGERPRINT_RX, FINGERPRINT_TX);
  delay(100);

  if (finger.verifyPassword()) {
    Serial.println("[Sensor] Fingerprint sensor detected & authenticated!");
    beep(100); // 1 short chirp on success
  } else {
    Serial.println("[Sensor] ERROR: Fingerprint sensor not detected. Check wires!");
    while (1) {
      beep(500);
      delay(1000);
    }
  }
}

// =========================================================================
// 3. Scan & Match Routine
// =========================================================================
int getFingerprintID() {
  uint8_t p = finger.getImage();
  if (p != FINGER_OK) return -1;

  p = finger.image2Tz();
  if (p != FINGER_OK) return -1;

  p = finger.fingerFastSearch();
  if (p != FINGER_OK) return -1;

  return finger.fingerID; // Returns matching slot ID (1, 2, 3...)
}

// =========================================================================
// 4. Send Check-in Request to Backend API
// =========================================================================
void sendAttendance(int fingerprintId) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Lost connection! Reconnecting...");
    WiFi.reconnect();
    return;
  }

  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_API_KEY);

  // JSON Body matching FastAPI DeviceCheckinRequest schema
  String payload = "{\"fingerprint_id\":" + String(fingerprintId) +
                   ",\"device_id\":\"" + String(DEVICE_ID) + "\"}";

  Serial.println("\n[HTTP] POST -> " + String(SERVER_URL));
  Serial.println("[HTTP] Body: " + payload);

  int httpCode = http.POST(payload);

  if (httpCode > 0) {
    String response = http.getString();
    Serial.printf("[HTTP] Code: %d\n", httpCode);
    Serial.printf("[HTTP] Response: %s\n", response.c_str());

    if (httpCode == 200) {
      // Success feedback: Double chirp
      beep(100);
      delay(80);
      beep(100);
    } else {
      // Rejection feedback: Single long buzz
      beep(500);
    }
  } else {
    Serial.printf("[HTTP] Request failed, error: %s\n", http.errorToString(httpCode).c_str());
    beep(700);
  }

  http.end();
}

void loop() {
  int fingerprintId = getFingerprintID();

  if (fingerprintId > 0) {
    Serial.printf("\n[Scan] Match found! Fingerprint Slot ID: %d\n", fingerprintId);
    sendAttendance(fingerprintId);
    delay(3000); // Debounce to prevent multiple scans within 3 seconds
  }

  delay(100);
}
