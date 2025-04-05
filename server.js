const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const mqtt = require('mqtt');
const http = require('http');
const socketIo = require('socket.io');
const bcrypt = require('bcrypt');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Create session middleware
const sessionMiddleware = session({
  secret: 'smart-elder-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 3600000 } // 1 hour
});

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(sessionMiddleware);

// Initialize Socket.IO with session sharing
const io = socketIo(server);
// Share session with Socket.IO
io.use((socket, next) => {
  sessionMiddleware(socket.request, socket.request.res || {}, next);
});

// Authentication middleware
function isAuthenticated(req, res, next) {
  // Check if user object exists in session
  if (req.session.user && (typeof req.session.user === 'string' || req.session.user.username)) {
    // Allow both old format (string username) and new format (user object)
    return next();
  }
  
  // Redirect to login for all other requests
  res.redirect('/login');
}

// Apply authentication to static files
app.use((req, res, next) => {
  // Skip authentication for login page and its resources
  if (req.path === '/login' || req.path === '/login.html' || req.path === '/css/style.css') {
    return next();
  }
  
  // Apply authentication middleware for all other static files
  isAuthenticated(req, res, next);
}, express.static(path.join(__dirname, 'public')));

// Simple in-memory database
const db = {
  users: [
    { username: 'admin', password: 'admin123' } // Simple plain text password for demo
  ],
  rooms: [
    { id: 1, name: 'Bedroom' },
    { id: 2, name: 'Living Room' },
    { id: 3, name: 'Bathroom' }
  ],
  sensors: [
    { id: 1, roomId: 1, name: 'Temperature Sensor', type: 'temperature', value: '22°C' }
  ],
  beacons: {}
};

// MQTT Client setup
const mqttClient = mqtt.connect('mqtt://172.20.10.5:1883', {
  username: 'iot16',
  password: 'Iot&16'
});

mqttClient.on('connect', () => {
  console.log('Connected to MQTT broker');
  
  // Subscribe to topics
  mqttClient.subscribe('homeassistant/emergency/movement');
  mqttClient.subscribe('homeassistant/ble/devices/+/emergency');
  mqttClient.subscribe('homeassistant/ble/devices/+/status');
  
  // Log subscribed topics
  console.log('Subscribed to MQTT topics:');
  console.log('- homeassistant/emergency/movement');
  console.log('- homeassistant/ble/devices/+/emergency');
  console.log('- homeassistant/ble/devices/+/status');
  console.log('(+ wildcard includes bedroom, bathroom, livingroom, etc.)');
});

