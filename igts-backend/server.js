require('dotenv').config(); // MUST BE AT THE TOP
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const nodemailer = require('nodemailer'); 

// --- MODELS ---
const UserSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String, 
  phone: String,
  role: { type: String, enum: ['sender', 'admin', 'driver'], default: 'sender' },
  location : String,
  driverDetails: {
    licenseNumber: String,
    isAvailable: { type: Boolean, default: true },
    currentLocation: { type: String, default: 'Pune' },
    currentLoad: { type: Number, default: 0 },
    assignedVehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', default: null }
  },
  createdAt: { type: Date, default: Date.now }
});

const VehicleSchema = new mongoose.Schema({
  number: { type: String, unique: true, required: true },
  type: { type: String, required: true }, 
  capacity: { type: Number, required: true },
  fuelType: { type: String, default: 'Diesel' },
  status: { type: String, enum: ['Available', 'In-Use', 'Maintenance'], default: 'Available' },
  currentDriverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
});

const RouteSchema = new mongoose.Schema({
  origin: { type: String, required: true },
  destination: { type: String, required: true },
  distance: { type: Number, required: true },
  preferredDriver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null } 
});

const ShipmentSchema = new mongoose.Schema({
  shipmentId: String,
  from: String, to: String,
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  driver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  productName: String, weight: Number, cost: Number,
  pickupOtp: String, deliveryOtp: String,
  status: { type: String, default: 'Pending' }, 
  paymentStatus: { type: String, default: 'Unpaid' },
  createdAt: { type: Date, default: Date.now },
  deliveredAt: Date
});

const ComplaintSchema = new mongoose.Schema({
  ticketId: String,
  reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  subject: String, description: String, status: { type: String, default: 'Open' },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Vehicle = mongoose.model('Vehicle', VehicleSchema);
const Route = mongoose.model('Route', RouteSchema);
const Shipment = mongoose.model('Shipment', ShipmentSchema);
const Complaint = mongoose.model('Complaint', ComplaintSchema);

// --- APP SETUP ---
const app = express();
app.use(cors());
app.use(express.json());

const MONGO_URI = process.env.MONGO_URI; 
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ DB Error:', err));


// --- EMAIL CONFIGURATION ---
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// --- HELPER FUNCTION: Get Driver Load Info ---
async function getDriverLoadInfo(driverId, excludeShipmentId = null) {
  const query = {
    driver: driverId,
    status: { $in: ['Payment Pending', 'Assigned', 'Picked', 'In-Transit'] }
  };
  
  if (excludeShipmentId) {
    query._id = { $ne: excludeShipmentId };
  }
  
  const activeShipments = await Shipment.find(query);
  const totalLoad = activeShipments.reduce((sum, s) => sum + (s.weight || 0), 0);
  
  return {
    activeShipments,
    totalLoad,
    count: activeShipments.length
  };
}

// --- REAL-TIME EMAIL HELPER FUNCTIONS ---
async function sendEmailTo(userId, subject, message, details = {}) {
  try {
    const user = await User.findById(userId).select('name email');
    if (!user) return false;

    const detailsText = Object.entries(details).map(([k, v]) => `${k}: ${v}`).join('\n');
    const fullMessage = `${message}\n\n${detailsText ? detailsText + '\n\n' : ''}Regards,\nIGTS Team`;

    await transporter.sendMail({
      from: 'IGTS Support <no-reply@igts.com>',
      to: user.email,
      subject: `IGTS: ${subject}`,
      text: `Hello ${user.name},\n\n${fullMessage}`
    });
    
    console.log(`📧 Email sent to ${user.email}: ${subject}`);
    return true;
  } catch (error) {
    console.error('Email error:', error.message);
    return false;
  }
}

async function notifyAdmins(subject, message, details = {}) {
  const admins = await User.find({ role: 'admin' }).select('_id');
  for (const admin of admins) {
    await sendEmailTo(admin._id, subject, message, details);
  }
}

// --- ROUTES ---

// 1. AUTH ROUTES
app.post('/api/auth/register', async (req, res) => {
  try {
    const newUser = new User(req.body);
    await newUser.save();
    
    await sendEmailTo(newUser._id, 'Welcome to IGTS', 
      `Welcome ${newUser.name}! Your account has been created successfully.`,
      { Role: newUser.role, 'Login Email': newUser.email });
    
    res.json(newUser);
  } catch (err) { 
    res.status(400).json({ error: 'Email already exists' }); 
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).populate('driverDetails.assignedVehicleId');
  
  if (!user || user.password !== password) {
    return res.status(400).json({ error: 'Invalid credentials' });
  }
  
  res.json({ 
    id: user._id, 
    name: user.name, 
    email: user.email, 
    role: user.role, 
    phone: user.phone,
    driverDetails: user.role === 'driver' ? {
      ...user.driverDetails.toObject(),
      vehicleNumber: user.driverDetails.assignedVehicleId?.number || 'No Vehicle',
      vehicleType: user.driverDetails.assignedVehicleId?.type || '',
      totalCapacity: user.driverDetails.assignedVehicleId?.capacity || 0
    } : null
  });
});

app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: 'User not found' });

    await transporter.sendMail({
      from: 'IGTS Support <no-reply@igts.com>',
      to: email,
      subject: 'Password Reset Request - IGTS',
      text: `Hello ${user.name},\n\nWe received a request to reset your password.\n\nPlease contact admin to manually reset it.\n\nRegards,\nIGTS Team`
    });
    
    res.json({ success: true, message: 'Email sent successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send email' });
  }
});

