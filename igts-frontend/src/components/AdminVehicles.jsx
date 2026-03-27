import React, { useState, useEffect } from 'react';
import { Truck, Plus, Loader2, X, Trash2 } from 'lucide-react';
import { Modal } from './Shared';
import axios from 'axios';

const AdminVehicles = ({ onShowToast }) => {
  const [vehicles, setVehicles] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [newVehicle, setNewVehicle] = useState({ number: '', type: '', capacity: '', fuelType: 'Diesel' });
  const [isCustomType, setIsCustomType] = useState(false);
  const [vehicleTypes, setVehicleTypes] = useState(['Tata Ace', 'Ashok Leyland', 'Tata 407', 'Eicher Pro']);

  const [errors, setErrors] = useState({ number: '', type: '', capacity: '' });

  // Fetch Vehicles and Routes
  const fetchData = async () => {
    try {
      const [vehiclesRes, routesRes] = await Promise.all([
        axios.get('http://localhost:5000/api/vehicles'),
        axios.get('http://localhost:5000/api/routes')
      ]);
      setVehicles(vehiclesRes.data);
      setRoutes(routesRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // Real-time validation
  const validateField = (field, value) => {
    let msg = '';
    if (field === 'number') {
      const regex = /^[A-Z]{2}-\d{2}-[A-Z]{2}-\d{4}$/;
      if (!value) msg = 'Vehicle number is required';
      else if (!regex.test(value)) msg = 'Format: MH-12-XX-6464';
      else if (vehicles.some(v => v.number === value)) msg = 'Vehicle already exists';
    }
    if (field === 'type') {
      if (!value.trim()) msg = 'Vehicle type is required';
    }
    if (field === 'capacity') {
      if (!value) msg = 'Capacity is required';
      else if (Number(value) <= 0) msg = 'Capacity must be > 0';
    }
    setErrors(prev => ({ ...prev, [field]: msg }));
  };

  const handleInputChange = (field, value) => {
    if (field === 'number') value = value.toUpperCase();
    setNewVehicle(prev => ({ ...prev, [field]: value }));
    validateField(field, value);
  };

  const handleTypeChange = (e) => {
    const val = e.target.value;
    if (val === 'custom') {
      setIsCustomType(true);
      setNewVehicle(prev => ({ ...prev, type: '' }));
    } else {
      setIsCustomType(false);
      handleInputChange('type', val);
    }
  };

  const handleAddVehicle = async (e) => {
    e.preventDefault();

    Object.keys(newVehicle).forEach(field => validateField(field, newVehicle[field]));
    if (Object.values(errors).some(err => err)) return;

    try {
      await axios.post('http://localhost:5000/api/vehicles', newVehicle);

      if (isCustomType && newVehicle.type && !vehicleTypes.includes(newVehicle.type)) {
        setVehicleTypes([...vehicleTypes, newVehicle.type]);
      }

      onShowToast('Vehicle Added Successfully!');
      setIsModalOpen(false);
      fetchData();
      setNewVehicle({ number: '', type: '', capacity: '', fuelType: 'Diesel' });
      setErrors({ number: '', type: '', capacity: '' });
      setIsCustomType(false);
    } catch (err) {
      onShowToast(err.response?.data?.error || 'Failed to add vehicle', 'error');
    }
  };

  // 🚫 Prevent delete if vehicle is assigned
  const handleDeleteVehicle = async (vehicle) => {

    if (vehicle.currentDriverId) {
      onShowToast(
        `Vehicle ${vehicle.number} is assigned to ${vehicle.currentDriverId.name}. Unassign the driver first.`,
        'error'
      );
      return;
    }

    if (window.confirm(`Are you sure you want to delete vehicle ${vehicle.number}?`)) {
      try {
        await axios.delete(`http://localhost:5000/api/vehicles/${vehicle._id}`);
        onShowToast(`${vehicle.number} deleted successfully!`);
        fetchData();
      } catch (err) {
        onShowToast(err.response?.data?.error || 'Failed to delete vehicle', 'error');
      }
    }
  };

  if (loading) return <div className="p-10 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">Fleet Vehicles</h2>
        <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 bg-blue-900 text-white px-4 py-2 rounded-lg font-bold shadow-md hover:bg-blue-800 transition-transform active:scale-95">
          <Plus className="w-4 h-4" /> Add Vehicle
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {vehicles.map((vehicle) => {

          const assignedRoute = routes.find(r => r.preferredDriver?._id === vehicle.currentDriverId?._id);

          return (
            <div key={vehicle._id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
              <div className="bg-gray-50 p-4 border-b border-gray-100 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <Truck className="w-5 h-5 text-blue-600" />
                  <h3 className="font-bold text-lg text-gray-800">{vehicle.number}</h3>
                </div>

                <div className="flex items-center gap-3">
                  <span className={`px-2 py-1 text-[10px] font-bold uppercase rounded border ${vehicle.status === 'Available' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-orange-50 text-orange-600 border-orange-100'}`}>
                    {vehicle.status}
                  </span>

                  <button 
                    onClick={() => handleDeleteVehicle(vehicle)} 
                    className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-md transition-colors" 
                    title="Delete Vehicle"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                </div>
              </div>

              <div className="p-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Type:</span>
                  <span className="font-bold">{vehicle.type}</span>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Capacity:</span>
                  <span className="font-bold">{vehicle.capacity} kg</span>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Fuel:</span>
                  <span className="font-bold">{vehicle.fuelType || 'Diesel'}</span>
                </div>

                <div className="pt-3 border-t border-gray-50">
                  <p className="text-xs text-gray-400 uppercase font-bold mb-1">Current Driver</p>

                  {vehicle.currentDriverId ? (
                    <p className="text-sm font-bold text-blue-800">
                      {vehicle.currentDriverId.name}
                      {assignedRoute ? ` (${assignedRoute.origin} → ${assignedRoute.destination})` : ''}
                    </p>
                  ) : (
                    <p className="text-sm italic text-gray-400">Unassigned</p>
                  )}

                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Add New Vehicle">
        <form onSubmit={handleAddVehicle} className="space-y-4">

          <div>
            <label className="text-xs font-bold text-gray-500">Vehicle Number</label>
            <input 
              required
              className={`w-full p-2 border rounded outline-none focus:border-blue-500 ${errors.number ? 'border-red-500' : ''}`}
              placeholder="MH-12-XX-6464"
              value={newVehicle.number}
              onChange={(e) => handleInputChange('number', e.target.value)}
            />
            {errors.number && <p className="text-xs text-red-500 mt-1">{errors.number}</p>}
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500">Vehicle Type</label>

            {!isCustomType ? (
              <select 
                className={`w-full p-2 border rounded bg-white outline-none focus:border-blue-500 ${errors.type ? 'border-red-500' : ''}`}
                value={newVehicle.type}
                onChange={handleTypeChange}
                required
              >
                <option value="" disabled>Select Vehicle Type</option>

                {vehicleTypes.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}

                <option disabled className="text-gray-300">──────────</option>
                <option value="custom" className="text-blue-600 font-bold">+ Other (Add New)</option>
              </select>
            ) : (
              <div className="flex gap-2 animate-fade-in">
                <input
                  autoFocus
                  required
                  className={`w-full p-2 border rounded border-blue-500 ring-1 ring-blue-100 outline-none ${errors.type ? 'border-red-500' : ''}`}
                  placeholder="Enter vehicle model name..."
                  value={newVehicle.type}
                  onChange={(e) => handleInputChange('type', e.target.value)}
                />

                <button
                  type="button"
                  onClick={() => setIsCustomType(false)}
                  className="p-2 bg-gray-100 text-gray-600 rounded hover:bg-red-50 hover:text-red-500 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            )}

            {errors.type && <p className="text-xs text-red-500 mt-1">{errors.type}</p>}
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500">Capacity (kg)</label>

            <input
              required
              type="number"
              className={`w-full p-2 border rounded outline-none focus:border-blue-500 ${errors.capacity ? 'border-red-500' : ''}`}
              placeholder="e.g., 1000"
              value={newVehicle.capacity}
              onChange={(e) => handleInputChange('capacity', e.target.value)}
            />

            {errors.capacity && <p className="text-xs text-red-500 mt-1">{errors.capacity}</p>}
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500">Fuel Type</label>

            <select 
              className="w-full p-2 border rounded bg-white outline-none focus:border-blue-500"
              value={newVehicle.fuelType}
              onChange={(e) => setNewVehicle({...newVehicle, fuelType: e.target.value})}
            >
              <option>Diesel</option>
              <option>Petrol</option>
              <option>Electric</option>
              <option>CNG</option>
            </select>
          </div>

          <button className="w-full bg-blue-900 text-white py-3 rounded-lg font-bold hover:bg-blue-800 transition-colors shadow-lg active:scale-95 mt-2">
            Add Vehicle
          </button>

        </form>
      </Modal>
    </div>
  );
};

export default AdminVehicles;