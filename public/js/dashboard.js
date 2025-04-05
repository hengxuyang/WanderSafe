// Connect to Socket.IO
const socket = io();

// DOM Elements
const roomsContainer = document.getElementById('rooms-container');
const addRoomForm = document.getElementById('add-room-form');
const addSensorForm = document.getElementById('add-sensor-form');
const sensorRoomSelect = document.getElementById('sensor-room');
const emergencyAlerts = document.getElementById('emergency-alerts');
const emergencyDetails = document.getElementById('emergency-details');

// Templates
const roomTemplate = document.getElementById('room-template');
const sensorTemplate = document.getElementById('sensor-template');
const beaconTemplate = document.getElementById('beacon-template');

// Data Storage
let rooms = [];
let sensors = [];
let beacons = [];

// Initialize Dashboard
document.addEventListener('DOMContentLoaded', () => {
  // Set up form event listeners
  addRoomForm.addEventListener('submit', handleAddRoom);
  addSensorForm.addEventListener('submit', handleAddSensor);
  
  // Set up Socket.IO event listeners
  setupSocketListeners();
});

// Socket.IO Event Listeners
function setupSocketListeners() {
  // Initial data load
  socket.on('initial_data', (data) => {
    console.log('Received initial data:', data);
    rooms = data.rooms || [];
    sensors = data.sensors || [];
    beacons = Object.values(data.beacons || {});
    
    updateRoomsDropdown();
    renderDashboard();
  });
  
  // Sensor updates
  socket.on('sensor_update', (data) => {
    console.log('Sensor update:', data);
    updateSensor(data);
  });
  
  // Beacon updates
  socket.on('beacon_update', (data) => {
    console.log('Beacon update:', data);
    updateBeacon(data);
  });
  
  // RSSI updates
  socket.on('rssi_update', (data) => {
    console.log('RSSI update:', data);
    updateBeaconRssi(data);
  });
  
  // Emergency alerts
  socket.on('emergency_alert', (data) => {
    console.log('Emergency alert:', data);
    handleEmergency(data);
  });
  
  // Beacon room change
  socket.on('beacon_room_change', (data) => {
    console.log('Beacon room change:', data);
    updateBeaconRoom(data);
  });
}

// Form Handlers
async function handleAddRoom(event) {
  event.preventDefault();
  
  const roomNameInput = document.getElementById('room-name');
  const roomName = roomNameInput.value.trim();
  
  if (!roomName) return;
  
  try {
    const response = await fetch('/api/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: roomName })
    });
    
    if (!response.ok) {
      throw new Error('Failed to add room');
    }
    
    const newRoom = await response.json();
    rooms.push(newRoom);
    
    updateRoomsDropdown();
    renderDashboard();
    
    // Clear form
    roomNameInput.value = '';
    
  } catch (error) {
    console.error('Error adding room:', error);
    alert('Failed to add room. Please try again.');
  }
}

async function handleAddSensor(event) {
  event.preventDefault();
  
  const roomId = parseInt(sensorRoomSelect.value);
  const sensorName = document.getElementById('sensor-name').value.trim();
  const sensorType = document.getElementById('sensor-type').value;
  const sensorValue = document.getElementById('sensor-value').value.trim() || 'N/A';
  
  if (!roomId || !sensorName || !sensorType) return;
  
  try {
    const response = await fetch('/api/sensors', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        roomId,
        name: sensorName,
        type: sensorType,
        value: sensorValue
      })
    });
    
    if (!response.ok) {
      throw new Error('Failed to add sensor');
    }
    
    const newSensor = await response.json();
    sensors.push(newSensor);
    
    renderDashboard();
    
    // Clear form
    document.getElementById('sensor-name').value = '';
    document.getElementById('sensor-value').value = '';
    
  } catch (error) {
    console.error('Error adding sensor:', error);
    alert('Failed to add sensor. Please try again.');
  }
}

// Update Functions
function updateRoomsDropdown() {
  // Clear existing options
  sensorRoomSelect.innerHTML = '';
  
  // Add options for each room
  rooms.forEach(room => {
    const option = document.createElement('option');
    option.value = room.id;
    option.textContent = room.name;
    sensorRoomSelect.appendChild(option);
  });
}

