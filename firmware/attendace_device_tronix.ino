#include <Adafruit_Fingerprint.h>
#include <SPI.h>
#include <MFRC522.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <Preferences.h>
#include <RTClib.h>


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

#define RFID_SS  5
#define RFID_RST 4

MFRC522 rfid(RFID_SS, RFID_RST);


// =====================================================
//                  I2C BUS
// =====================================================

#define I2C_SDA 21
#define I2C_SCL 22


// =====================================================
//                  16x2 I2C LCD
// =====================================================

LiquidCrystal_I2C lcd(0x27, 16, 2);


// =====================================================
//                    DS3231 RTC
// =====================================================

RTC_DS3231 rtc;

bool rtcOK = false;


// =====================================================
//                     BUZZER
// =====================================================

#define BUZZER_PIN 27

#define BUZZER_ON  HIGH
#define BUZZER_OFF LOW


// =====================================================
//                  EMPLOYEE DATABASE
// =====================================================

#define MAX_EMPLOYEES 50

struct Employee
{
  String employeeID;
  String name;

  int fingerprintID;

  String rfidUID;

  bool hasRFID;
};

Employee employees[MAX_EMPLOYEES];

int employeeCount = 0;


// =====================================================
//                 ESP32 FLASH STORAGE
// =====================================================

Preferences prefs;


// =====================================================
//                 ATTENDANCE COOLDOWN
// =====================================================

unsigned long lastAttendanceTime = 0;

#define ATTENDANCE_COOLDOWN 5000


// =====================================================
//                FUNCTION DECLARATIONS
// =====================================================

// Storage
void saveDatabase();
void loadDatabase();
void clearDatabase();

// Registration
void registerEmployee();
bool enrollFingerprint(int id);

// RFID
String waitForRFID();
void checkRFID();

// Fingerprint
void checkFingerprint();
void manualFingerprintScan();

// Searching
int findEmployeeByRFID(String uid);
int findEmployeeByFingerprint(int fingerprintID);
int findFreeFingerprintID();

// Delete
void deleteFingerprint();
void deleteAllFingerprints();

// Attendance
void markAttendance(int index, String method);

// Information
void showInformation();

// RTC
bool initializeRTC();
void showRTCStatus();
void setRTCFromCompileTime();
void printCurrentDateTime();
String getDateString();
String getTimeString();

// LCD / UI
void showReady();
void printMenu();

// Buzzer
void beepSuccess();
void beepError();


// =====================================================
//                       SETUP
// =====================================================

void setup()
{
  Serial.begin(115200);

  delay(500);


  // ===================================================
  // START ESP32 NVS
  // ===================================================

  prefs.begin("attendance", false);

  loadDatabase();


  // ===================================================
  // BUZZER
  // ===================================================

  pinMode(BUZZER_PIN, INPUT_PULLUP);

  digitalWrite(BUZZER_PIN, BUZZER_OFF);

  pinMode(BUZZER_PIN, OUTPUT);

  digitalWrite(BUZZER_PIN, BUZZER_OFF);


  // ===================================================
  // I2C
  // ===================================================

  Wire.begin(
    I2C_SDA,
    I2C_SCL
  );


  // ===================================================
  // LCD
  // ===================================================

  lcd.init();

  lcd.backlight();

  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print("Employee System");

  lcd.setCursor(0, 1);
  lcd.print("Starting...");

  delay(1500);


  // ===================================================
  // DS3231 RTC
  // ===================================================

  Serial.println();
  Serial.println("==============================");
  Serial.println("       RTC CHECK");
  Serial.println("==============================");

  rtcOK = initializeRTC();


  // ===================================================
  // RC522 SPI
  // ===================================================

  SPI.begin(
    18,   // SCK
    19,   // MISO
    23,   // MOSI
    5     // SS
  );

  rfid.PCD_Init();

  delay(500);


  // ===================================================
  // R307S
  // ===================================================

  FingerSerial.begin(
    57600,
    SERIAL_8N1,
    FINGER_RX,
    FINGER_TX
  );

  finger.begin(57600);


  // ===================================================
  // CHECK FINGERPRINT SENSOR
  // ===================================================

  if (finger.verifyPassword())
  {
    Serial.println("R307S SENSOR OK");

    lcd.clear();

    lcd.setCursor(0, 0);
    lcd.print("Finger Sensor");

    lcd.setCursor(0, 1);
    lcd.print("OK");

    delay(1000);
  }
  else
  {
    Serial.println("R307S SENSOR ERROR");

    lcd.clear();

    lcd.setCursor(0, 0);
    lcd.print("Finger Sensor");

    lcd.setCursor(0, 1);
    lcd.print("ERROR");

    beepError();

    delay(2000);
  }


  // ===================================================
  // FINGERPRINT COUNT
  // ===================================================

  finger.getTemplateCount();

  Serial.print("Stored Fingers in R307S: ");
  Serial.println(finger.templateCount);


  // ===================================================
  // DATABASE INFORMATION
  // ===================================================

  Serial.println();
  Serial.println("==============================");
  Serial.println("DATABASE RESTORED FROM FLASH");
  Serial.print("Employees: ");
  Serial.println(employeeCount);
  Serial.println("==============================");


  // ===================================================
  // READY
  // ===================================================

  showReady();

  printMenu();
}