mqttClient.on('message', (topic, message) => {
  console.log(`Received message on topic ${topic}: ${message.toString()}`);
  
  try {
    const payload = JSON.parse(message.toString());
    
    // Extract room from topic
    const topicParts = topic.split('/');
    const room = topicParts[3] || 'unknown';
    
    if (topic === 'homeassistant/emergency/movement') {
      // Handle ultrasonic sensor data with new MQTT format
      const messageType = payload.type;
      const deviceId = payload.device || payload.device_id;
      
      // Ensure we have a valid deviceId
      if (!deviceId) {
        console.error('No device ID found in payload:', payload);
        return;
      }
      
      console.log(`Received movement message type: ${messageType} from device: ${deviceId}`);
      
      // Create sensor if it doesn't exist yet
      const existingSensor = db.sensors.find(s => s.name === deviceId);
      if (!existingSensor) {
        console.log(`Creating new sensor for device: ${deviceId}`);
        // Try to find room ID from device ID
        let roomId = 1; // Default to first room
        const roomName = deviceId.split('_')[0];
        const room = db.rooms.find(r => r.name.toLowerCase() === roomName.toLowerCase());
        
        if (room) {
          roomId = room.id;
        }
        
        // Add new sensor
        const newId = db.sensors.length > 0 ? Math.max(...db.sensors.map(s => s.id)) + 1 : 1;
        db.sensors.push({
          id: newId,
          roomId: roomId,
          name: deviceId,
          type: 'block_distance',
          value: 0 // Default value
        });
        
        console.log(`Created new sensor: ${deviceId} in room ID: ${roomId}`);
      }
      
      if (messageType === 'no_movement') {
        // Handle no movement emergency
        const duration = payload.duration;
        const distance = payload.distance;
        
        // Update sensor data
        updateSensor(deviceId, 'block_distance', distance);
        
        // Emit emergency alert to all connected clients
        io.emit('movement_emergency', { 
          deviceId, 
          type: 'no_movement',
          duration,
          distance,
          timestamp: new Date().toISOString()
        });
        
        // Also emit regular sensor update
        io.emit('sensor_update', { 
          deviceId, 
          blockDistance: distance, 
          message: `No movement detected for ${duration} seconds!` 
        });
        
        console.log(`No movement emergency from ${deviceId}: No movement for ${duration} seconds`);
      } 
      else if (messageType === 'movement_restored') {
        // Handle movement restored
        // Emit emergency cleared to all connected clients
        io.emit('movement_emergency', { 
          deviceId, 
          type: 'cleared',
          message: 'Movement detected - emergency cleared',
          timestamp: new Date().toISOString()
        });
        
        // Also emit regular sensor update with a default value
        // This ensures the sensor stays visible on the dashboard
        io.emit('sensor_update', { 
          deviceId, 
          blockDistance: 0, // Default value
          message: 'Movement detected - emergency cleared' 
        });
        
        console.log(`Movement restored for device ${deviceId}`);
      }
      else if (messageType === 'invalid_readings') {
        // Handle invalid readings
        // Emit emergency cleared to all connected clients
        io.emit('movement_emergency', { 
          deviceId, 
          type: 'cleared',
          message: 'Invalid readings - emergency cleared',
          timestamp: new Date().toISOString()
        });
        
        // Also emit regular sensor update with a default value
        // This ensures the sensor stays visible on the dashboard
        io.emit('sensor_update', { 
          deviceId, 
          blockDistance: 0, // Default value
          message: 'Invalid readings - emergency cleared' 
        });
        
        console.log(`Invalid readings for device ${deviceId} - emergency cleared`);
      }
      else if (messageType === 'regular_update') {
        // Handle regular update
        const distance = payload.distance;
        const message = payload.message || '';
        
        // Update sensor data
        updateSensor(deviceId, 'block_distance', distance);
        
        // Emit to all connected clients
        io.emit('sensor_update', { 
          deviceId, 
          blockDistance: distance, 
          message: message 
        });
        
        console.log(`Regular update from ${deviceId}: distance=${distance}`);
      }
      else {
        // Handle legacy format or unknown message type
        const blockDistance = payload.block_distance;
        const message = payload.message;
        
        // Update sensor data if we have block_distance
        if (blockDistance !== undefined) {
          updateSensor(deviceId, 'block_distance', blockDistance);
          
          // Emit to all connected clients
          io.emit('sensor_update', { deviceId, blockDistance, message });
        }
      }
    } 
    else if (topic.includes('/emergency')) {
      // Handle emergency data
      const emergency = payload.emergency;
      let uuid = payload.uuid;
      const m5device = payload.m5device; // Extract m5device if present
      
      // If uuid is not provided, try to extract from topic
      if (!uuid && topic.includes('/devices/')) {
        const parts = topic.split('/');
        if (parts.length >= 4) {
          // Use the room as a fallback identifier
          uuid = parts[3];
        }
      }
      
      // Process both emergency true and false cases
      if (emergency) {
        console.log(`Emergency alert received for ${uuid || 'unknown device'} in ${room} from ${m5device || 'unknown M5 device'}`);
      } else {
        console.log(`Emergency cleared for ${uuid || 'unknown device'} in ${room} from ${m5device || 'unknown M5 device'}`);
      }
      
      // Update beacon emergency status with m5device information
      updateBeaconEmergency(uuid || 'unknown', room, emergency, m5device);
      
      // Emit emergency alert to all connected clients
      // The UI can use the 'emergency' flag to show or hide the emergency card
      io.emit('emergency_alert', { 
        uuid: uuid || 'unknown', 
        room, 
        emergency, 
        m5device,
        timestamp: new Date().toISOString()
      });
    }
    else if (topic.includes('/status')) {
      // Handle combined status data (deviceName, rssi, uuid, m5device)
      const deviceName = payload.deviceName;
      const rssi = payload.rssi;
      const uuid = payload.uuid;
      const m5device = payload.m5device;
      
      if (deviceName && rssi && uuid) {
        console.log(`Status update: ${deviceName} (${uuid}) with RSSI ${rssi} in ${room} from ${m5device || 'unknown device'}`);
        
        // Use UUID as the primary identifier for the beacon
        const beaconKey = uuid;
        
        // Map MQTT topic room names to database room names
        const mappedRoom = mapRoomName(room);
        
        // Update or create the beacon
        if (!db.beacons[beaconKey]) {
          // Create a new beacon
          db.beacons[beaconKey] = {
            name: deviceName,
            uuid: uuid,
            room: mappedRoom, // Use mapped room name
            emergency: false,
            lastSeen: new Date(),
            // Store RSSI values from different M5 devices
            rssiByDevice: {}
          };
        }
        
        // Update the beacon
        db.beacons[beaconKey].name = deviceName;
        db.beacons[beaconKey].lastSeen = new Date();
        
        // Store the RSSI value for this M5 device
        if (!db.beacons[beaconKey].rssiByDevice) {
          db.beacons[beaconKey].rssiByDevice = {};
        }
        db.beacons[beaconKey].rssiByDevice[m5device] = {
          rssi: rssi,
          room: mappedRoom, // Use mapped room name
          lastSeen: new Date()
        };
        
        // Determine the best room based on RSSI values from all M5 devices
        determineRoomFromRSSI(beaconKey);
        
        // Emit beacon update to all connected clients
        io.emit('beacon_update', { 
          deviceName, 
          uuid,
          room: db.beacons[beaconKey].room, // Use the determined room
          rssi: rssi,
          m5device
        });
        
        // Also emit a separate rssi_update event for clients that handle RSSI updates separately
        io.emit('rssi_update', { 
          uuid, 
          room: db.beacons[beaconKey].room,
          rssi: db.beacons[beaconKey].rssi, // Use the strongest RSSI value
          m5device
        });
      }
    }
    else {
      console.log(`Unknown topic: ${topic}`);
    }
  } catch (error) {
    console.error('Error processing MQTT message:', error);
  }
});

