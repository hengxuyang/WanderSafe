#include <M5StickCPlus.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <BLEDevice.h>

// Define ultrasonic sensor pins
const int triggerPin = 32;  // GPIO 32 for trigger
const int echoPin = 33;     // GPIO 33 for echo
BLEUUID targetUUID("12345678-1234-1234-1234-1234567890ab"); // Replace with your desired UUID

// MQTT parameters
const char* mqttServer = "172.20.10.5";
const int mqttPort = 1883;
const char* mqttUser = "iot16";
const char* mqttPassword = "Iot&16";
const char* mqttTopic = "home/ultrasonic_distance";
const char* deviceID = "Bedroom_M5";  
const int max_block_distance = 200;

// WiFi credentials
const char* ssid = "sleepysheep";
const char* password = "123456789";

// BLE variables
String lastMessage = "";
bool emergencyState = false;
unsigned long lastEmergencyTime = 0;
const unsigned long emergencyTimeout = 30000; // 30 seconds emergency timeout

WiFiClient espClient;
PubSubClient mqttClient(espClient);

unsigned long lastMovementTime = 0;
const unsigned long MOVEMENT_TIMEOUT = 900000; // 15 minutes
bool movementEmergency = false;
int lastblock_distance = -1;

// Add this function to check for movement emergencies
void checkMovementEmergency(int currentblock_distance) {
  // Only proceed if we have a valid reading within range
  if (currentblock_distance > 0 && currentblock_distance < max_block_distance) {
    // Check if we have a previous reading to compare with
    if (lastblock_distance != -1) {
      // Significant movement detected (with noise threshold)
      if (abs(currentblock_distance - lastblock_distance) > 2) {
        Serial.printf("Movement detected: %d -> %d\n", lastblock_distance, currentblock_distance);
        lastMovementTime = millis();
        
        // Cancel movement emergency if active
        if (movementEmergency) {
          movementEmergency = false;
          emergencyState = false; // Clear the global emergency state
          Serial.println("Movement detected - emergency cleared");
          if (mqttClient.connected()) {
            // Send to movement topic
            String clearMsg = "{\"type\":\"movement_restored\",\"device\":\"" + String(deviceID) + "\"}";
            mqttClient.publish("homeassistant/emergency/movement", clearMsg.c_str());
            
            // Also send to the same emergency topic used by BLE
            String bleClearMsg = "{\"emergency\":false, \"uuid\":\"movement_sensor\", \"m5device\":\"" + String(deviceID) + "\"}";
            mqttClient.publish("homeassistant/ble/devices/bedroom/emergency", bleClearMsg.c_str());
            
            Serial.println("MQTT emergency cleared messages sent to both topics");
          }
          M5.Lcd.fillScreen(BLACK);
          updateDisplay(currentblock_distance, lastMessage, emergencyState);
        }
      }
    }
    lastblock_distance = currentblock_distance; // Always update the last distance
    
    // Check for timeout if no emergency is active
    if (!movementEmergency && (millis() - lastMovementTime > MOVEMENT_TIMEOUT)) {
      movementEmergency = true;
      emergencyState = true; // Set the global emergency state
      lastEmergencyTime = millis(); // Update the emergency time
      Serial.println("MOVEMENT EMERGENCY: No movement for 15 seconds!");
      
      // Visual alert
      M5.Lcd.fillScreen(RED);
      M5.Lcd.setTextColor(WHITE);
      M5.Lcd.drawString("NO MOVEMENT ALERT!", 10, 10, 2);
      M5.Lcd.drawString("15+ SECONDS", 10, 30, 2);
      
      // MQTT alert - send to both topics
      if (mqttClient.connected()) {
        // Send to movement topic
        String emergencyMsg = "{\"type\":\"no_movement\",\"duration\":15,\"device\":\"" + String(deviceID) + "\",\"distance\":" + String(currentblock_distance) + "}";
        mqttClient.publish("homeassistant/emergency/movement", emergencyMsg.c_str());
        
        // Also send to the same emergency topic used by BLE
        String bleEmergencyMsg = "{\"emergency\":true, \"uuid\":\"movement_sensor\", \"m5device\":\"" + String(deviceID) + "\"}";
        mqttClient.publish("homeassistant/ble/devices/bedroom/emergency", bleEmergencyMsg.c_str());
        
        Serial.println("MQTT emergency messages sent to both topics");
      } else {
        Serial.println("MQTT not connected - couldn't send emergency");
      }
    }
  } else {
    // Invalid or max distance reading - reset movement tracking
    lastblock_distance = -1;
    lastMovementTime = millis(); // Reset timer to prevent false positives
    
    if (movementEmergency) {
      // If we're in emergency but now getting invalid readings, cancel emergency
      movementEmergency = false;
      emergencyState = false; // Clear the global emergency state
      Serial.println("Invalid readings - emergency cleared");
      if (mqttClient.connected()) {
        // Send to movement topic
        String clearMsg = "{\"type\":\"invalid_readings\",\"device\":\"" + String(deviceID) + "\"}";
        mqttClient.publish("homeassistant/emergency/movement", clearMsg.c_str());
        
        // Also send to the same emergency topic used by BLE
        String bleClearMsg = "{\"emergency\":false, \"uuid\":\"movement_sensor\", \"m5device\":\"" + String(deviceID) + "\"}";
        mqttClient.publish("homeassistant/ble/devices/bedroom/emergency", bleClearMsg.c_str());
        
        Serial.println("MQTT emergency cleared messages sent to both topics");
      }
      M5.Lcd.fillScreen(BLACK);
      updateDisplay(currentblock_distance, lastMessage, emergencyState);
    }
  }
}

