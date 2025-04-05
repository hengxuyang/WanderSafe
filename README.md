# WanderSafe

A comprehensive IoT monitoring system designed to enhance the safety and well-being of elderly individuals through real-time tracking and emergency detection.

## Overview

WanderSafe combines hardware sensors (M5StickCPlus devices) with a web-based dashboard to provide caregivers with real-time information about elderly individuals' location, movement, and emergency situations. The system uses BLE beacons for location tracking and ultrasonic sensors for movement detection.

## Devices
- **Room Sensors**: Flash mqtt.ino for the room sensors. change the room name in the deviceID and topics.
- **BLE Wearable**: Flash ble.ino into the other M5StickC Plus to allow them advertise using BLE.



## Features

- **Real-time Location Tracking**: Monitors the location of individuals within different rooms using BLE beacons
- **Movement Detection**: Uses ultrasonic sensors to detect movement and trigger alerts if no movement is detected for a specified period
- **Emergency Alerts**: Provides immediate notifications for emergency situations
- **Web Dashboard**: Displays all sensor data and alerts in an intuitive interface
- **Room-based Organization**: Organizes sensors and beacons by room for easy monitoring
- **Authentication**: Secure login system to protect sensitive information

## System Components

### Hardware

- **M5StickCPlus Devices**: Portable IoT devices that function as both BLE scanners and ultrasonic sensor controllers
- **Ultrasonic Sensors**: Detect movement and measure distances
- **BLE Beacons**: Wearable devices that broadcast their presence for location tracking

### Software

- **Node.js Server**: Handles data processing, storage, and communication
- **MQTT Protocol**: Enables communication between M5StickCPlus devices and the server
- **Socket.IO**: Provides real-time updates to the web dashboard
- **Web Dashboard**: Displays sensor data and alerts in a user-friendly interface

## Getting Started

### Prerequisites

- Node.js (v12 or higher)
- Arduino IDE with ESP32 support
- M5StickCPlus devices
- Ultrasonic sensors (HC-SR04 or similar)
- BLE beacons

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/WanderSafe.git
   cd WanderSafe
   ```

2. Install server dependencies:
   ```
   npm install
   ```

3. Configure the MQTT settings in `server.js` and `mqtt.ino` to match your MQTT broker.

4. Upload the Arduino code to your M5StickCPlus devices:
   - Open `mqtt.ino` in Arduino IDE
   - Configure WiFi credentials and MQTT settings
   - Upload to your M5StickCPlus device

5. Start the server:
   ```
   node server.js
   ```

6. Access the dashboard at `http://localhost:3001`

## Usage

1. **Login**: Access the dashboard using the default credentials (username: admin, password: admin123)
2. **Dashboard**: View all rooms, sensors, and beacons in real-time
3. **Alerts**: Receive immediate notifications for emergency situations
4. **Room Management**: Add or modify rooms as needed
5. **Sensor Management**: Add or modify sensors as needed

## Emergency Detection

The system detects emergencies in two ways:

1. **BLE Emergency Button**: When pressed on a wearable device, it triggers an immediate emergency alert
2. **Movement Detection**: If no movement is detected for a specified period (default: 15 minutes), the system triggers an emergency alert

## Project Structure

```
WanderSafe/
├── server.js                 # Main server file
├── package.json              # Node.js dependencies
├── mqtt.ino                  # Arduino code for M5StickCPlus
├── ble.ino                   # Arduino code for BLE beacons
├── public/                   # Web dashboard files
│   ├── index.html            # Dashboard HTML
│   ├── login.html            # Login page
│   ├── css/                  # CSS styles
│   │   └── style.css         # Main stylesheet
│   ├── js/                   # JavaScript files
│   │   └── dashboard.js      # Dashboard functionality
│   └── sounds/               # Alert sounds
│       └── alert.mp3         # Emergency alert sound
└── server/                   # Server-side code
    ├── models/               # Data models
    └── routes/               # API routes
```

## Customization

### Adjusting Movement Detection Timeout

To change how long the system waits before triggering a movement emergency:

1. Open `mqtt.ino`
2. Locate the line: `const unsigned long MOVEMENT_TIMEOUT = 900000; // 15 minutes`
3. Adjust the value (in milliseconds) as needed
4. Upload the updated code to your M5StickCPlus device

### Adding Rooms

Rooms can be added through the web dashboard or by modifying the `db.rooms` array in `server.js`.

## Troubleshooting

### Sensor Not Appearing on Dashboard

If a sensor is not appearing on the dashboard:

1. Check MQTT connection in the M5StickCPlus display
2. Verify the MQTT broker address and credentials
3. Check the browser console for any errors
4. Restart the server and the M5StickCPlus device

### Emergency Alerts Not Triggering

If emergency alerts are not triggering:

1. Check that the M5StickCPlus is properly connected to WiFi and MQTT
2. Verify that the ultrasonic sensor is properly connected
3. Check the movement detection threshold in the code