// Helper functions for updating data
function updateSensor(deviceId, type, value) {
  // Check if sensor exists
  const existingSensor = db.sensors.find(s => s.name === deviceId);
  
  if (existingSensor) {
    existingSensor.value = value;
  } else {
    // Try to find room ID from device ID
    let roomId = 1; // Default to first room
    const roomName = deviceId.split('_')[0];
    const room = db.rooms.find(r => r.name.toLowerCase() === roomName.toLowerCase());
    
    if (room) {
      roomId = room.id;
    }
    
    // Add new sensor
    const newId = db.sensors.length > 0 ? Math.max(...db.sensors.map(s => s.id)) + 1 : 1;
    db.sensors.push({
      id: newId,
      roomId: roomId,
      name: deviceId,
      type: type,
      value: value
    });
  }
}

// Helper function to map MQTT topic room names to database room names
function mapRoomName(room) {
  let mappedRoom = room;
  if (room === 'livingroom' || room === 'living_room') {
    mappedRoom = 'Living Room';
  } else if (room === 'bedroom') {
    mappedRoom = 'Bedroom';
  } else if (room === 'bathroom') {
    mappedRoom = 'Bathroom';
  }
  return mappedRoom;
}

// Helper function to find a beacon by name or UUID
function findBeacon(identifier) {
  // First check if the beacon exists with this identifier as key
  if (db.beacons[identifier]) {
    return identifier;
  }
  
  // Then check if any beacon has this identifier as name or uuid
  for (const key in db.beacons) {
    if (db.beacons[key].name === identifier || db.beacons[key].uuid === identifier) {
      return key;
    }
  }
  
  // Not found
  return null;
}