// =====================================================
//                       LOOP
// =====================================================

void loop()
{

  // ===================================================
  // SERIAL COMMANDS
  // ===================================================

  if (Serial.available())
  {
    char command = Serial.read();

    while (Serial.available())
      Serial.read();


    switch (command)
    {

      // -----------------------------------------------
      // REGISTER
      // -----------------------------------------------

      case 'R':
      case 'r':
        registerEmployee();
        break;


      // -----------------------------------------------
      // MANUAL FINGERPRINT SCAN
      // -----------------------------------------------

      case 'S':
      case 's':
        manualFingerprintScan();
        break;


      // -----------------------------------------------
      // DELETE ONE
      // -----------------------------------------------

      case 'D':
      case 'd':
        deleteFingerprint();
        break;


      // -----------------------------------------------
      // DELETE ALL
      // -----------------------------------------------

      case 'A':
      case 'a':
        deleteAllFingerprints();
        break;


      // -----------------------------------------------
      // INFORMATION
      // -----------------------------------------------

      case 'I':
      case 'i':
        showInformation();
        break;


      // -----------------------------------------------
      // RTC TIME
      // -----------------------------------------------

      case 'T':
      case 't':
        showRTCStatus();
        break;


      // -----------------------------------------------
      // SET RTC
      // -----------------------------------------------

      case 'C':
      case 'c':
        setRTCFromCompileTime();
        break;


      // -----------------------------------------------
      // MENU
      // -----------------------------------------------

      case 'M':
      case 'm':
        printMenu();
        break;


      default:

        Serial.println("Invalid command!");

        printMenu();

        break;
    }
  }


  // ===================================================
  // AUTOMATIC RFID ATTENDANCE
  // ===================================================

  checkRFID();


  // ===================================================
  // AUTOMATIC FINGERPRINT ATTENDANCE
  // ===================================================

  checkFingerprint();
}


// =====================================================
//             INITIALIZE DS3231 RTC
// =====================================================

bool initializeRTC()
{
  if (!rtc.begin())
  {
    Serial.println("RTC NOT FOUND!");
    Serial.println("Check SDA/SCL/VCC/GND wiring.");

    lcd.clear();

    lcd.setCursor(0, 0);
    lcd.print("RTC ERROR");

    lcd.setCursor(0, 1);
    lcd.print("Not Detected");

    delay(2000);

    return false;
  }


  Serial.println("DS3231 RTC DETECTED");


  // ===================================================
  // CHECK RTC POWER STATUS
  // ===================================================

  if (rtc.lostPower())
  {
    Serial.println("WARNING: RTC LOST POWER!");
    Serial.println("RTC time may be incorrect.");

    lcd.clear();

    lcd.setCursor(0, 0);
    lcd.print("RTC Battery");

    lcd.setCursor(0, 1);
    lcd.print("Check Time");

    delay(2000);
  }
  else
  {
    Serial.println("RTC BACKUP POWER OK");
  }


  // ===================================================
  // PRINT CURRENT RTC TIME
  // ===================================================

  Serial.print("RTC Date: ");
  Serial.println(getDateString());

  Serial.print("RTC Time: ");
  Serial.println(getTimeString());


  return true;
}


// =====================================================
//                 RTC STATUS
// =====================================================

void showRTCStatus()
{
  Serial.println();
  Serial.println("==============================");
  Serial.println("        DS3231 RTC");
  Serial.println("==============================");


  if (!rtc.begin())
  {
    Serial.println("RTC STATUS: NOT WORKING");
    Serial.println("DS3231 NOT DETECTED");

    lcd.clear();

    lcd.setCursor(0, 0);
    lcd.print("RTC NOT FOUND");

    lcd.setCursor(0, 1);
    lcd.print("Check Wiring");

    delay(2000);

    showReady();

    return;
  }


  Serial.println("RTC STATUS: WORKING");


  if (rtc.lostPower())
  {
    Serial.println("RTC WARNING: LOST POWER");
    Serial.println("Time may need to be set.");
  }
  else
  {
    Serial.println("RTC BACKUP: OK");
  }


  DateTime now = rtc.now();


  Serial.print("Date: ");

  if (now.day() < 10)
    Serial.print("0");

  Serial.print(now.day());

  Serial.print("/");

  if (now.month() < 10)
    Serial.print("0");

  Serial.print(now.month());

  Serial.print("/");

  Serial.println(now.year());


  Serial.print("Time: ");

  if (now.hour() < 10)
    Serial.print("0");

  Serial.print(now.hour());

  Serial.print(":");

  if (now.minute() < 10)
    Serial.print("0");

  Serial.print(now.minute());

  Serial.print(":");

  if (now.second() < 10)
    Serial.print("0");

  Serial.println(now.second());


  Serial.println("==============================");


  // LCD

  lcd.clear();

  lcd.setCursor(0, 0);

  if (now.day() < 10)
    lcd.print("0");

  lcd.print(now.day());

  lcd.print("/");

  if (now.month() < 10)
    lcd.print("0");

  lcd.print(now.month());

  lcd.print("/");

  lcd.print(now.year() % 100);


  lcd.setCursor(0, 1);

  if (now.hour() < 10)
    lcd.print("0");

  lcd.print(now.hour());

  lcd.print(":");

  if (now.minute() < 10)
    lcd.print("0");

  lcd.print(now.minute());

  lcd.print(":");

  if (now.second() < 10)
    lcd.print("0");

  lcd.print(now.second());


  delay(3000);

  showReady();
}