function updateSensor(data) {
  const { deviceId, blockDistance, message } = data;
  
  console.log(`Received sensor update for ${deviceId}: blockDistance=${blockDistance}, message=${message}`);
  
  // Find existing sensor
  const existingSensor = sensors.find(s => s.name === deviceId);
  
  if (existingSensor) {
    existingSensor.value = blockDistance;
    existingSensor.type = 'block_distance'; // Update type to match new data
    existingSensor.lastMessage = message; // Store the message for display
    console.log(`Updated existing sensor ${deviceId} with value: ${blockDistance}`);
  } else {
    // Try to find room ID from device ID
    let roomId = 1; // Default to first room
    const roomName = deviceId.split('_')[0];
    const room = rooms.find(r => r.name.toLowerCase() === roomName.toLowerCase());
    
    if (room) {
      roomId = room.id;
    }
    
    // Add new sensor
    const newId = sensors.length > 0 ? Math.max(...sensors.map(s => s.id)) + 1 : 1;
    sensors.push({
      id: newId,
      roomId: roomId,
      name: deviceId,
      type: 'block_distance',
      value: blockDistance,
      lastMessage: message
    });
    console.log(`Created new sensor ${deviceId} with value: ${blockDistance}`);
  }
  
  // Force re-render to update the dashboard
  renderDashboard();
}

function updateBeacon(data) {
  const { deviceName, uuid, room, rssi } = data;
  
  // Find existing beacon by name or uuid
  const existingBeacon = beacons.find(b => b.name === deviceName || b.name === uuid);
  
  if (existingBeacon) {
    existingBeacon.room = room;
    existingBeacon.lastSeen = new Date();
    
    // Also update RSSI if provided
    if (rssi !== undefined) {
      existingBeacon.rssi = rssi;
      console.log(`Updated RSSI for ${deviceName || uuid} to ${rssi}`);
    }
  } else {
    // Add new beacon
    beacons.push({
      name: deviceName || uuid,
      room: room,
      rssi: rssi || 0,
      emergency: false,
      lastSeen: new Date()
    });
  }
  
  renderDashboard();
}

function updateBeaconRssi(data) {
  const { uuid, room, rssi } = data;
  
  // Find existing beacon
  const existingBeacon = beacons.find(b => b.name === uuid);
  
  if (existingBeacon) {
    existingBeacon.rssi = rssi;
    existingBeacon.room = room;
    existingBeacon.lastSeen = new Date();
  } else {
    // Add new beacon
    beacons.push({
      name: uuid,
      room: room,
      rssi: rssi,
      emergency: false,
      lastSeen: new Date()
    });
  }
  
  renderDashboard();
}

function updateBeaconRoom(data) {
  const { deviceId, room, rssi } = data;
  
  // Find existing beacon
  const existingBeacon = beacons.find(b => b.name === deviceId);
  
  if (existingBeacon) {
    // Update room and RSSI
    existingBeacon.room = room;
    if (rssi) existingBeacon.rssi = rssi;
    existingBeacon.lastSeen = new Date();
    
    console.log(`Updated beacon ${deviceId} location to ${room}`);
    
    // Re-render dashboard to show updated location
    renderDashboard();
  }
}