// Function to set up WiFi connection
void setupWiFi() {
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  
  int attempt = 0;
  while (WiFi.status() != WL_CONNECTED && attempt < 10) {
    delay(1000);
    Serial.print(".");
    attempt++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected");
    M5.Lcd.println("WiFi: Connected");
  } else {
    Serial.println("\nWiFi connection failed");
    M5.Lcd.println("WiFi: Failed");
  }
}

// Function to connect to MQTT broker
void connectMQTT() {
  int attempt = 0;
  while (!mqttClient.connected() && attempt < 10) {
    if (mqttClient.connect("M5StickCPlusClient", mqttUser, mqttPassword)) {
      Serial.println("MQTT connected");
    } else {
      Serial.print("MQTT connection failed. Attempt ");
      Serial.println(attempt + 1);
      delay(5000);
    }
    attempt++;
  }
}

// Function to update the display with current status
void updateDisplay(int block_distance, String message, bool emergency) {
  M5.Lcd.fillScreen(BLACK);
  M5.Lcd.setCursor(0, 0);
  
  // WiFi status
  M5.Lcd.print("WiFi: ");
  M5.Lcd.println(WiFi.status() == WL_CONNECTED ? "OK" : "X");
  
  // MQTT status
  M5.Lcd.print("MQTT: ");
  M5.Lcd.println(mqttClient.connected() ? "OK" : "X");
  
  // Distance reading
  M5.Lcd.print("block_distance: ");
  M5.Lcd.print(block_distance);
  M5.Lcd.println(" cm");
  
  // Message from beacon
  M5.Lcd.print("Message: ");
  M5.Lcd.println(message);
  
  // Emergency status
  if (emergency) {
    M5.Lcd.fillRect(0, M5.Lcd.height() - 20, M5.Lcd.width(), 20, RED);
    M5.Lcd.setTextColor(BLACK);
    M5.Lcd.setCursor(10, M5.Lcd.height() - 15);
    M5.Lcd.print("EMERGENCY!");
    M5.Lcd.setTextColor(WHITE);
  }else {

  }
}

void setup() {
  M5.begin();
  Serial.begin(9600);
  
  pinMode(triggerPin, OUTPUT);
  pinMode(echoPin, INPUT);

  M5.Lcd.setRotation(3);
  M5.Lcd.fillScreen(BLACK);
  M5.Lcd.setTextSize(1);
  M5.Lcd.setTextColor(WHITE);
  M5.Lcd.setCursor(0, 0);
  M5.Lcd.println("Initializing...");

  setupWiFi();
  mqttClient.setServer(mqttServer, mqttPort);
  connectMQTT();

  BLEDevice::init("M5StickC+ Proxy");
  updateDisplay(0, "Scanning...", false);
}