function updateBeaconName(deviceName, room, uuid = null, m5device = null) {
  // If we have a UUID, use it as the primary identifier
  // Otherwise, use the deviceName as the key
  const beaconKey = uuid || deviceName;
  
  // Map MQTT topic room names to database room names
  const mappedRoom = mapRoomName(room);
  
  // Try to find if this beacon already exists
  const existingKey = findBeacon(beaconKey);
  
  if (existingKey) {
    // Update existing beacon
    db.beacons[existingKey].name = deviceName;
    db.beacons[existingKey].lastSeen = new Date();
    
    // If we have m5device information, update the RSSI data for this device
    if (m5device) {
      if (!db.beacons[existingKey].rssiByDevice) {
        db.beacons[existingKey].rssiByDevice = {};
      }
      
      // Create or update the entry for this M5 device
      if (!db.beacons[existingKey].rssiByDevice[m5device]) {
        db.beacons[existingKey].rssiByDevice[m5device] = {
          rssi: 0, // Default RSSI
          room: mappedRoom, // Use mapped room name
          lastSeen: new Date()
        };
      } else {
        // Update the room and lastSeen for this M5 device
        db.beacons[existingKey].rssiByDevice[m5device].room = mappedRoom; // Use mapped room name
        db.beacons[existingKey].rssiByDevice[m5device].lastSeen = new Date();
      }
    } else {
      // If no m5device is specified, just update the room
      db.beacons[existingKey].room = mappedRoom; // Use mapped room name
    }
  } else {
    // Create new beacon
    db.beacons[beaconKey] = {
      name: deviceName,
      uuid: uuid, // May be null, will be updated when we get UUID info
      room: mappedRoom, // Use mapped room name
      rssi: 0,
      emergency: false,
      lastSeen: new Date(),
      rssiByDevice: {}
    };
    
    // If we have m5device information, add it to the rssiByDevice object
    if (m5device) {
      db.beacons[beaconKey].rssiByDevice[m5device] = {
        rssi: 0, // Default RSSI
        room: mappedRoom, // Use mapped room name
        lastSeen: new Date()
      };
    }
  }
  
  // After updating, determine room based on all available readings if we have a UUID
  if (uuid) {
    determineRoomFromRSSI(beaconKey);
  }
}

function updateBeaconRssi(uuid, room, rssi, m5device = null) {
  // Use UUID as the primary identifier for the beacon
  const beaconKey = uuid;
  
  // Map MQTT topic room names to database room names
  const mappedRoom = mapRoomName(room);
  
  // Try to find if this beacon already exists
  const existingKey = findBeacon(beaconKey);
  
  if (existingKey) {
    // Update existing beacon
    db.beacons[existingKey].lastSeen = new Date();
    
    // If we have m5device information, update the RSSI data for this device
    if (m5device) {
      if (!db.beacons[existingKey].rssiByDevice) {
        db.beacons[existingKey].rssiByDevice = {};
      }
      
      // Create or update the entry for this M5 device
      db.beacons[existingKey].rssiByDevice[m5device] = {
        rssi: rssi,
        room: mappedRoom, // Use mapped room name
        lastSeen: new Date()
      };
    } else {
      // If no m5device is specified, just update the main RSSI value
      db.beacons[existingKey].rssi = rssi;
    }
  } else {
    // Create new beacon
    db.beacons[beaconKey] = {
      name: uuid, // Default name is UUID until we get a better name
      uuid: uuid,
      room: mappedRoom, // Use mapped room name
      rssi: rssi,
      emergency: false,
      lastSeen: new Date(),
      rssiByDevice: {}
    };
    
    // If we have m5device information, add it to the rssiByDevice object
    if (m5device) {
      db.beacons[beaconKey].rssiByDevice[m5device] = {
        rssi: rssi,
        room: mappedRoom, // Use mapped room name
        lastSeen: new Date()
      };
    }
  }
  
  // After updating, determine room based on all available readings
  determineRoomFromRSSI(beaconKey);
}