// 2. VEHICLE ROUTES
app.get('/api/vehicles', async (req, res) => {
  const vehicles = await Vehicle.find().populate('currentDriverId', 'name phone');
  res.json(vehicles);
});

app.post('/api/vehicles', async (req, res) => {
  try { 
    await new Vehicle(req.body).save(); 
    res.json({ success: true }); 
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
});

app.put('/api/vehicles/assign', async (req, res) => {
  const { vehicleId, driverId } = req.body;
  try {
    await Vehicle.updateMany({ currentDriverId: driverId }, { $set: { currentDriverId: null, status: 'Available' } });
    await User.findByIdAndUpdate(driverId, { 'driverDetails.assignedVehicleId': null });

    if (!vehicleId) return res.json({ message: 'Driver unassigned' });

    await Vehicle.findByIdAndUpdate(vehicleId, { currentDriverId: driverId, status: 'In-Use' });
    await User.findByIdAndUpdate(driverId, { 'driverDetails.assignedVehicleId': vehicleId });
    res.json({ success: true });
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
});

app.delete('/api/vehicles/:id', async (req, res) => {
  try {
    const vehicleId = req.params.id;
    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });
    if (vehicle.status === 'In-Use') {
      return res.status(400).json({ error: 'Cannot delete! Vehicle is In-Use.' });
    }
    if (vehicle.currentDriverId) {
      await User.findByIdAndUpdate(vehicle.currentDriverId, { 'driverDetails.assignedVehicleId': null });
    }
    await Vehicle.findByIdAndDelete(vehicleId);
    res.json({ success: true, message: 'Vehicle deleted.' });
  } catch (err) { 
    res.status(500).json({ error: 'Failed to delete vehicle.' }); 
  }
});

