import React, { useState, useEffect } from 'react';
import { MapPin, Scale, IndianRupee, Truck, Package, Ruler, MessageSquare, AlertTriangle, Plus, Trash2, Loader2, ArrowRight, CheckCircle } from 'lucide-react'; 
import { StatusStepper, Modal } from './Shared';
import axios from 'axios';

const SenderDashboard = ({ onShowToast, onBookShipment }) => {
  const [activeShipments, setActiveShipments] = useState([]);
  const [loading, setLoading] = useState(false); 
  const [fetching, setFetching] = useState(true);

  // --- DYNAMIC ROUTES STATE ---
  const [dbRoutes, setDbRoutes] = useState([]);
  const [originCities, setOriginCities] = useState([]);

  // Location State
  const [pickupLocation, setPickupLocation] = useState('');
  const [dropLocation, setDropLocation] = useState('');

  // Items State
  const [items, setItems] = useState([
    { id: 1, name: '', weight: '', unit: 'kg', dimensions: '' }
  ]);
  const [errors, setErrors] = useState({});

  const [calculatedCost, setCalculatedCost] = useState(0);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [complaint, setComplaint] = useState({ subject: '', message: '' });

  const user = JSON.parse(localStorage.getItem('user')) || {};

  // --- Function to remove duplicate cities from array (STRICT) ---
  const removeDuplicateCities = (citiesArray) => {
    if (!citiesArray || citiesArray.length === 0) return [];
    
    // Method 1: Using Set (most reliable)
    const uniqueSet = new Set();
    citiesArray.forEach(city => {
      if (city && city.trim()) {
        uniqueSet.add(city.trim());
      }
    });
    
    // Convert Set to array and sort
    const uniqueArray = Array.from(uniqueSet).sort();
    
    console.log('Original cities:', citiesArray);
    console.log('Unique cities:', uniqueArray);
    
    return uniqueArray;
  };

  // --- FETCH INITIAL DATA ---
  const fetchInitialData = async () => {
    if (!user.id) return;

    try {
      const [shipmentRes, routesRes] = await Promise.all([
        axios.get(`http://localhost:5000/api/shipments/sender/${user.id}`),
        axios.get('http://localhost:5000/api/routes')
      ]);

      // Recent Shipments
      const sorted = shipmentRes.data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setActiveShipments(sorted.slice(0, 3));

      // Store raw routes (including duplicates from database)
      setDbRoutes(routesRes.data);
      
      // Get UNIQUE origin cities - remove duplicates using Set
      const allOrigins = [];
      routesRes.data.forEach(route => {
        if (route.origin && route.origin.trim()) {
          allOrigins.push(route.origin.trim());
        }
      });
      
      // Remove duplicates
      const uniqueOrigins = removeDuplicateCities(allOrigins);
      setOriginCities(uniqueOrigins);
      
      console.log('Unique origins:', uniqueOrigins);

    } catch (err) {
      console.error("Error fetching data:", err);
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => { fetchInitialData(); }, []);

  // --- Get UNIQUE destination cities (STRICT duplicate removal) ---
  const getUniqueDestinationCities = () => {
    if (!pickupLocation) return [];
    
    // Array to collect all destinations
    const allDestinations = [];
    
    console.log('Processing destinations for pickup:', pickupLocation);
    console.log('Total routes in database:', dbRoutes.length);
    
    // Collect all destinations from routes
    dbRoutes.forEach((route, index) => {
      // If pickup is origin
      if (route.origin === pickupLocation && route.destination) {
        if (route.destination !== pickupLocation) {
          allDestinations.push(route.destination.trim());
          console.log(`Found destination from origin: ${route.destination}`);
        }
      }
      // If pickup is destination (bidirectional)
      if (route.destination === pickupLocation && route.origin) {
        if (route.origin !== pickupLocation) {
          allDestinations.push(route.origin.trim());
          console.log(`Found destination from reverse: ${route.origin}`);
        }
      }
    });
    
    console.log('All destinations before removing duplicates:', allDestinations);
    
    // Remove duplicates using Set
    const uniqueDestinations = removeDuplicateCities(allDestinations);
    
    console.log('Unique destinations after removing duplicates:', uniqueDestinations);
    
    return uniqueDestinations;
  };

  const uniqueDestinationCities = getUniqueDestinationCities();

  // --- COST CALCULATION ---
  useEffect(() => {
    if (pickupLocation && dropLocation && items.length > 0) {
      const route = dbRoutes.find(r => 
        (r.origin === pickupLocation && r.destination === dropLocation) ||
        (r.origin === dropLocation && r.destination === pickupLocation)
      );
      if (!route) return setCalculatedCost(0);

      const distance = route.distance;
      let totalCargoCost = 0;

      items.forEach(item => {
        if(item.weight && item.dimensions) {
          let weightInKg = parseFloat(item.weight);
          if (item.unit === 'tonnes') weightInKg *= 1000;

          let volumeScore = 200;
          const dims = item.dimensions.toLowerCase().split('x').map(d => parseFloat(d));
          if (dims.length === 3 && !dims.some(isNaN)) {
            volumeScore = (dims[0] * dims[1] * dims[2]) / 5;
          }

          totalCargoCost += (weightInKg * 2) + volumeScore;
        }
      });

      let perKmRate = 2;
      let discountFactor = 1;
      if (distance <= 100) discountFactor = 1;
      else if (distance <= 300) discountFactor = 0.8;
      else if (distance <= 500) discountFactor = 0.6;
      else discountFactor = 0.5;

      const distanceCost = distance * perKmRate * discountFactor;
      const totalCost = totalCargoCost > 0 ? Math.round(distanceCost + totalCargoCost) : 0;

      setCalculatedCost(totalCost);
    } else {
      setCalculatedCost(0);
    }
  }, [pickupLocation, dropLocation, items, dbRoutes]);

  // --- ITEM VALIDATION ---
  const validateItem = (item) => {
    const errs = {};
    if (!item.name.trim()) errs.name = 'Item name required';

    let weightKg = parseFloat(item.weight);
    if (item.unit === 'tonnes') weightKg *= 1000;
    if (isNaN(weightKg) || weightKg < 10) errs.weight = 'Weight must be ≥ 10 kg';

    const dims = item.dimensions.toLowerCase().split('x').map(d => parseFloat(d));
    if (dims.length !== 3 || dims.some(d => isNaN(d) || d <= 0)) errs.dimensions = 'Dimensions must be valid LxWxH';

    return errs;
  };

  const handleItemChange = (id, field, value) => {
    setItems(items.map(item => item.id === id ? { ...item, [field]: value } : item));
    const item = items.find(i => i.id === id);
    const updatedItem = { ...item, [field]: value };
    setErrors(prev => ({ ...prev, [id]: validateItem(updatedItem) }));
  };

  const addItem = () => {
    const newId = Date.now();
    setItems([...items, { id: newId, name: '', weight: '', unit: 'kg', dimensions: '' }]);
    setErrors(prev => ({ ...prev, [newId]: {} }));
  };
  
  const removeItem = (id) => {
    if(items.length > 1) {
      setItems(items.filter(item => item.id !== id));
      const newErrors = { ...errors };
      delete newErrors[id];
      setErrors(newErrors);
    }
  };

  const handleBookShipment = async () => {
    const invalidItems = items.some(i => Object.keys(validateItem(i)).length > 0);
    if (!pickupLocation || !dropLocation || invalidItems) {
      onShowToast('Please fix errors before booking', 'error');
      return;
    }

    if (pickupLocation === dropLocation) {
      onShowToast('Pickup and drop locations cannot be the same', 'error');
      return;
    }

    setLoading(true);
    const productSummary = items.map(i => `${i.name} (${i.weight}${i.unit})`).join(', ');
    const totalWeight = items.reduce((sum, i) => {
      let w = parseFloat(i.weight);
      if (i.unit === 'tonnes') w *= 1000;
      return sum + w;
    }, 0);

    const payload = {
      senderId: user.id,
      from: pickupLocation,
      to: dropLocation,
      productName: productSummary,
      weight: totalWeight,
      dimensions: `${items.length} Packages`,
      cost: calculatedCost,
      senderEmail: user.email || user.emailId || 'Not provided',
      senderName: user.name || user.fullName || 'Not provided',
      senderPhone: user.phone || user.mobile || 'Not provided'
    };

    try {
      const res = await axios.post('http://localhost:5000/api/shipments', payload);
      onShowToast(`Shipment Confirmed! ₹${calculatedCost}`);
      if (onBookShipment) onBookShipment(res.data);
      fetchInitialData();
      setPickupLocation(''); 
      setDropLocation(''); 
      setItems([{ id: Date.now(), name: '', weight: '', unit: 'kg', dimensions: '' }]);
      setErrors({});
      setCalculatedCost(0);
    } catch (err) {
      onShowToast(err.response?.data?.error || "Booking Failed", 'error');
    } finally { setLoading(false); }
  };

  const handleSubmitComplaint = async (e) => {
    e.preventDefault();
    try {
      await axios.post('http://localhost:5000/api/complaints', {
        reportedBy: user.id,
        role: 'sender',
        subject: complaint.subject,
        description: complaint.message,
        status: 'Open',
        senderEmail: user.email,
        senderName: user.name
      });
      onShowToast(`Complaint Submitted`);
      setIsSupportOpen(false);
      setComplaint({ subject: '', message: '' });
    } catch { onShowToast("Failed to submit", 'error'); }
  };

  const hasErrors = items.some(i => Object.keys(validateItem(i)).length > 0) || !pickupLocation || !dropLocation;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button onClick={() => setIsSupportOpen(true)} className="flex items-center gap-2 bg-red-50 text-red-600 border border-red-200 px-4 py-2 rounded-lg font-bold hover:bg-red-100 transition-colors shadow-sm">
          <AlertTriangle className="w-4 h-4" /> Help & Support
        </button>
      </div>

      {/* BOOKING CARD */}
      <div className="bg-white rounded-xl shadow-md p-8 border-t-4 border-blue-900 animate-fade-in">
        <h2 className="text-2xl font-bold mb-6 text-gray-800 flex items-center gap-2">
          <Truck className="w-6 h-6 text-blue-900" /> Book New Shipment
        </h2>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <div>
            <label className="block text-sm font-bold text-gray-600 mb-2">Pickup City</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-3.5 w-5 h-5 text-gray-400" />
              <select 
                value={pickupLocation} 
                onChange={(e) => {
                  setPickupLocation(e.target.value);
                  setDropLocation('');
                }} 
                className="w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-white cursor-pointer"
              >
                <option value="">Select Origin City...</option>
                {originCities.map(city => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
            </div>
            {originCities.length === 0 && !fetching && (
              <p className="text-xs text-amber-600 mt-1">No origin cities available</p>
            )}
          </div>
          
          <div>
            <label className="block text-sm font-bold text-gray-600 mb-2">Drop City</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-3.5 w-5 h-5 text-gray-400" />
              <select 
                value={dropLocation} 
                onChange={(e) => setDropLocation(e.target.value)} 
                className="w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-white cursor-pointer"
                disabled={!pickupLocation}
              >
                <option value="">
                  {!pickupLocation ? 'Select pickup city first...' : 'Select Destination City...'}
                </option>
                {uniqueDestinationCities.map((city, index) => (
                  <option key={`${city}-${index}`} value={city}>{city}</option>
                ))}
              </select>
            </div>
            {pickupLocation && uniqueDestinationCities.length === 0 && (
              <p className="text-xs text-red-500 mt-1">No destinations available from {pickupLocation}</p>
            )}
          </div>
        </div>

        {/* Show unique destinations - NO DUPLICATES */}
        {pickupLocation && uniqueDestinationCities.length > 0 && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm font-semibold text-green-800 mb-2">
              ✓ Available destinations for {pickupLocation}:
            </p>
            <div className="flex flex-wrap gap-2">
              {uniqueDestinationCities.map((city, index) => (
                <span 
                  key={`badge-${city}-${index}`} 
                  className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium"
                >
                  {city}
                </span>
              ))}
            </div>
            <p className="text-xs text-green-600 mt-2">
              Total: {uniqueDestinationCities.length} destination(s)
            </p>
          </div>
        )}

        {/* ITEMS LIST */}
        <div className="space-y-4 mb-6">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-gray-700">Package Details</h3>
            <button onClick={addItem} className="text-sm font-bold text-blue-600 flex items-center gap-1 hover:underline">
              <Plus className="w-4 h-4" /> Add Another Package
            </button>
          </div>
          {items.map((item, index) => (
            <div key={item.id} className="p-4 bg-gray-50 border border-gray-200 rounded-xl relative animate-slide-up">
              <div className="flex justify-between mb-3">
                <span className="text-xs font-bold text-gray-400 uppercase">Package #{index + 1}</span>
                {items.length > 1 && <button onClick={() => removeItem(item.id)} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>}
              </div>
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <div className="relative">
                    <Package className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                    <input 
                      type="text" 
                      placeholder="Item Name" 
                      value={item.name} 
                      onChange={(e) => handleItemChange(item.id, 'name', e.target.value)} 
                      className={`w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none ${errors[item.id]?.name ? 'border-red-500' : ''}`} 
                    />
                    {errors[item.id]?.name && <p className="text-red-500 text-xs mt-1">{errors[item.id].name}</p>}
                  </div>
                </div>
                <div>
                  <div className="flex">
                    <div className="relative flex-1">
                      <Scale className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                      <input 
                        type="number" 
                        placeholder="Weight" 
                        value={item.weight} 
                        onChange={(e) => handleItemChange(item.id, 'weight', e.target.value)} 
                        className={`w-full pl-9 pr-3 py-2 border-y border-l rounded-l-lg text-sm outline-none ${errors[item.id]?.weight ? 'border-red-500' : ''}`} 
                      />
                    </div>
                    <select 
                      value={item.unit} 
                      onChange={(e) => handleItemChange(item.id, 'unit', e.target.value)} 
                      className="bg-white border border-gray-200 text-gray-700 text-sm px-2 rounded-r-lg font-bold"
                    >
                      <option value="kg">KG</option>
                      <option value="tonnes">T</option>
                    </select>
                  </div>
                  {errors[item.id]?.weight && <p className="text-red-500 text-xs mt-1">{errors[item.id].weight}</p>}
                </div>
                <div>
                  <div className="relative">
                    <Ruler className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                    <input 
                      type="text" 
                      placeholder="L x W x H (ft)" 
                      value={item.dimensions} 
                      onChange={(e) => handleItemChange(item.id, 'dimensions', e.target.value)} 
                      className={`w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none ${errors[item.id]?.dimensions ? 'border-red-500' : ''}`} 
                    />
                    {errors[item.id]?.dimensions && <p className="text-red-500 text-xs mt-1">{errors[item.id].dimensions}</p>}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* TOTAL COST */}
        {calculatedCost > 0 && (
          <div className="mb-4 bg-blue-50 border border-blue-100 rounded-xl p-5 flex flex-col md:flex-row items-center justify-between gap-4 animate-scale-in">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-100 rounded-full text-blue-700">
                <IndianRupee className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-bold text-blue-900 uppercase tracking-wide">Total Shipment Cost</p>
                <p className="text-3xl font-extrabold text-blue-800">₹{calculatedCost.toLocaleString()}</p>
              </div>
            </div>
          </div>
        )}

        {/* CONFIRM & BOOK BUTTON */}
        <div className="mb-6">
          <button 
            onClick={handleBookShipment} 
            disabled={loading || hasErrors} 
            className={`w-full px-8 py-3 bg-blue-900 text-white rounded-lg font-bold shadow-lg flex items-center justify-center gap-2 ${loading || hasErrors ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-800'}`}
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Confirm & Book <ArrowRight className="w-5 h-5" /></>}
          </button>
        </div>
      </div>

      {/* RECENT ACTIVITY */}
      <h3 className="text-xl font-bold text-gray-900">Recent Activity</h3>
      <div className="space-y-4">
        {fetching ? (
          <div className="text-center py-10 text-gray-400"><Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" /> Loading History...</div>
        ) : activeShipments.length === 0 ? (
          <div className="text-center py-10 bg-white rounded-xl border border-dashed border-gray-300 text-gray-400">No recent shipments found.</div>
        ) : activeShipments.map(shipment => (
          <div key={shipment._id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 animate-fade-in">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h4 className="text-lg font-bold text-gray-800">{shipment.shipmentId}</h4>
                <div className="flex items-center gap-2 text-sm text-gray-600 mt-1">
                  <span className="font-medium">{shipment.from}</span>
                  <ArrowRight className="w-3 h-3 text-gray-300" />
                  <span className="font-medium">{shipment.to}</span>
                </div>
              </div>

              <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase flex items-center gap-1 ${
                shipment.status === 'Delivered' ? 'bg-emerald-100 text-emerald-800' :
                shipment.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' : 
                'bg-blue-100 text-blue-800'
              }`}>
                {shipment.status === 'Delivered' && <CheckCircle className="w-3 h-3" />}
                {shipment.status}
              </span>
            </div>
            <StatusStepper currentStatus={shipment.status} />
          </div>
        ))}
      </div>

      {/* SUPPORT MODAL */}
      <Modal isOpen={isSupportOpen} onClose={() => setIsSupportOpen(false)} title="Report an Issue">
        <form onSubmit={handleSubmitComplaint} className="space-y-4">
          <div className="bg-blue-50 p-4 rounded-lg flex gap-3 text-sm text-blue-800 border border-blue-100">
            <MessageSquare className="w-5 h-5 shrink-0" />
            <p>Please describe your issue clearly.</p>
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Subject</label>
            <input required type="text" className="w-full px-4 py-2 border rounded-lg" value={complaint.subject} onChange={(e) => setComplaint({...complaint, subject: e.target.value})} />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Description</label>
            <textarea required rows="4" className="w-full px-4 py-2 border rounded-lg" value={complaint.message} onChange={(e) => setComplaint({...complaint, message: e.target.value})} />
          </div>
          <button className="w-full bg-red-600 text-white py-3 rounded-lg font-bold shadow-lg">Submit Complaint</button>
        </form>
      </Modal>
    </div>
  );
};

export default SenderDashboard;