// =====================================================
//           SET RTC FROM COMPILE TIME
// =====================================================

void setRTCFromCompileTime()
{
  if (!rtc.begin())
  {
    Serial.println("RTC NOT FOUND!");

    lcd.clear();

    lcd.setCursor(0, 0);
    lcd.print("RTC ERROR");

    lcd.setCursor(0, 1);
    lcd.print("Not Detected");

    delay(1500);

    showReady();

    return;
  }


  /*
     This sets the DS3231 to the time at which
     this program was compiled.

     IMPORTANT:
     Upload the code immediately after compiling
     if you want an accurate time.
  */

  rtc.adjust(
    DateTime(
      F(__DATE__),
      F(__TIME__)
    )
  );


  Serial.println();
  Serial.println("==============================");
  Serial.println("RTC TIME UPDATED");
  Serial.println("==============================");

  Serial.print("Date: ");
  Serial.println(getDateString());

  Serial.print("Time: ");
  Serial.println(getTimeString());

  Serial.println("==============================");


  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print("RTC Time Set");

  lcd.setCursor(0, 1);
  lcd.print(getTimeString());

  delay(2000);

  showReady();
}


// =====================================================
//                  GET DATE STRING
// =====================================================

String getDateString()
{
  if (!rtcOK && !rtc.begin())
    return "RTC ERROR";


  DateTime now =
    rtc.now();


  String date = "";


  if (now.day() < 10)
    date += "0";

  date += String(now.day());

  date += "/";


  if (now.month() < 10)
    date += "0";

  date += String(now.month());

  date += "/";


  date += String(now.year());


  return date;
}


// =====================================================
//                  GET TIME STRING
// =====================================================

String getTimeString()
{
  DateTime now =
    rtc.now();


  String time = "";


  if (now.hour() < 10)
    time += "0";

  time += String(now.hour());

  time += ":";


  if (now.minute() < 10)
    time += "0";

  time += String(now.minute());

  time += ":";


  if (now.second() < 10)
    time += "0";

  time += String(now.second());


  return time;
}


// =====================================================
//             SAVE DATABASE TO FLASH
// =====================================================

void saveDatabase()
{
  prefs.putInt("count", employeeCount);


  for (int i = 0; i < employeeCount; i++)
  {
    String index = String(i);


    prefs.putString(
      ("id" + index).c_str(),
      employees[i].employeeID
    );


    prefs.putString(
      ("name" + index).c_str(),
      employees[i].name
    );


    prefs.putInt(
      ("finger" + index).c_str(),
      employees[i].fingerprintID
    );


    prefs.putString(
      ("rfid" + index).c_str(),
      employees[i].rfidUID
    );


    prefs.putBool(
      ("hasrfid" + index).c_str(),
      employees[i].hasRFID
    );
  }


  Serial.println(
    "DATABASE SAVED TO ESP32 FLASH"
  );
}


// =====================================================
//             LOAD DATABASE FROM FLASH
// =====================================================

void loadDatabase()
{
  employeeCount =
    prefs.getInt(
      "count",
      0
    );


  if (employeeCount < 0)
    employeeCount = 0;


  if (employeeCount > MAX_EMPLOYEES)
    employeeCount = MAX_EMPLOYEES;


  for (int i = 0; i < employeeCount; i++)
  {
    String index = String(i);


    employees[i].employeeID =
      prefs.getString(
        ("id" + index).c_str(),
        ""
      );


    employees[i].name =
      prefs.getString(
        ("name" + index).c_str(),
        ""
      );


    employees[i].fingerprintID =
      prefs.getInt(
        ("finger" + index).c_str(),
        -1
      );


    employees[i].rfidUID =
      prefs.getString(
        ("rfid" + index).c_str(),
        ""
      );


    employees[i].hasRFID =
      prefs.getBool(
        ("hasrfid" + index).c_str(),
        false
      );
  }


  Serial.println();
  Serial.println("DATABASE LOADED");

  Serial.print("Employees loaded: ");
  Serial.println(employeeCount);
}