void loop() {
  M5.update();
  
  // Maintain connections
  if (WiFi.status() != WL_CONNECTED) setupWiFi();
  if (!mqttClient.connected()) connectMQTT();
  mqttClient.loop();

  // Ultrasonic measurement
  digitalWrite(triggerPin, LOW);
  delayMicroseconds(2);
  digitalWrite(triggerPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(triggerPin, LOW);

  long duration = pulseIn(echoPin, HIGH);
  int distance = 0;
  int block_distance = 0;

  if (duration > 0) {
    // Calculate the distance in centimeters
    distance = duration * 0.0344 / 2;
    block_distance = max_block_distance - distance;
    block_distance = max(0, block_distance); // Ensure block_distance isn't negative

    // Handle BLE emergency timeout
    if (emergencyState && (millis() - lastEmergencyTime > emergencyTimeout)) {
      emergencyState = false;
      lastMessage = "emergency cleared";
      Serial.println("BLE Emergency timeout");
      updateDisplay(block_distance, lastMessage, emergencyState);
    }

    // Check for movement emergency
    checkMovementEmergency(block_distance);

    // Publish distance data to MQTT
    // Always publish to both topics to ensure the dashboard always shows the sensor
    char msg[256];
    
    // Regular distance update for the original topic
    snprintf(msg, sizeof(msg), "{\"device_id\":\"%s\",\"block_distance\":%d,\"message\":\"%s\"}", 
             deviceID, block_distance, lastMessage.c_str());
    mqttClient.publish(mqttTopic, msg);
    
    // Also publish to the emergency movement topic with a type field
    // This ensures the sensor is always visible on the dashboard even when not in emergency
    String regularUpdateMsg = "{\"type\":\"regular_update\",\"device\":\"" + String(deviceID) + 
                             "\",\"distance\":" + String(block_distance) + 
                             ",\"message\":\"" + lastMessage + "\"}";
    mqttClient.publish("homeassistant/emergency/movement", regularUpdateMsg.c_str());
    
    updateDisplay(block_distance, lastMessage, emergencyState);
    lastblock_distance = block_distance;
  } else {
    // Handle no echo received
    M5.Lcd.fillRect(0, 60, M5.Lcd.width(), 20, BLACK);
    M5.Lcd.setCursor(0, 60);
    M5.Lcd.print("No echo received");
  }

  // BLE Scanning
  BLEScan* pBLEScan = BLEDevice::getScan();
  pBLEScan->setActiveScan(true);      // Request Scan Response packets
  pBLEScan->setInterval(100);         // Scan interval (ms) 
  pBLEScan->setWindow(99);            // Scan window (ms, <= interval)
  BLEScanResults foundDevices = pBLEScan->start(2, false); // Scan for 5 sec

  bool beaconFound = false;
  for (int i = 0; i < foundDevices.getCount(); i++) {
    BLEAdvertisedDevice device = foundDevices.getDevice(i);
    String deviceName = String(device.getName().c_str());
    String uuid = device.getAddress().toString().c_str();;
    int rssi = device.getRSSI();
    uuid.replace(":", ""); // Clean format for HA
    if (deviceName.length() >= 3 && deviceName.substring(deviceName.length() - 3) == "_M5") {
      
      beaconFound = true;
      std::string manufacturerData = device.getManufacturerData();
      String currentMessage = manufacturerData.length() > 0 ? 
                             String(manufacturerData.c_str()).substring(0, 31) : 
                             "No message";

      if (currentMessage != lastMessage) {
        lastMessage = currentMessage;
        
        if (lastMessage == "emergency") {
          emergencyState = true;
          lastEmergencyTime = millis();
          
          // Publish emergency to MQTT
          String emergencyTopic = "homeassistant/ble/devices/bedroom/emergency";
          String emergencyMsg = "{\"emergency\":true, \"uuid\":\"" + uuid + "\", \"m5device\":\"" + String(deviceID) + "\"}";
          mqttClient.publish(emergencyTopic.c_str(), emergencyMsg.c_str());
          
          Serial.println("Emergency alert triggered");
        } else if (lastMessage == "no emergency") {
          emergencyState = false;
          
          // Clear emergency state in MQTT
          String emergencyTopic = "homeassistant/ble/devices/bedroom/emergency";
          String emergencyMsg = "{\"emergency\":false, \"uuid\":\"" + uuid + "\", \"m5device\":\"" + String(deviceID) + "\"}";
          mqttClient.publish(emergencyTopic.c_str(), emergencyMsg.c_str());
          
          Serial.println("Emergency cleared due to change in button pressed");
        }
      }

      // Create a JSON payload per device
      String jsonPayload = "{\"m5device\":\"" + String(deviceID) + "\", \"deviceName\":\"" + deviceName + "\", \"rssi\":" + String(rssi) + ", \"uuid\":\"" + uuid + "\"}";

      // Publish to a unique topic per device (e.g., using MAC address)
      String deviceTopic = "homeassistant/ble/devices/bedroom/status";
      mqttClient.publish(deviceTopic.c_str(), jsonPayload.c_str());

      break; // Only process the first matching beacon
    }
  }
  delay(200);
}