function handleEmergency(data) {
  const { uuid, room, emergency, m5device, timestamp } = data;
  
  console.log(`Emergency event: ${emergency ? 'ACTIVE' : 'CLEARED'} for ${uuid} in ${room} from ${m5device || 'unknown device'}`);
  
  // Find existing beacon
  const existingBeacon = beacons.find(b => b.name === uuid);
  
  // Track previous state for logging
  const previousState = existingBeacon ? existingBeacon.emergency : false;
  
  if (existingBeacon) {
    // Only update if state actually changed
    if (existingBeacon.emergency !== emergency) {
      console.log(`Emergency state changed from ${previousState} to ${emergency} for ${uuid}`);
    }
    
    existingBeacon.emergency = emergency;
    existingBeacon.room = room;
    existingBeacon.lastSeen = new Date();
    
    // Store which device reported this emergency
    existingBeacon.lastReportingDevice = m5device;
  } else {
    // Add new beacon
    console.log(`Creating new beacon for ${uuid} with emergency=${emergency}`);
    beacons.push({
      name: uuid,
      room: room,
      rssi: 0,
      emergency: emergency,
      lastSeen: new Date(),
      lastReportingDevice: m5device
    });
  }
  
  // Show emergency alert
  if (emergency) {
    // Make the alert visible
    emergencyAlerts.style.display = 'block';
    
    // Add pulsing animation class if not already added
    if (!emergencyAlerts.classList.contains('pulsing')) {
      emergencyAlerts.classList.add('pulsing');
    }
    
    // Update emergency details
    emergencyDetails.innerHTML = 
      `<p><strong>Person:</strong> ${uuid}</p>
      <p><strong>Location:</strong> ${room}</p>
      <p><strong>Time:</strong> ${new Date().toLocaleTimeString()}</p>
      <p class="text-danger fw-bold">EMERGENCY ASSISTANCE REQUIRED!</p>`;
    
    // Play a beep sound using Web Audio API
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.type = 'sine';
      oscillator.frequency.value = 800;
      gainNode.gain.value = 0.5;
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.start();
      setTimeout(() => {
        oscillator.stop();
      }, 500);
    } catch (e) {
      console.error('Error playing alert sound:', e);
    }
  } else {
    // Emergency has been cleared
    console.log(`Emergency cleared for ${uuid} in ${room}`);
    
    // Check if there are any other active emergencies
    const activeEmergencies = beacons.filter(b => b.emergency);
    
    if (activeEmergencies.length === 0) {
      // No more active emergencies, hide the alert
      emergencyAlerts.style.display = 'none';
      emergencyAlerts.classList.remove('pulsing');
      
      // Show a temporary "Emergency Cleared" notification
      const notification = document.createElement('div');
      notification.className = 'alert alert-success alert-dismissible fade show position-fixed top-0 start-50 translate-middle-x mt-3';
      notification.setAttribute('role', 'alert');
      notification.innerHTML = `
        <strong>Emergency Cleared!</strong> The emergency for ${uuid} has been resolved.
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
      `;
      document.body.appendChild(notification);
      
      // Remove the notification after 5 seconds
      setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 500);
      }, 5000);
      
      // Play a confirmation sound
      try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.type = 'sine';
        oscillator.frequency.value = 440; // A4 note
        gainNode.gain.value = 0.3;
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.start();
        setTimeout(() => {
          oscillator.frequency.value = 523.25; // C5 note
          setTimeout(() => {
            oscillator.stop();
          }, 300);
        }, 300);
      } catch (e) {
        console.error('Error playing confirmation sound:', e);
      }
    } else {
      // There are still other active emergencies
      console.log(`${activeEmergencies.length} other emergencies still active`);
    }
  }
  
  renderDashboard();
}

// Render Functions
function renderDashboard() {
  console.log('Rendering dashboard with rooms:', rooms);
  
  // Clear rooms container
  roomsContainer.innerHTML = '';
  
  if (rooms.length === 0) {
    console.log('No rooms to display');
    roomsContainer.innerHTML = '<div class="alert alert-info">No rooms available. Add a room to get started.</div>';
    return;
  }
  
  // Render each room
  rooms.forEach(room => {
    console.log('Creating element for room:', room);
    const roomElement = createRoomElement(room);
    console.log('Room element created:', roomElement);
    roomsContainer.appendChild(roomElement);
  });
  
  console.log('Dashboard rendering complete');
}