// =====================================================
//               CLEAR DATABASE
// =====================================================

void clearDatabase()
{
  prefs.clear();

  employeeCount = 0;


  for (int i = 0; i < MAX_EMPLOYEES; i++)
  {
    employees[i].employeeID = "";

    employees[i].name = "";

    employees[i].fingerprintID = -1;

    employees[i].rfidUID = "";

    employees[i].hasRFID = false;
  }


  Serial.println(
    "ESP32 DATABASE CLEARED"
  );
}


// =====================================================
//                  REGISTER EMPLOYEE
// =====================================================

void registerEmployee()
{
  if (employeeCount >= MAX_EMPLOYEES)
  {
    Serial.println("Database Full!");


    lcd.clear();

    lcd.setCursor(0, 0);
    lcd.print("Database Full");


    delay(1500);

    showReady();

    return;
  }


  String employeeID;
  String employeeName;


  // ===================================================
  // EMPLOYEE ID
  // ===================================================

  Serial.println();
  Serial.println("===== REGISTER =====");

  Serial.println(
    "Enter Employee ID:"
  );


  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print("Enter Emp ID");

  lcd.setCursor(0, 1);
  lcd.print("Serial Monitor");


  while (!Serial.available())
    delay(10);


  employeeID =
    Serial.readStringUntil('\n');

  employeeID.trim();


  if (employeeID.length() == 0)
  {
    Serial.println(
      "Invalid Employee ID"
    );

    showReady();

    return;
  }


  // ===================================================
  // EMPLOYEE NAME
  // ===================================================

  Serial.println(
    "Enter Employee Name:"
  );


  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print("Enter Name");

  lcd.setCursor(0, 1);
  lcd.print("Serial Monitor");


  while (!Serial.available())
    delay(10);


  employeeName =
    Serial.readStringUntil('\n');

  employeeName.trim();


  if (employeeName.length() == 0)
  {
    Serial.println(
      "Invalid Employee Name"
    );

    showReady();

    return;
  }


  // ===================================================
  // FIND FREE FINGERPRINT ID
  // ===================================================

  int fingerprintID =
    findFreeFingerprintID();


  if (fingerprintID == -1)
  {
    Serial.println(
      "No Finger ID"
    );


    lcd.clear();

    lcd.print("No Finger ID");


    delay(1500);

    showReady();

    return;
  }


  Serial.print("Finger ID: ");
  Serial.println(fingerprintID);


  // ===================================================
  // REGISTER FINGERPRINT
  // ===================================================

  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print("Place Finger");

  lcd.setCursor(0, 1);
  lcd.print("Scan 1");


  if (!enrollFingerprint(fingerprintID))
  {
    Serial.println(
      "Fingerprint failed!"
    );


    lcd.clear();

    lcd.print("Finger Failed");


    beepError();


    delay(1500);

    showReady();

    return;
  }


  // ===================================================
  // FINGERPRINT SAVED
  // ===================================================

  Serial.println(
    "Fingerprint Saved"
  );


  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print("Finger Saved");

  lcd.setCursor(0, 1);
  lcd.print("ID:");
  lcd.print(fingerprintID);


  beepSuccess();


  delay(1500);


  // ===================================================
  // ASK RFID
  // ===================================================

  Serial.println();

  Serial.println(
    "Add RFID?"
  );

  Serial.println(
    "1 = YES"
  );

  Serial.println(
    "2 = NO"
  );


  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print("Add RFID?");

  lcd.setCursor(0, 1);
  lcd.print("1=YES 2=NO");


  char choice = 0;


  while (
    choice != '1' &&
    choice != '2'
  )
  {

    if (Serial.available())
    {
      choice =
        Serial.read();


      while (Serial.available())
        Serial.read();
    }


    delay(10);
  }


  // ===================================================
  // INITIALIZE EMPLOYEE
  // ===================================================

  employees[employeeCount].employeeID =
    employeeID;


  employees[employeeCount].name =
    employeeName;


  employees[employeeCount].fingerprintID =
    fingerprintID;


  employees[employeeCount].rfidUID =
    "";


  employees[employeeCount].hasRFID =
    false;


  // ===================================================
  // RFID REGISTRATION
  // ===================================================

  if (choice == '1')
  {

    Serial.println();

    Serial.println(
      "Place RFID Card"
    );


    lcd.clear();

    lcd.setCursor(0, 0);
    lcd.print("Place RFID Card");

    lcd.setCursor(0, 1);
    lcd.print("Waiting...");


    String uid =
      waitForRFID();


    if (uid.length() > 0)
    {

      employees[employeeCount].rfidUID =
        uid;


      employees[employeeCount].hasRFID =
        true;


      Serial.print(
        "RFID UID: "
      );

      Serial.println(uid);


      lcd.clear();

      lcd.setCursor(0, 0);
      lcd.print("RFID Saved");

      lcd.setCursor(0, 1);
      lcd.print("Reg Complete");


      beepSuccess();


      delay(1500);
    }
    else
    {

      Serial.println(
        "RFID Timeout"
      );


      lcd.clear();

      lcd.setCursor(0, 0);
      lcd.print("RFID Timeout");

      lcd.setCursor(0, 1);
      lcd.print("Finger Saved");


      delay(1500);
    }
  }
  else
  {

    Serial.println(
      "RFID not assigned"
    );


    lcd.clear();

    lcd.setCursor(0, 0);
    lcd.print("No RFID");

    lcd.setCursor(0, 1);
    lcd.print("Finger Only");


    delay(1500);
  }


  // ===================================================
  // INCREMENT EMPLOYEE COUNT
  // ===================================================

  employeeCount++;


  // ===================================================
  // SAVE PERMANENTLY
  // ===================================================

  saveDatabase();


  // ===================================================
  // COMPLETE
  // ===================================================

  Serial.println();

  Serial.println(
    "=============================="
  );

  Serial.println(
    "EMPLOYEE REGISTERED"
  );

  Serial.println(
    "=============================="
  );


  Serial.print("ID: ");
  Serial.println(employeeID);


  Serial.print("Name: ");
  Serial.println(employeeName);


  Serial.print("Finger ID: ");
  Serial.println(fingerprintID);


  Serial.print("RFID: ");


  if (
    employees[employeeCount - 1].hasRFID
  )
  {
    Serial.println(
      employees[employeeCount - 1].rfidUID
    );
  }
  else
  {
    Serial.println("NONE");
  }


  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print("Registration");

  lcd.setCursor(0, 1);
  lcd.print("Complete");


  delay(2000);


  showReady();
}


