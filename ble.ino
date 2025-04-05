#include <M5StickCPlus.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEBeacon.h>
#include <BLEAdvertising.h>

BLEAdvertising *advertising;
std::string defaultMessage = "";
bool emergencyActive = false;
unsigned long lastEmergencyToggle = 0;

void setAdvertisingInterval(uint16_t interval_ms) {
  // Convert ms to BLE units (0.625ms increments)
  uint16_t interval_units = interval_ms / 0.625;
  
  // Set advertising interval
  advertising->setMinInterval(interval_units);
  advertising->setMaxInterval(interval_units);
}

void setup() {
  M5.begin();
  Serial.begin(9600);
  
  // Initialize display
  M5.Lcd.setRotation(3);
  M5.Lcd.fillScreen(BLACK);
  M5.Lcd.setTextSize(2);
  M5.Lcd.setTextColor(WHITE);
  
  // Initialize BLE
  BLEDevice::init("Person2_M5");
  BLEBeacon beacon;
  beacon.setManufacturerId(0x004C);
  beacon.setProximityUUID(BLEUUID("12345678-1234-1234-1234-1234567890ab"));
  beacon.setMajor(1);
  beacon.setMinor(1);
  beacon.setSignalPower(-59);

  advertising = BLEDevice::getAdvertising();
  BLEAdvertisementData advertisementData;
  advertisementData.setFlags(0x04);
  advertisementData.setManufacturerData(defaultMessage);
  advertising->setAdvertisementData(advertisementData);
  setAdvertisingInterval(300);  // Add this line
  advertising->start();

  // Draw initial UI
  redrawFullUI();
  Serial.println("BLE Beacon started");
}

void redrawFullUI() {
  // Clear entire screen
  M5.Lcd.fillScreen(BLACK);
  
  // Draw header
  M5.Lcd.fillRect(0, 0, M5.Lcd.width(), 30, emergencyActive ? RED : BLUE);
  M5.Lcd.setTextColor(WHITE);
  M5.Lcd.setTextDatum(TC_DATUM);
  M5.Lcd.drawString(emergencyActive ? "EMERGENCY MODE" : "BLE Beacon", M5.Lcd.width()/2, 5, 2);
  
  // Draw button labels
  M5.Lcd.setTextDatum(TL_DATUM);
  M5.Lcd.setTextColor(CYAN);
  M5.Lcd.drawString("A: Emergency", 10, 35, 2);
  M5.Lcd.drawString("B: Cancel", 10, 60, 2);
  
  // Draw status line
  M5.Lcd.drawLine(0, 85, M5.Lcd.width(), 85, DARKGREY);
  M5.Lcd.setTextColor(WHITE);
  M5.Lcd.drawString("Status:", 10, 90, 2);
  
  // Draw status
  M5.Lcd.setTextColor(emergencyActive ? RED : GREEN);
  M5.Lcd.drawString(emergencyActive ? "ACTIVE!" : "Standby", 90, 90, 2);
}

void toggleEmergency(bool active) {
  if (millis() - lastEmergencyToggle < 500) return; // Debounce
  
  emergencyActive = active;
  lastEmergencyToggle = millis();
  
  const char* customMessage = active ? "emergency" : "no emergency";
  uint8_t message[31];
  memset(message, 0, sizeof(message));
  memcpy(message, customMessage, strlen(customMessage));
  
  std::string messageString(reinterpret_cast<char*>(message), strlen(customMessage));
  
  BLEAdvertisementData newAdvertisementData;
  newAdvertisementData.setFlags(0x04);
  newAdvertisementData.setManufacturerData(messageString);
  advertising->setAdvertisementData(newAdvertisementData);
  
  // Completely redraw UI
  redrawFullUI();
  
  Serial.println(active ? "Emergency activated" : "Emergency deactivated");
}

void loop() {
  M5.update();
  
  // Button handling
  if (M5.BtnA.wasPressed()) toggleEmergency(true);
  if (M5.BtnB.wasPressed()) toggleEmergency(false);
  
  delay(10);
}