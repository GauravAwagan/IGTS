import React, { useState, useEffect } from 'react';
import { Search, Truck, Link, User, Plus, Edit2, Loader2, Trash2, MoreVertical, MapPin, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { Modal } from './Shared';
import axios from 'axios';

const AdminDrivers = ({ onShowToast }) => {
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);

  // Selection & Edit States
  const [selectedDriverId, setSelectedDriverId] = useState(null);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [activeActionId, setActiveActionId] = useState(null);
  const [isEditing, setIsEditing] = useState(false);

  // Driver Form & Validation State
  const [driverForm, setDriverForm] = useState({
    name: '', email: '', phone: '', password: '', confirmPassword: '', location: ''
  });
  const [formErrors, setFormErrors] = useState({});

  // --- 1. FETCH DATA ---
  const fetchData = async () => {
    try {
      const [driversRes, vehiclesRes] = await Promise.all([
        axios.get('http://localhost:5000/api/drivers/all'),
        axios.get('http://localhost:5000/api/vehicles')
      ]);
      setDrivers(driversRes.data);
      setVehicles(vehiclesRes.data);
    } catch (err) {
      console.error(err);
      onShowToast('Failed to load data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // --- 2. REAL-TIME VALIDATION FUNCTIONS ---
  const validateName = (value) => {
    let error = '';
    const trimmed = value.trim();
    if (!trimmed) error = "Name is required";
    else if (trimmed.length < 3) error = "Name must be at least 3 characters";
    else if (drivers.find(d => d.name.toLowerCase() === trimmed.toLowerCase() && d._id !== selectedDriverId)) 
      error = "This name is already used by another driver";
    setFormErrors(prev => ({ ...prev, name: error }));
  };

  const validateEmail = (value) => {
    let error = '';
    const trimmed = value.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmed) error = "Email is required";
    else if (!emailRegex.test(trimmed)) error = "Enter a valid email address";
    else if (drivers.find(d => d.email.toLowerCase() === trimmed.toLowerCase() && d._id !== selectedDriverId))
      error = "This email is already used by another driver";
    setFormErrors(prev => ({ ...prev, email: error }));
  };

  const validatePhone = (value) => {
    let error = '';
    const trimmed = value.trim();
    const phoneRegex = /^[0-9]{10}$/;
    if (!trimmed) error = "Phone is required";
    else if (trimmed.length !== 10) error = "Phone must be exactly 10 digits";
    else if (!phoneRegex.test(trimmed)) error = "Phone must contain only numbers";
    else if (drivers.find(d => d.phone === trimmed && d._id !== selectedDriverId))
      error = "This phone is already used by another driver";
    setFormErrors(prev => ({ ...prev, phone: error }));
  };

  const validatePassword = (value) => {
    let error = '';
    const strongPwdRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!isEditing) {
      if (!value) error = "Password is required";
      else if (!strongPwdRegex.test(value))
        error = "Password must be 8+ chars, include uppercase, lowercase, number & special char";
    } else if (value && !strongPwdRegex.test(value)) {
      error = "Password must be 8+ chars, include uppercase, lowercase, number & special char";
    }
    setFormErrors(prev => ({ ...prev, password: error }));

    // Confirm password matching
    if (driverForm.confirmPassword && value !== driverForm.confirmPassword) {
      setFormErrors(prev => ({ ...prev, confirmPassword: "Passwords do not match" }));
    } else if (driverForm.confirmPassword && value === driverForm.confirmPassword) {
      setFormErrors(prev => ({ ...prev, confirmPassword: '' }));
    }
  };

  const validateConfirmPassword = (value) => {
    let error = '';
    if (driverForm.password && value !== driverForm.password) error = "Passwords do not match";
    setFormErrors(prev => ({ ...prev, confirmPassword: error }));
  };

  const validateLocation = (value) => {
    let error = '';
    if (!value.trim()) error = "Location is required";
    setFormErrors(prev => ({ ...prev, location: error }));
  };

  const validateForm = () => {
    validateName(driverForm.name);
    validateEmail(driverForm.email);
    validatePhone(driverForm.phone);
    validatePassword(driverForm.password);
    validateConfirmPassword(driverForm.confirmPassword);
    validateLocation(driverForm.location);
    return Object.values(formErrors).every(err => !err);
  };

  // --- 3. FORM HANDLERS ---
  const handleOpenAdd = () => {
    setDriverForm({ name: '', email: '', phone: '', password: '', confirmPassword: '', location: '' });
    setFormErrors({});
    setIsEditing(false);
    setSelectedDriverId(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (driver) => {
    setDriverForm({
      name: driver.name,
      email: driver.email,
      phone: driver.phone,
      password: '',
      confirmPassword: '',
      location: driver.location || driver.address || ''
    });
    setFormErrors({});
    setIsEditing(true);
    setSelectedDriverId(driver._id);
    setIsModalOpen(true);
    setActiveActionId(null);
  };

  const handleSubmitDriver = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      const payload = { ...driverForm };
      delete payload.confirmPassword;

      if (isEditing) {
        if (!payload.password) delete payload.password;
        await axios.put(`http://localhost:5000/api/drivers/${selectedDriverId}`, payload);
        onShowToast('Driver Updated Successfully!');
      } else {
        await axios.post('http://localhost:5000/api/auth/register', { ...payload, role: 'driver' });
        onShowToast('Driver Registered Successfully!');
      }

      setIsModalOpen(false);
      fetchData();
    } catch (err) {
      onShowToast(err.response?.data?.error || 'Operation failed', 'error');
    }
  };

  // Updated: Check if driver is busy before allowing vehicle assignment
  const handleOpenAssignModal = (driver) => {
    // Check if driver is busy (has active shipments)
    const isDriverBusy = driver.driverDetails?.isAvailable === false;
    
    if (isDriverBusy) {
      onShowToast(`Cannot change vehicle for ${driver.name} because they are currently busy with shipments.`, 'error');
      return;
    }
    
    setSelectedDriverId(driver._id);
    setSelectedDriver(driver);
    setIsAssignModalOpen(true);
    setActiveActionId(null);
  };

  const handleAssignVehicle = async (vehicleId) => {
    try {
      // Double-check if driver is still available before assignment
      const currentDriver = drivers.find(d => d._id === selectedDriverId);
      if (currentDriver && currentDriver.driverDetails?.isAvailable === false) {
        onShowToast(`Cannot change vehicle - driver is currently busy with shipments.`, 'error');
        setIsAssignModalOpen(false);
        return;
      }

      await axios.put('http://localhost:5000/api/vehicles/assign', {
        driverId: selectedDriverId,
        vehicleId: vehicleId
      });
      onShowToast(vehicleId ? 'Vehicle Assigned!' : 'Vehicle Unassigned!');
      setIsAssignModalOpen(false);
      fetchData();
    } catch (err) {
      onShowToast('Assignment Failed', 'error');
    }
  };

  const handleDelete = async (driver) => {
    // Check if driver is busy
    if (driver.driverDetails?.isAvailable === false) {
      onShowToast(`Cannot delete ${driver.name} because they are currently busy with shipments.`, 'error');
      return;
    }

    if (driver.driverDetails?.assignedVehicleId) {
      onShowToast(`Cannot delete ${driver.name} because they have an assigned vehicle.`, 'error');
      return;
    }

    if (window.confirm(`Are you sure you want to permanently delete ${driver.name}?`)) {
      try {
        await axios.delete(`http://localhost:5000/api/drivers/${driver._id}`);
        onShowToast(`${driver.name} deleted successfully!`);
        fetchData();
      } catch (err) {
        onShowToast(err.response?.data?.error || 'Failed to delete driver', 'error');
      }
    }
  };

  if (loading) return <div className="p-10 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;

  return (
    <div className="space-y-6" onClick={() => setActiveActionId(null)}>
      {/* HEADER */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Drivers List</h2>
          <p className="text-sm text-gray-500">Manage drivers and fleet assignments.</p>
        </div>
        <button onClick={handleOpenAdd} className="flex items-center gap-2 bg-blue-900 text-white px-4 py-2 rounded-lg font-bold shadow-md hover:bg-blue-800 transition-transform active:scale-95">
          <Plus className="w-4 h-4" /> Register Driver
        </button>
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase bg-gray-50">Driver Name</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase bg-gray-50">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase bg-gray-50">Assigned Vehicle</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase bg-gray-50">Location</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase bg-gray-50">Contact</th>
                <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase bg-gray-50">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {drivers.map(driver => (
                <tr key={driver._id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                      driver.driverDetails?.isAvailable === false 
                        ? 'bg-orange-100 text-orange-700' 
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {driver.name?.charAt(0)}
                    </div>
                    <span className="font-bold text-gray-800">{driver.name}</span>
                  </td>
                  <td className="px-6 py-4">
                    {driver.driverDetails?.isAvailable !== false ? (
                      <span className="flex items-center gap-1.5 bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold w-fit border border-green-200">
                        <CheckCircle className="w-3 h-3" /> Available
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-xs font-bold w-fit border border-orange-200">
                        <Clock className="w-3 h-3" /> Busy
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {driver.driverDetails?.assignedVehicleId ? (
                      <div className="flex flex-col">
                        <span className="flex items-center gap-2 text-blue-700 font-bold bg-blue-50 px-3 py-1 rounded-full text-xs w-fit border border-blue-100">
                          <Truck className="w-3 h-3" /> {driver.driverDetails.assignedVehicleId.number}
                        </span>
                        <span className="text-[10px] text-gray-400 pl-2 mt-0.5">{driver.driverDetails.assignedVehicleId.type}</span>
                      </div>
                    ) : (
                      <span className="text-gray-400 italic text-sm flex items-center gap-1"><Link className="w-3 h-3" /> Unassigned</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-gray-400" /> {driver.location || driver.address || 'Not Set'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{driver.phone}</td>
                  <td className="px-6 py-4 text-right relative">
                    <button 
                      onClick={(e) => { e.stopPropagation(); setActiveActionId(activeActionId === driver._id ? null : driver._id); }} 
                      className="p-2 hover:bg-gray-100 rounded-full text-gray-500"
                    >
                      <MoreVertical className="w-5 h-5" />
                    </button>
                    {activeActionId === driver._id && (
                      <div className="absolute right-8 top-8 w-48 bg-white rounded-lg shadow-xl border border-gray-100 z-50 animate-fade-in py-1" onClick={(e) => e.stopPropagation()}>
                        <button 
                          onClick={() => handleOpenEdit(driver)} 
                          className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-blue-50 flex items-center gap-2 transition-colors"
                        >
                          <Edit2 className="w-4 h-4 text-blue-600" /> Edit Details
                        </button>
                        <button 
                          onClick={() => handleOpenAssignModal(driver)} 
                          disabled={driver.driverDetails?.isAvailable === false}
                          className={`w-full text-left px-4 py-3 text-sm flex items-center gap-2 transition-colors ${
                            driver.driverDetails?.isAvailable === false 
                              ? 'text-gray-400 cursor-not-allowed hover:bg-gray-50' 
                              : 'text-gray-700 hover:bg-blue-50'
                          }`}
                        >
                          <Link className={`w-4 h-4 ${driver.driverDetails?.isAvailable === false ? 'text-gray-400' : 'text-emerald-600'}`} />
                          {driver.driverDetails?.assignedVehicleId ? 'Change Vehicle' : 'Assign Vehicle'}
                          {driver.driverDetails?.isAvailable === false && (
                            <span className="text-[10px] text-gray-400 ml-1">(Busy)</span>
                          )}
                        </button>
                        <button 
                          onClick={() => handleDelete(driver)} 
                          disabled={driver.driverDetails?.isAvailable === false}
                          className={`w-full text-left px-4 py-3 text-sm flex items-center gap-2 transition-colors ${
                            driver.driverDetails?.isAvailable === false 
                              ? 'text-gray-400 cursor-not-allowed hover:bg-gray-50' 
                              : 'text-red-600 hover:bg-red-50'
                          }`}
                        >
                          <Trash2 className="w-4 h-4" /> Delete Driver
                          {driver.driverDetails?.isAvailable === false && (
                            <span className="text-[10px] text-gray-400 ml-1">(Busy)</span>
                          )}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* DRIVER MODAL */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={isEditing ? "Edit Driver Details" : "Register New Driver"}>
        <form onSubmit={handleSubmitDriver} className="space-y-4">
          {/* Name */}
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase">Full Name</label>
            <input
              className={`w-full p-2 border rounded outline-none ${formErrors.name ? 'border-red-500 bg-red-50' : 'focus:border-blue-500'}`}
              value={driverForm.name}
              onChange={e => {
                const val = e.target.value.replace(/[0-9]/g, '');
                setDriverForm(prev => ({ ...prev, name: val }));
                validateName(val);
              }}
            />
            {formErrors.name && <p className="text-[10px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{formErrors.name}</p>}
          </div>

          {/* Email */}
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase">Email</label>
            <input
              className={`w-full p-2 border rounded outline-none ${formErrors.email ? 'border-red-500 bg-red-50' : 'focus:border-blue-500'}`}
              value={driverForm.email}
              onChange={e => {
                setDriverForm(prev => ({ ...prev, email: e.target.value }));
                validateEmail(e.target.value);
              }}
            />
            {formErrors.email && <p className="text-[10px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{formErrors.email}</p>}
          </div>

          {/* Phone */}
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase">Phone (10 Digits)</label>
            <input
              type="text"
              maxLength="10"
              className={`w-full p-2 border rounded outline-none ${formErrors.phone ? 'border-red-500 bg-red-50' : 'focus:border-blue-500'}`}
              value={driverForm.phone}
              onChange={e => {
                const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 10);
                setDriverForm(prev => ({ ...prev, phone: val }));
                validatePhone(val);
              }}
            />
            {formErrors.phone && <p className="text-[10px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{formErrors.phone}</p>}
          </div>

          {/* Password */}
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase">Password {isEditing && <span className="text-gray-400 font-normal">(Leave blank to keep unchanged)</span>}</label>
            <input
              type="password"
              className={`w-full p-2 border rounded outline-none ${formErrors.password ? 'border-red-500 bg-red-50' : 'focus:border-blue-500'}`}
              value={driverForm.password}
              onChange={e => {
                setDriverForm(prev => ({ ...prev, password: e.target.value }));
                validatePassword(e.target.value);
              }}
            />
            {formErrors.password && <p className="text-[10px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{formErrors.password}</p>}
          </div>

          {/* Confirm Password */}
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase">
              Confirm Password {isEditing && <span className="text-gray-400 font-normal">(Leave blank to keep unchanged)</span>}
            </label>
            <input
              type="password"
              className={`w-full p-2 border rounded outline-none ${formErrors.confirmPassword ? 'border-red-500 bg-red-50' : 'focus:border-blue-500'}`}
              value={driverForm.confirmPassword}
              onChange={e => {
                setDriverForm(prev => ({ ...prev, confirmPassword: e.target.value }));
                validateConfirmPassword(e.target.value);
              }}
            />
            {formErrors.confirmPassword && <p className="text-[10px] text-red-500 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{formErrors.confirmPassword}</p>}
          </div>

          {/* Location */}
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase">Location</label>
            <input
              className={`w-full p-2 border rounded outline-none ${formErrors.location ? 'border-red-500 bg-red-50' : 'focus:border-blue-500'}`}
              value={driverForm.location}
              onChange={e => {
                const val = e.target.value.toUpperCase();
                setDriverForm(prev => ({ ...prev, location: val }));
                validateLocation(val);
              }}
            />
            {formErrors.location && (
              <p className="text-[10px] text-red-500 mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />{formErrors.location}
              </p>
            )}
          </div>

          <button className="w-full bg-blue-900 text-white py-3 rounded-lg font-bold hover:bg-blue-800 transition-colors shadow-md mt-4">
            {isEditing ? "Update Driver" : "Register Driver"}
          </button>
        </form>
      </Modal>

      {/* ASSIGN VEHICLE MODAL */}
      <Modal isOpen={isAssignModalOpen} onClose={() => setIsAssignModalOpen(false)} title="Assign Vehicle">
        <div className="space-y-3">
          {selectedDriver && (
            <div className="mb-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
              <p className="text-sm font-semibold text-blue-800">Driver: {selectedDriver.name}</p>
              <p className="text-xs text-blue-600">Status: {selectedDriver.driverDetails?.isAvailable !== false ? 'Available' : 'Busy'}</p>
            </div>
          )}
          <p className="text-sm text-gray-500 mb-2">Select a vehicle from the fleet:</p>
          <div className="flex items-center gap-3 p-3 border border-red-200 bg-red-50 rounded-lg hover:bg-red-100 cursor-pointer mb-2" onClick={() => handleAssignVehicle(null)}>
            <Trash2 className="w-5 h-5 text-red-500" />
            <p className="font-bold text-sm text-red-700">Unassign Current Vehicle</p>
          </div>
          <div className="max-h-60 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {vehicles.filter(v => v.status === 'Available' || v.currentDriverId?._id === selectedDriverId).map(v => (
              <div key={v._id} className="flex justify-between items-center p-3 border rounded-lg hover:bg-blue-50 cursor-pointer group" onClick={() => handleAssignVehicle(v._id)}>
                <div className="flex items-center gap-3">
                  <Truck className="w-4 h-4 text-gray-500" />
                  <div><p className="font-bold text-sm text-gray-800">{v.number}</p><p className="text-xs text-gray-500">{v.type}</p></div>
                </div>
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded border border-emerald-100 uppercase">AVAILABLE</span>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default AdminDrivers;