function updateBeaconEmergency(uuid, room, emergency, m5device = null) {
  // Use UUID as the primary identifier for the beacon
  const beaconKey = uuid;
  
  // Map MQTT topic room names to database room names
  const mappedRoom = mapRoomName(room);
  
  // Try to find if this beacon already exists
  const existingKey = findBeacon(beaconKey);
  
  if (existingKey) {
    // Update existing beacon
    db.beacons[existingKey].emergency = emergency;
    db.beacons[existingKey].lastSeen = new Date();
    
    // If we have m5device information, update the RSSI data for this device
    if (m5device) {
      if (!db.beacons[existingKey].rssiByDevice) {
        db.beacons[existingKey].rssiByDevice = {};
      }
      
      // Create or update the entry for this M5 device
      if (!db.beacons[existingKey].rssiByDevice[m5device]) {
        db.beacons[existingKey].rssiByDevice[m5device] = {
          rssi: 0, // Default RSSI
          room: mappedRoom, // Use mapped room name
          lastSeen: new Date()
        };
      } else {
        // Update the room and lastSeen for this M5 device
        db.beacons[existingKey].rssiByDevice[m5device].room = mappedRoom; // Use mapped room name
        db.beacons[existingKey].rssiByDevice[m5device].lastSeen = new Date();
      }
    }
    
    // Determine the best room based on RSSI values from all M5 devices
    determineRoomFromRSSI(existingKey);
  } else {
    // Create new beacon
    db.beacons[beaconKey] = {
      name: uuid, // Default name is UUID until we get a better name
      uuid: uuid,
      room: mappedRoom, // Use mapped room name
      rssi: 0,
      emergency: emergency,
      lastSeen: new Date(),
      rssiByDevice: {}
    };
    
    // If we have m5device information, add it to the rssiByDevice object
    if (m5device) {
      db.beacons[beaconKey].rssiByDevice[m5device] = {
        rssi: 0, // Default RSSI
        room: mappedRoom, // Use mapped room name
        lastSeen: new Date()
      };
    }
  }
  
  console.log(`Updated emergency status for ${uuid} to ${emergency}`);
}

// Function to determine which room a device is in based on RSSI values
function determineRoomFromRSSI(deviceId) {
  const beacon = db.beacons[deviceId];
  if (!beacon) return;
  
  // Check if we have RSSI data from multiple M5 devices
  if (beacon.rssiByDevice && Object.keys(beacon.rssiByDevice).length > 0) {
    console.log(`Found RSSI data from ${Object.keys(beacon.rssiByDevice).length} M5 devices for ${beacon.name} (${beacon.uuid})`);
    
    // Find the M5 device with the strongest signal (highest RSSI)
    let strongestSignal = -Infinity;
    let strongestM5Device = null;
    let strongestRoom = null;
    
    for (const m5device in beacon.rssiByDevice) {
      const data = beacon.rssiByDevice[m5device];
      const currentRssi = data.rssi;
      
      if (currentRssi > strongestSignal) {
        strongestSignal = currentRssi;
        strongestM5Device = m5device;
        strongestRoom = data.room;
      }
    }
    
    if (strongestM5Device && strongestRoom) {
      console.log(`Device ${beacon.name} (${beacon.uuid}) has strongest signal (${strongestSignal}) from M5 device ${strongestM5Device} in ${strongestRoom}`);
      
      // Map MQTT topic room names to database room names
      const mappedRoom = mapRoomName(strongestRoom);
      
      // Update the beacon's room if it changed
      if (beacon.room !== mappedRoom) {
        beacon.room = mappedRoom;
        console.log(`Updated device ${beacon.name} location to ${mappedRoom} (from topic ${strongestRoom}) based on strongest signal from ${strongestM5Device}`);
        
        // Emit room change event
        io.emit('beacon_room_change', { 
          deviceId: beacon.uuid, 
          name: beacon.name,
          room: mappedRoom, 
          rssi: strongestSignal,
          m5device: strongestM5Device
        });
      }
      
      // Also store the strongest RSSI value as the beacon's main RSSI value for UI display
      beacon.rssi = strongestSignal;
      
      return;
    }
  }
  
  // Fall back to the original single-device logic if we don't have multiple readings
  // or if we couldn't determine a room from multiple readings
  
  // If we have at least one RSSI reading, use it
  if (beacon.rssiByDevice && Object.keys(beacon.rssiByDevice).length > 0) {
    const m5device = Object.keys(beacon.rssiByDevice)[0];
    const data = beacon.rssiByDevice[m5device];
    const rssi = data.rssi;
    let mostLikelyRoom = data.room;
    
    // RSSI thresholds for room determination
    // RSSI values are negative, so closer to 0 means stronger signal
    // -70 to -50: Very close (same room)
    // -85 to -70: Nearby (adjacent room)
    // Less than -85: Far away (different floor or distant room)
    
    // Simple algorithm: assign room based on RSSI thresholds
    if (rssi > -70) {
      // Very strong signal, likely in this room
      // Keep the current room assignment
      console.log(`Device ${beacon.name} has strong signal (${rssi}), likely in ${mostLikelyRoom}`);
    } else if (rssi > -85) {
      // Medium signal, might be in an adjacent room
      console.log(`Device ${beacon.name} has medium signal (${rssi}), might be near ${mostLikelyRoom}`);
    } else {
      // Weak signal, likely far away
      console.log(`Device ${beacon.name} has weak signal (${rssi}), likely far from ${mostLikelyRoom}`);
    }
    
    // Map MQTT topic room names to database room names
    const mappedRoom = mapRoomName(mostLikelyRoom);
    
    // Update the beacon's room if it changed
    if (mappedRoom !== beacon.room) {
      beacon.room = mappedRoom;
      console.log(`Updated device ${beacon.name} location to ${mappedRoom} (from topic ${mostLikelyRoom}) based on RSSI ${rssi}`);
      
      // Emit room change event
      io.emit('beacon_room_change', { 
        deviceId: beacon.uuid, 
        name: beacon.name,
        room: mappedRoom, 
        rssi: rssi,
        m5device: m5device
      });
    }
    
    // Also store this RSSI value as the beacon's main RSSI value for UI display
    beacon.rssi = rssi;
  }
}