function createRoomElement(room) {
  // Clone room template
  const roomElement = document.importNode(roomTemplate.content, true);
  
  // Set room name
  roomElement.querySelector('.room-name').textContent = room.name;
  
  // Get lists containers
  const sensorsListElement = roomElement.querySelector('.sensors-list');
  const beaconsListElement = roomElement.querySelector('.beacons-list');
  
  // Add sensors for this room
  const roomSensors = sensors.filter(sensor => sensor.roomId === room.id);
  if (roomSensors.length > 0) {
    roomSensors.forEach(sensor => {
      const sensorElement = createSensorElement(sensor);
      sensorsListElement.appendChild(sensorElement);
    });
  } else {
    sensorsListElement.innerHTML = '<div class="list-group-item text-muted">No sensors in this room</div>';
  }
  
  // Add beacons for this room
  const roomBeacons = beacons.filter(beacon => {
    // Simple exact match on room name
    const beaconRoom = beacon.room ? beacon.room : '';
    
    // Check if the beacon's m5device contains the room name
    const m5device = beacon.lastReportingDevice || '';
    const deviceContainsRoom = m5device.includes(room.name) || 
                              (room.name === 'Living Room' && m5device.includes('Living_Room'));
    
    // Debug log
    console.log(`Checking beacon ${beacon.name} - Room: ${beaconRoom}, Device: ${m5device}`);
    
    // Match if either the room matches exactly or the device contains the room name
    return beaconRoom === room.name || deviceContainsRoom;
  });
  
  if (roomBeacons.length > 0) {
    roomBeacons.forEach(beacon => {
      const beaconElement = createBeaconElement(beacon);
      beaconsListElement.appendChild(beaconElement);
    });
  } else {
    beaconsListElement.innerHTML = '<div class="list-group-item text-muted">No people detected in this room</div>';
  }
  
  return roomElement.firstElementChild;
}

function createSensorElement(sensor) {
  // Clone sensor template
  const sensorElement = document.importNode(sensorTemplate.content, true);
  
  // Set sensor data
  sensorElement.querySelector('.sensor-name').textContent = sensor.name;
  
  // Format the sensor type display
  let typeDisplay = sensor.type;
  if (sensor.type === 'block_distance') {
    typeDisplay = 'Block Distance';
  }
  sensorElement.querySelector('.sensor-type').textContent = `Type: ${typeDisplay}`;
  
  // Format the sensor value display
  let valueDisplay = sensor.value;
  if (sensor.type === 'block_distance') {
    valueDisplay = `${sensor.value} cm`;
    
    // Add a visual indicator based on the block distance
    const valueElement = sensorElement.querySelector('.sensor-value');
    valueElement.textContent = valueDisplay;
    
    // Add message if available
    if (sensor.lastMessage) {
      const messageElement = document.createElement('div');
      messageElement.className = 'small text-muted mt-1';
      messageElement.textContent = sensor.lastMessage;
      valueElement.parentNode.appendChild(messageElement);
    }
  } else {
    sensorElement.querySelector('.sensor-value').textContent = valueDisplay;
  }
  
  // Add debug info to help troubleshoot
  const debugElement = document.createElement('div');
  debugElement.className = 'small text-muted mt-1';
  debugElement.textContent = `Last update: ${new Date().toLocaleTimeString()}`;
  sensorElement.querySelector('.sensor-value').parentNode.appendChild(debugElement);
  
  return sensorElement.firstElementChild;
}

function createBeaconElement(beacon) {
  // Clone beacon template
  const beaconElement = document.importNode(beaconTemplate.content, true);
  const beaconItem = beaconElement.firstElementChild;
  
  // Set beacon data
  beaconElement.querySelector('.beacon-name').textContent = beacon.name;
  
  // Set RSSI with signal strength indicator
  let signalClass = 'signal-weak';
  if (beacon.rssi > -70) {
    signalClass = 'signal-strong';
  } else if (beacon.rssi > -85) {
    signalClass = 'signal-medium';
  }
  
  beaconElement.querySelector('.beacon-rssi').innerHTML = 
    `<span class="signal-strength ${signalClass}"></span> Signal: ${beacon.rssi} dBm`;
  
  // Set status badge
  const statusBadge = beaconElement.querySelector('.beacon-status');
  if (beacon.emergency) {
    statusBadge.textContent = 'EMERGENCY';
    statusBadge.classList.add('bg-danger');
    beaconItem.classList.add('emergency');
  } else {
    statusBadge.textContent = 'OK';
    statusBadge.classList.add('bg-success');
  }
  
  return beaconElement.firstElementChild;
}
