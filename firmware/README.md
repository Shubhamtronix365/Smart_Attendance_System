# ESP32 Tronix Biometric & RFID Hardware Guide

This directory contains the embedded Arduino firmware sketches for the **Smart Attendance System** IoT terminal.

## Sensor Pinout Mapping

| Component | Interface | ESP32 GPIO Pins | Operating Voltage |
| :--- | :--- | :--- | :--- |
| **R307S Fingerprint Sensor** | UART (HardwareSerial 2) | RX: GPIO 16, TX: GPIO 17 | 5V / 3.3V Logic |
| **RC522 RFID Card Reader** | SPI | SCK: 18, MISO: 19, MOSI: 23, SS (SDA): 5, RST: 4 | 3.3V Only |
| **16x2 LCD Display (I2C 0x27)**| I2C | SDA: GPIO 21, SCL: GPIO 22 | 5V |
| **DS3231 Precision RTC** | I2C | SDA: GPIO 21, SCL: GPIO 22 | 3.3V / 5V |
| **Piezo Buzzer** | Digital Output | Signal: GPIO 27, GND: GND | 3.3V - 5V |

## Firmware Sketches

1. **`attendace_device_tronix_ws.ino` (Recommended):**
   - Uses WebSockets (`<WebSocketsClient.h>`) for real-time bidirectional streaming.
   - Works across **different Wi-Fi networks, mobile hotspots, and remote branch locations**.
   - Supports local LAN, Cloudflare Tunnels, ngrok, and Render Cloud (`wss://` port 443).

2. **`attendace_device_tronix_wifi.ino`:**
   - Standard HTTP polling firmware for local subnet networks.

3. **`attendace_device_tronix.ino`:**
   - Reference Serial Monitor standalone firmware.

## Required Arduino Libraries
- `Adafruit Fingerprint Sensor Library`
- `MFRC522` by GithubCommunity
- `LiquidCrystal I2C`
- `RTClib` by Adafruit
- `ArduinoJson` (v6.x)
- `WebSockets` by Markus Sattler