// Routes
app.get('/', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  const user = db.users.find(u => u.username === username);
  
  // Direct plaintext password comparison
  if (user && password === user.password) {
    // Store user information in session
    req.session.user = {
      username: user.username,
      // Don't store password in session for security
    };
    res.redirect('/');
  } else {
    res.redirect('/login?error=1');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// API Routes
app.get('/api/rooms', isAuthenticated, (req, res) => {
  res.json(db.rooms);
});

app.post('/api/rooms', isAuthenticated, (req, res) => {
  const { name } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: 'Room name is required' });
  }
  
  const newId = db.rooms.length > 0 ? Math.max(...db.rooms.map(r => r.id)) + 1 : 1;
  const newRoom = { id: newId, name };
  
  db.rooms.push(newRoom);
  res.status(201).json(newRoom);
});

app.get('/api/sensors', isAuthenticated, (req, res) => {
  res.json(db.sensors);
});

app.post('/api/sensors', isAuthenticated, (req, res) => {
  const { roomId, name, type, value } = req.body;
  
  if (!roomId || !name || !type) {
    return res.status(400).json({ error: 'Room ID, name, and type are required' });
  }
  
  const newId = db.sensors.length > 0 ? Math.max(...db.sensors.map(s => s.id)) + 1 : 1;
  const newSensor = { id: newId, roomId, name, type, value: value || 'N/A' };
  
  db.sensors.push(newSensor);
  res.status(201).json(newSensor);
});

app.get('/api/beacons', isAuthenticated, (req, res) => {
  res.json(Object.values(db.beacons));
});

// Socket.IO connection with authentication
// Use Socket.IO middleware to check for authentication
io.use((socket, next) => {
  const session = socket.request.session;
  if (session && session.user) {
    next();
  } else {
    next(new Error('Authentication error'));
  }
});

io.on('connection', (socket) => {
  console.log('New authenticated client connected');
  
  // Send initial data to client
  socket.emit('initial_data', {
    rooms: db.rooms,
    sensors: db.sensors,
    beacons: Object.values(db.beacons)
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