// 3. DRIVER ROUTES - FIXED: Show drivers with remaining capacity
app.get('/api/drivers/active', async (req, res) => {
  try {
    // Get all drivers with assigned vehicles
    const drivers = await User.find({ 
      role: 'driver',
      'driverDetails.assignedVehicleId': { $ne: null }
    }).populate('driverDetails.assignedVehicleId');
    
    // Filter drivers based on capacity
    const driversWithCapacity = [];
    
    for (const driver of drivers) {
      // Get active shipments for this driver
      const { totalLoad, activeShipments } = await getDriverLoadInfo(driver._id);
      const capacity = driver.driverDetails.assignedVehicleId?.capacity || 0;
      const remainingCapacity = capacity - totalLoad;
      
      // Include driver if they have remaining capacity
      if (remainingCapacity > 0) {
        // Add load info to driver object
        const driverObj = driver.toObject();
        driverObj.currentLoad = totalLoad;
        driverObj.remainingCapacity = remainingCapacity;
        driverObj.capacity = capacity;
        driverObj.activeShipmentsCount = activeShipments.length;
        driversWithCapacity.push(driverObj);
      }
    }
    
    res.json(driversWithCapacity);
  } catch (err) {
    console.error('Error fetching active drivers:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/drivers/all', async (req, res) => {
  try {
    const drivers = await User.find({ role: 'driver' })
      .populate('driverDetails.assignedVehicleId')
      .sort({ name: 1 });
    res.json(drivers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/drivers/:driverId/load', async (req, res) => {
  try {
    const driver = await User.findById(req.params.driverId).populate('driverDetails.assignedVehicleId');
    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }
    
    const { totalLoad, activeShipments } = await getDriverLoadInfo(driver._id);
    const capacity = driver.driverDetails.assignedVehicleId?.capacity || 0;
    
    res.json({
      driverId: driver._id,
      driverName: driver.name,
      currentLoad: totalLoad,
      capacity: capacity,
      remainingCapacity: capacity - totalLoad,
      activeShipments: activeShipments.map(s => ({
        shipmentId: s.shipmentId,
        weight: s.weight,
        from: s.from,
        to: s.to,
        status: s.status
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/drivers/:id', async (req, res) => {
  try {
    const { name, email, phone, location, password } = req.body;
    const updateData = { name, email, phone, location };
    if (password && password.trim() !== '') updateData.password = password;
    const updatedUser = await User.findByIdAndUpdate(req.params.id, { $set: updateData }, { new: true });
    if (!updatedUser) return res.status(404).json({ error: 'Driver not found' });
    res.json(updatedUser);
  } catch (err) { 
    res.status(500).json({ error: 'Failed to update driver' }); 
  }
});

app.delete('/api/drivers/:id', async (req, res) => {
  try {
    const driverId = req.params.id;
    const activeShipment = await Shipment.findOne({ 
      driver: driverId, 
      status: { $in: ['Assigned', 'Picked', 'In-Transit'] } 
    });
    if (activeShipment) {
      return res.status(400).json({ error: 'Cannot delete! Driver has active shipment.' });
    }
    await Vehicle.updateMany({ currentDriverId: driverId }, { $set: { currentDriverId: null, status: 'Available' } });
    await User.findByIdAndDelete(driverId);
    res.json({ success: true, message: 'Driver deleted.' });
  } catch (err) { 
    res.status(500).json({ error: 'Failed to delete driver.' }); 
  }
});

// 4. SHIPMENT ROUTES - FIXED: Allow multiple assignments
app.post('/api/shipments', async (req, res) => {
  try {
    const { senderId, ...data } = req.body;
    const newShipment = new Shipment({
      shipmentId: `SHP-${Math.floor(Math.random() * 100000)}`,
      sender: senderId,
      pickupOtp: Math.floor(1000 + Math.random() * 9000).toString(),
      deliveryOtp: Math.floor(1000 + Math.random() * 9000).toString(),
      ...data
    });
    await newShipment.save();
    
    await notifyAdmins('New Shipment Created', 
      `Shipment #${newShipment.shipmentId} needs driver assignment.`,
      { From: data.from, To: data.to, Product: data.productName, Weight: `${data.weight}kg` });
    
    await sendEmailTo(senderId, 'Shipment Created', 
      `Your shipment #${newShipment.shipmentId} has been created.`,
      { 'Shipment ID': newShipment.shipmentId, From: data.from, To: data.to });
    
    res.json(newShipment);
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
});

app.get('/api/shipments/all', async (req, res) => {
  const shipments = await Shipment.find()
    .populate('sender', 'name')
    .populate('driver', 'name')
    .sort({ createdAt: -1 });
  res.json(shipments);
});

app.get('/api/shipments/sender/:senderId', async (req, res) => {
  const shipments = await Shipment.find({ sender: req.params.senderId })
    .populate('driver', 'name phone')
    .sort({ createdAt: -1 });
  res.json(shipments);
});

app.put('/api/shipments/assign', async (req, res) => {
  const { shipmentId, driverId } = req.body;
  try {
    const shipment = await Shipment.findById(shipmentId).populate('sender', 'name email');
    if (!shipment) {
      return res.status(404).json({ error: 'Shipment not found' });
    }
    
    const driver = await User.findById(driverId).populate('driverDetails.assignedVehicleId');
    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }
    
    // Check driver capacity before assignment
    const { totalLoad } = await getDriverLoadInfo(driverId, shipmentId);
    const vehicleCapacity = driver.driverDetails.assignedVehicleId?.capacity || 0;
    const newLoad = totalLoad + (shipment.weight || 0);
    
    if (newLoad > vehicleCapacity) {
      return res.status(400).json({ 
        error: 'Driver capacity exceeded',
        currentLoad: totalLoad,
        capacity: vehicleCapacity,
        requiredSpace: shipment.weight,
        remainingCapacity: vehicleCapacity - totalLoad
      });
    }
    
    // Assign shipment
    await Shipment.findByIdAndUpdate(shipmentId, { 
      driver: driverId, 
      status: 'Payment Pending' 
    });
    
    // Update driver's current load
    await User.findByIdAndUpdate(driverId, { 
      'driverDetails.currentLoad': newLoad
    });
    
    // Email notifications
    await sendEmailTo(driverId, 'New Shipment Assigned',
      `You have been assigned to shipment #${shipment.shipmentId}.`,
      { 
        From: shipment.from, 
        To: shipment.to, 
        Product: shipment.productName, 
        Weight: `${shipment.weight}kg`,
        'Current Load': `${newLoad}/${vehicleCapacity}kg`
      });
    
    await sendEmailTo(shipment.sender._id, 'Driver Assigned - Payment Required',
      `Driver ${driver.name} assigned to your shipment #${shipment.shipmentId}.`,
      { 
        Driver: driver.name, 
        Amount: `₹${shipment.cost}`, 
        'Shipment ID': shipment.shipmentId 
      });
    
    await notifyAdmins('Driver Assigned', 
      `Driver ${driver.name} assigned to shipment #${shipment.shipmentId}.`,
      { 
        'Shipment ID': shipment.shipmentId, 
        Driver: driver.name,
        'Current Load': `${newLoad}/${vehicleCapacity}kg`
      });
    
    res.json({ 
      success: true,
      message: 'Shipment assigned successfully',
      driverLoad: {
        current: newLoad,
        capacity: vehicleCapacity,
        remaining: vehicleCapacity - newLoad
      }
    });
  } catch (err) {
    console.error('Assignment error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/shipments/pay/:id', async (req, res) => {
  try {
    const shipment = await Shipment.findByIdAndUpdate(
      req.params.id, 
      { paymentStatus: 'Paid', status: 'Assigned' }, 
      { new: true }
    );
    
    await sendEmailTo(shipment.driver, 'Payment Received - Ready to Pickup',
      `Payment completed for shipment #${shipment.shipmentId}.`,
      { 'Pickup OTP': shipment.pickupOtp, 'Shipment ID': shipment.shipmentId });
    
    await sendEmailTo(shipment.sender, 'Payment Confirmed',
      `Your payment for shipment #${shipment.shipmentId} has been confirmed.`,
      { 'Shipment ID': shipment.shipmentId, Amount: `₹${shipment.cost}` });
    
    await notifyAdmins('Payment Completed', 
      `Payment received for shipment #${shipment.shipmentId}.`,
      { 'Shipment ID': shipment.shipmentId, Amount: `₹${shipment.cost}` });
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/driver/jobs/:driverId', async (req, res) => {
  const jobs = await Shipment.find({ 
    driver: req.params.driverId, 
    status: { $in: ['Assigned', 'Picked', 'In-Transit', 'Delivered'] } 
  }).populate('sender', 'name phone').sort({ createdAt: -1 });
  res.json(jobs);
});

app.put('/api/shipments/status', async (req, res) => {
  const { shipmentId, status, otp } = req.body;
  try {
    const shipment = await Shipment.findById(shipmentId);
    if (!shipment) {
      return res.status(404).json({ error: 'Shipment not found' });
    }
    
    if (status === 'Delivered' && shipment.deliveryOtp !== otp) {
      return res.status(400).json({ error: 'Invalid PIN' });
    }

    shipment.status = status;
    if (status === 'Picked') shipment.pickedAt = new Date();
    
    if (status === 'Delivered' || status === 'Cancelled') {
      shipment.deliveredAt = new Date();
      
      if (shipment.driver) {
        // Recalculate driver's current load
        const { totalLoad } = await getDriverLoadInfo(shipment.driver);
        await User.findByIdAndUpdate(shipment.driver, { 
          'driverDetails.currentLoad': totalLoad
        });
      }
    }
    
    await shipment.save();
    
    // Email notifications
    if (status === 'Picked') {
      await sendEmailTo(shipment.sender, 'Shipment Picked Up',
        `Your shipment #${shipment.shipmentId} has been picked up and is in transit.`,
        { From: shipment.from, To: shipment.to, 'Delivery OTP': shipment.deliveryOtp });
      
      await notifyAdmins('Shipment Picked Up', 
        `Shipment #${shipment.shipmentId} is in transit.`,
        { 'Shipment ID': shipment.shipmentId });
        
    } else if (status === 'Delivered') {
      await sendEmailTo(shipment.sender, 'Shipment Delivered',
        `Your shipment #${shipment.shipmentId} has been successfully delivered!`,
        { 'Shipment ID': shipment.shipmentId, 'Delivery Time': new Date().toLocaleString() });
      
      await sendEmailTo(shipment.driver, 'Delivery Completed',
        `You successfully delivered shipment #${shipment.shipmentId}. Good job!`,
        { 'Shipment ID': shipment.shipmentId });
      
      await notifyAdmins('Shipment Delivered', 
        `Shipment #${shipment.shipmentId} has been delivered.`,
        { 'Shipment ID': shipment.shipmentId });
        
    } else if (status === 'Cancelled') {
      await sendEmailTo(shipment.sender, 'Shipment Cancelled',
        `Your shipment #${shipment.shipmentId} has been cancelled.`,
        { 'Shipment ID': shipment.shipmentId });
      
      if (shipment.driver) {
        await sendEmailTo(shipment.driver, 'Shipment Cancelled',
          `Shipment #${shipment.shipmentId} has been cancelled.`,
          { 'Shipment ID': shipment.shipmentId });
      }
      
      await notifyAdmins('Shipment Cancelled', 
        `Shipment #${shipment.shipmentId} was cancelled.`,
        { 'Shipment ID': shipment.shipmentId });
    }
    
    res.json(shipment);
  } catch (err) {
    console.error('Status update error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 5. COMPLAINT ROUTES
app.get('/api/complaints', async (req, res) => {
  const tickets = await Complaint.find().populate('reportedBy', 'name email');
  res.json(tickets);
});

app.post('/api/complaints', async (req, res) => {
  const newComplaint = await new Complaint({ 
    ...req.body, 
    ticketId: `TKT-${Math.floor(Math.random()*9000)}` 
  }).save();
  
  await notifyAdmins('New Complaint Received', 
    `Complaint #${newComplaint.ticketId} submitted.`,
    { Subject: newComplaint.subject, 'Complaint ID': newComplaint.ticketId });
  
  await sendEmailTo(newComplaint.reportedBy, 'Complaint Received',
    `Your complaint #${newComplaint.ticketId} has been received.`,
    { Subject: newComplaint.subject, 'Complaint ID': newComplaint.ticketId });
  
  res.json({ success: true });
});

app.put('/api/complaints/resolve/:id', async (req, res) => {
  const complaint = await Complaint.findById(req.params.id);
  await Complaint.findByIdAndUpdate(req.params.id, { status: 'Resolved' });
  
  if (complaint) {
    await sendEmailTo(complaint.reportedBy, 'Complaint Resolved',
      `Your complaint #${complaint.ticketId} has been resolved.`,
      { Subject: complaint.subject, 'Complaint ID': complaint.ticketId });
  }
  
  res.json({ success: true });
});

// 6. ROUTE MANAGEMENT ROUTES
app.get('/api/routes', async (req, res) => {
  try {
    const routes = await Route.find().populate('preferredDriver', 'name phone');
    res.json(routes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/routes', async (req, res) => {
  const { origin, destination, distance, preferredDriver } = req.body;
  try {
    const newRoute = new Route({ origin, destination, distance, preferredDriver: preferredDriver || null });
    await newRoute.save();
    res.json(newRoute);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/routes/:id', async (req, res) => {
  const { origin, destination, distance, preferredDriver } = req.body;
  try {
    const updatedRoute = await Route.findByIdAndUpdate(
      req.params.id, 
      { origin, destination, distance, preferredDriver }, 
      { new: true }
    );
    res.json(updatedRoute);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/routes/:id', async (req, res) => {
  try {
    await Route.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. CONTACT FORM ROUTE
app.post('/api/contact', async (req, res) => {
  const { firstName, lastName, email, subject, message } = req.body;

  try {
    await transporter.sendMail({
      from: `"${firstName} ${lastName}" <no-reply@igts.com>`,
      to: 'dropidexigt@gmail.com',
      replyTo: email,
      subject: `New Website Inquiry: ${subject}`,
      text: `Name: ${firstName} ${lastName}\nEmail: ${email}\nSubject: ${subject}\n\nMessage:\n${message}`
    });
    res.json({ success: true, message: 'Email sent successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send email' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 IGTS Server Running on port ${PORT}`));