// =====================================================
//             ENROLL FINGERPRINT
// =====================================================

bool enrollFingerprint(int id)
{
  int p = -1;


  // ===================================================
  // FIRST SCAN
  // ===================================================

  Serial.println(
    "Place finger"
  );


  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print("Place Finger");

  lcd.setCursor(0, 1);
  lcd.print("Scan 1");


  while (p != FINGERPRINT_OK)
  {

    p =
      finger.getImage();


    if (
      p == FINGERPRINT_OK
    )
    {
      Serial.println(
        "Scan 1 OK"
      );
    }

    else if (
      p == FINGERPRINT_NOFINGER
    )
    {
      delay(100);
    }

    else
    {
      return false;
    }
  }


  p =
    finger.image2Tz(1);


  if (
    p != FINGERPRINT_OK
  )
    return false;


  // ===================================================
  // REMOVE FINGER
  // ===================================================

  Serial.println(
    "Remove finger"
  );


  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print("Remove Finger");


  delay(1500);


  while (
    finger.getImage() !=
    FINGERPRINT_NOFINGER
  )
  {
    delay(100);
  }


  // ===================================================
  // SECOND SCAN
  // ===================================================

  Serial.println(
    "Place same finger"
  );


  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print("Place Finger");

  lcd.setCursor(0, 1);
  lcd.print("Scan 2");


  p = -1;


  while (p != FINGERPRINT_OK)
  {

    p =
      finger.getImage();


    if (
      p == FINGERPRINT_OK
    )
    {
      Serial.println(
        "Scan 2 OK"
      );
    }

    else if (
      p == FINGERPRINT_NOFINGER
    )
    {
      delay(100);
    }

    else
    {
      return false;
    }
  }


  p =
    finger.image2Tz(2);


  if (
    p != FINGERPRINT_OK
  )
    return false;


  // ===================================================
  // CREATE MODEL
  // ===================================================

  Serial.println(
    "Creating model"
  );


  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print("Creating Model");


  p =
    finger.createModel();


  if (
    p != FINGERPRINT_OK
  )
    return false;


  // ===================================================
  // STORE MODEL IN R307S
  // ===================================================

  p =
    finger.storeModel(id);


  if (
    p == FINGERPRINT_OK
  )
    return true;


  return false;
}


// =====================================================
//                  WAIT FOR RFID
// =====================================================

String waitForRFID()
{
  unsigned long startTime =
    millis();


  while (
    millis() - startTime < 15000
  )
  {

    if (
      rfid.PICC_IsNewCardPresent() &&
      rfid.PICC_ReadCardSerial()
    )
    {

      String uid = "";


      for (
        byte i = 0;
        i < rfid.uid.size;
        i++
      )
      {

        if (i > 0)
          uid += " ";


        if (
          rfid.uid.uidByte[i] < 0x10
        )
          uid += "0";


        uid += String(
          rfid.uid.uidByte[i],
          HEX
        );
      }


      uid.toUpperCase();


      rfid.PICC_HaltA();

      rfid.PCD_StopCrypto1();


      return uid;
    }


    delay(50);
  }


  return "";
}


// =====================================================
//                  RFID ATTENDANCE
// =====================================================

void checkRFID()
{

  if (
    !rfid.PICC_IsNewCardPresent()
  )
    return;


  if (
    !rfid.PICC_ReadCardSerial()
  )
    return;


  String uid = "";


  for (
    byte i = 0;
    i < rfid.uid.size;
    i++
  )
  {

    if (i > 0)
      uid += " ";


    if (
      rfid.uid.uidByte[i] < 0x10
    )
      uid += "0";


    uid += String(
      rfid.uid.uidByte[i],
      HEX
    );
  }


  uid.toUpperCase();


  Serial.print(
    "RFID UID: "
  );

  Serial.println(uid);


  int index =
    findEmployeeByRFID(uid);


  if (index >= 0)
  {

    markAttendance(
      index,
      "RFID"
    );
  }
  else
  {

    Serial.println(
      "RFID NOT REGISTERED"
    );


    lcd.clear();

    lcd.setCursor(0, 0);
    lcd.print("Unknown RFID");

    lcd.setCursor(0, 1);
    lcd.print("Access Denied");


    beepError();


    delay(1500);


    showReady();
  }


  rfid.PICC_HaltA();

  rfid.PCD_StopCrypto1();
}


// =====================================================
//              FIND EMPLOYEE BY RFID
// =====================================================

int findEmployeeByRFID(
  String uid
)
{

  for (
    int i = 0;
    i < employeeCount;
    i++
  )
  {

    if (
      employees[i].hasRFID &&
      employees[i].rfidUID == uid
    )
    {
      return i;
    }
  }


  return -1;
}


// =====================================================
//              FINGERPRINT ATTENDANCE
// =====================================================

void checkFingerprint()
{

  uint8_t p =
    finger.getImage();


  if (
    p == FINGERPRINT_NOFINGER
  )
    return;


  if (
    p != FINGERPRINT_OK
  )
    return;


  Serial.println(
    "Fingerprint detected"
  );


  p =
    finger.image2Tz();


  if (
    p != FINGERPRINT_OK
  )
  {

    beepError();

    return;
  }


  p =
    finger.fingerSearch();


  if (
    p == FINGERPRINT_OK
  )
  {

    int fingerprintID =
      finger.fingerID;


    Serial.print(
      "Fingerprint ID: "
    );

    Serial.println(
      fingerprintID
    );


    int index =
      findEmployeeByFingerprint(
        fingerprintID
      );


    if (
      index >= 0
    )
    {

      markAttendance(
        index,
        "FINGER"
      );
    }
    else
    {

      lcd.clear();

      lcd.setCursor(0, 0);
      lcd.print("Unknown Finger");

      lcd.setCursor(0, 1);
      lcd.print("Not Registered");


      beepError();


      delay(1500);


      showReady();
    }
  }
  else
  {

    Serial.println(
      "Fingerprint NOT FOUND"
    );


    lcd.clear();

    lcd.setCursor(0, 0);
    lcd.print("Finger Not");

    lcd.setCursor(0, 1);
    lcd.print("Recognized");


    beepError();


    delay(1200);


    showReady();
  }


  // ===================================================
  // WAIT FOR FINGER REMOVAL
  // ===================================================

  unsigned long start =
    millis();


  while (
    finger.getImage() !=
    FINGERPRINT_NOFINGER
  )
  {

    delay(50);


    if (
      millis() - start > 5000
    )
      break;
  }
}


// =====================================================
//       FIND EMPLOYEE BY FINGERPRINT ID
// =====================================================

int findEmployeeByFingerprint(
  int fingerprintID
)
{

  for (
    int i = 0;
    i < employeeCount;
    i++
  )
  {

    if (
      employees[i].fingerprintID ==
      fingerprintID
    )
    {
      return i;
    }
  }


  return -1;
}


// =====================================================
//                 MARK ATTENDANCE
// =====================================================

void markAttendance(
  int index,
  String method
)
{

  // ===================================================
  // PREVENT DUPLICATE SCAN
  // ===================================================

  if (
    millis() - lastAttendanceTime <
    ATTENDANCE_COOLDOWN
  )
  {
    return;
  }


  lastAttendanceTime =
    millis();


  String name =
    employees[index].name;


  String empID =
    employees[index].employeeID;


  // ===================================================
  // GET RTC TIME
  // ===================================================

  String currentDate = "RTC ERROR";

  String currentTime = "RTC ERROR";


  if (rtcOK)
  {
    currentDate =
      getDateString();

    currentTime =
      getTimeString();
  }


  // ===================================================
  // SERIAL OUTPUT
  // ===================================================

  Serial.println();

  Serial.println(
    "================================"
  );

  Serial.println(
    "       ATTENDANCE MARKED"
  );

  Serial.println(
    "================================"
  );


  Serial.print(
    "Employee: "
  );

  Serial.println(name);


  Serial.print(
    "ID: "
  );

  Serial.println(empID);


  Serial.print(
    "Method: "
  );

  Serial.println(method);


  Serial.print(
    "Date: "
  );

  Serial.println(currentDate);


  Serial.print(
    "Time: "
  );

  Serial.println(currentTime);


  Serial.println(
    "================================"
  );


  // ===================================================
  // LCD
  // ===================================================

  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print("Attendance OK");


  lcd.setCursor(0, 1);


  if (name.length() > 16)
  {
    lcd.print(
      name.substring(0, 16)
    );
  }
  else
  {
    lcd.print(name);
  }


  // ===================================================
  // SUCCESS BEEP
  // ===================================================

  beepSuccess();


  delay(2000);


  showReady();
}


// =====================================================
//             FIND FREE FINGERPRINT ID
// =====================================================

int findFreeFingerprintID()
{

  for (
    int id = 1;
    id <= 127;
    id++
  )
  {

    if (
      finger.loadModel(id) !=
      FINGERPRINT_OK
    )
    {
      return id;
    }
  }


  return -1;
}


// =====================================================
//             DELETE FINGERPRINT
// =====================================================

void deleteFingerprint()
{

  int id;


  Serial.println(
    "Enter Finger ID:"
  );


  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print("Delete Finger");

  lcd.setCursor(0, 1);
  lcd.print("Enter ID");


  while (!Serial.available())
    delay(10);


  id =
    Serial.parseInt();


  while (Serial.available())
    Serial.read();


  if (
    id < 1 ||
    id > 127
  )
  {

    Serial.println(
      "Invalid ID"
    );


    showReady();

    return;
  }


  // ===================================================
  // DELETE FROM R307S
  // ===================================================

  int p =
    finger.deleteModel(id);


  if (
    p == FINGERPRINT_OK
  )
  {

    Serial.println(
      "Fingerprint Deleted"
    );


    int foundIndex = -1;


    // =================================================
    // FIND EMPLOYEE
    // =================================================

    for (
      int i = 0;
      i < employeeCount;
      i++
    )
    {

      if (
        employees[i].fingerprintID ==
        id
      )
      {
        foundIndex = i;

        break;
      }
    }


    // =================================================
    // REMOVE EMPLOYEE
    // =================================================

    if (foundIndex >= 0)
    {

      for (
        int i = foundIndex;
        i < employeeCount - 1;
        i++
      )
      {
        employees[i] =
          employees[i + 1];
      }


      employeeCount--;


      employees[employeeCount].employeeID =
        "";

      employees[employeeCount].name =
        "";

      employees[employeeCount].fingerprintID =
        -1;

      employees[employeeCount].rfidUID =
        "";

      employees[employeeCount].hasRFID =
        false;


      // SAVE

      saveDatabase();


      Serial.println(
        "Employee database updated"
      );
    }


    lcd.clear();

    lcd.setCursor(0, 0);
    lcd.print("Finger Deleted");

    lcd.setCursor(0, 1);
    lcd.print("Database Updated");


    beepSuccess();


    delay(1500);


    showReady();
  }
  else
  {

    Serial.println(
      "Delete Failed"
    );


    lcd.clear();

    lcd.setCursor(0, 0);
    lcd.print("Delete Failed");


    beepError();


    delay(1500);


    showReady();
  }
}


// =====================================================
//              DELETE ALL FINGERPRINTS
// =====================================================

void deleteAllFingerprints()
{

  Serial.println();

  Serial.println(
    "WARNING!"
  );

  Serial.println(
    "This will delete:"
  );

  Serial.println(
    "1. ALL fingerprints"
  );

  Serial.println(
    "2. ALL employee data"
  );

  Serial.println(
    "3. ALL RFID associations"
  );

  Serial.println();

  Serial.println(
    "Type YES to delete ALL:"
  );


  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print("Delete ALL?");

  lcd.setCursor(0, 1);
  lcd.print("Type YES");


  while (!Serial.available())
    delay(10);


  String confirmation =
    Serial.readStringUntil('\n');


  confirmation.trim();


  if (
    confirmation != "YES"
  )
  {

    Serial.println(
      "Cancelled"
    );


    lcd.clear();

    lcd.setCursor(0, 0);
    lcd.print("Delete Cancel");


    delay(1200);


    showReady();

    return;
  }


  // ===================================================
  // DELETE ALL FROM R307S
  // ===================================================

  int p =
    finger.emptyDatabase();


  if (
    p == FINGERPRINT_OK
  )
  {

    Serial.println(
      "ALL FINGERPRINTS DELETED"
    );


    // =================================================
    // CLEAR ESP32 DATABASE
    // =================================================

    clearDatabase();


    lcd.clear();

    lcd.setCursor(0, 0);
    lcd.print("All Deleted");

    lcd.setCursor(0, 1);
    lcd.print("Database Clear");


    beepSuccess();


    delay(1500);


    showReady();
  }
  else
  {

    Serial.println(
      "Delete Failed"
    );


    lcd.clear();

    lcd.setCursor(0, 0);
    lcd.print("Delete Failed");


    beepError();


    delay(1500);


    showReady();
  }
}


// =====================================================
//             MANUAL FINGERPRINT SCAN
// =====================================================

void manualFingerprintScan()
{

  Serial.println(
    "Place finger..."
  );


  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print("Place Finger");

  lcd.setCursor(0, 1);
  lcd.print("Scanning...");


  unsigned long start =
    millis();


  while (
    finger.getImage() !=
    FINGERPRINT_OK
  )
  {

    delay(50);


    if (
      millis() - start > 10000
    )
    {

      lcd.clear();

      lcd.setCursor(0, 0);
      lcd.print("Scan Timeout");


      delay(1200);


      showReady();

      return;
    }
  }


  if (
    finger.image2Tz() !=
    FINGERPRINT_OK
  )
  {

    beepError();

    showReady();

    return;
  }


  if (
    finger.fingerSearch() ==
    FINGERPRINT_OK
  )
  {

    int id =
      finger.fingerID;


    int index =
      findEmployeeByFingerprint(id);


    if (
      index >= 0
    )
    {

      markAttendance(
        index,
        "FINGER"
      );
    }
    else
    {

      lcd.clear();

      lcd.setCursor(0, 0);
      lcd.print("Unknown Finger");

      lcd.setCursor(0, 1);
      lcd.print("Not Registered");


      beepError();


      delay(1500);


      showReady();
    }
  }
  else
  {

    lcd.clear();

    lcd.setCursor(0, 0);
    lcd.print("Finger Not");

    lcd.setCursor(0, 1);
    lcd.print("Recognized");


    beepError();


    delay(1200);


    showReady();
  }
}


// =====================================================
//                 EMPLOYEE INFORMATION
// =====================================================

void showInformation()
{

  Serial.println();

  Serial.println(
    "=============================="
  );

  Serial.println(
    "EMPLOYEE INFORMATION"
  );

  Serial.println(
    "=============================="
  );


  Serial.print(
    "Total Employees: "
  );

  Serial.println(
    employeeCount
  );


  for (
    int i = 0;
    i < employeeCount;
    i++
  )
  {

    Serial.println();


    Serial.print(
      "Employee: "
    );

    Serial.println(
      employees[i].name
    );


    Serial.print(
      "ID: "
    );

    Serial.println(
      employees[i].employeeID
    );


    Serial.print(
      "Finger ID: "
    );

    Serial.println(
      employees[i].fingerprintID
    );


    Serial.print(
      "RFID: "
    );


    if (
      employees[i].hasRFID
    )
    {
      Serial.println(
        employees[i].rfidUID
      );
    }
    else
    {
      Serial.println(
        "NONE"
      );
    }
  }


  Serial.println();

  Serial.println(
    "=============================="
  );
}


// =====================================================
//                    READY SCREEN
// =====================================================

void showReady()
{

  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print("Scan RFID or");

  lcd.setCursor(0, 1);
  lcd.print("Fingerprint");
}


// =====================================================
//                  SUCCESS BEEP
// =====================================================

void beepSuccess()
{

  digitalWrite(
    BUZZER_PIN,
    BUZZER_ON
  );

  delay(120);


  digitalWrite(
    BUZZER_PIN,
    BUZZER_OFF
  );

  delay(100);


  digitalWrite(
    BUZZER_PIN,
    BUZZER_ON
  );

  delay(120);


  digitalWrite(
    BUZZER_PIN,
    BUZZER_OFF
  );
}


// =====================================================
//                    ERROR BEEP
// =====================================================

void beepError()
{

  digitalWrite(
    BUZZER_PIN,
    BUZZER_ON
  );

  delay(400);


  digitalWrite(
    BUZZER_PIN,
    BUZZER_OFF
  );
}


// =====================================================
//                       MENU
// =====================================================

void printMenu()
{

  Serial.println();

  Serial.println(
    "================================"
  );

  Serial.println(
    " EMPLOYEE ATTENDANCE SYSTEM"
  );

  Serial.println(
    "================================"
  );

  Serial.println(
    "R = Register Employee"
  );

  Serial.println(
    "S = Fingerprint Scan"
  );

  Serial.println(
    "D = Delete Fingerprint"
  );

  Serial.println(
    "A = Delete ALL"
  );

  Serial.println(
    "I = Employee Information"
  );

  Serial.println(
    "T = Check RTC"
  );

  Serial.println(
    "C = Set RTC Time"
  );

  Serial.println(
    "M = Show Menu"
  );

  Serial.println(
    "================================"
  );
}