import React, { useState, useEffect } from 'react';
import { MapPin, Plus, Trash2, Loader2, User, Edit2, AlertCircle, Truck } from 'lucide-react'; 
import axios from 'axios';
import { Modal } from './Shared';

const AdminRoutes = ({ onShowToast }) => {
  const [routes, setRoutes] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [activeShipments, setActiveShipments] = useState([]); // Track busy status
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Modal & Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState(null);

  const [routeForm, setRouteForm] = useState({
    origin: '',
    destination: '',
    distance: '',
    preferredDriver: ''
  });

  // Fetch Routes, Drivers & Active Shipments
  const fetchData = async () => {
    try {
      const [routesRes, driversRes, shipmentsRes] = await Promise.all([
        axios.get('http://localhost:5000/api/routes'),
        axios.get('http://localhost:5000/api/drivers/active'),
        axios.get('http://localhost:5000/api/shipments/all') 
      ]);
      setRoutes(routesRes.data);
      setDrivers(driversRes.data);
      
      // Filter shipments that are currently "On the road"
      setActiveShipments(shipmentsRes.data.filter(s => 
        !['Delivered', 'Cancelled'].includes(s.status)
      ));
    } catch (err) {
      console.error(err);
      onShowToast('Failed to load data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // Open Add Modal
  const handleOpenAdd = () => {
    setRouteForm({ origin: '', destination: '', distance: '', preferredDriver: '' });
    setIsEditing(false);
    setSelectedRouteId(null);
    setIsModalOpen(true);
  };

  // Open Edit Modal with Busy Check
  const handleOpenEdit = (route) => {
    const driverId = route.preferredDriver?._id || route.preferredDriver;
    const isBusy = activeShipments.some(s => (s.driver?._id || s.driver) === driverId);
    
    // Safety Lock: if busy, don't open modal
    if(isBusy) {
        onShowToast("Safety Lock: Driver is currently on a trip. Cannot modify route.", "error");
        return;
    }

    setRouteForm({
      origin: route.origin,
      destination: route.destination,
      distance: route.distance,
      preferredDriver: route.preferredDriver?._id || ''
    });
    setIsEditing(true);
    setSelectedRouteId(route._id);
    setIsModalOpen(true);
  };

  // Submit Handler
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validation: Only Uppercase Letters for Cities
    if (!/^[A-Z\s]+$/.test(routeForm.origin) || !/^[A-Z\s]+$/.test(routeForm.destination)) {
      return onShowToast('City names must contain only letters!', 'error');
    }
    // Validation: Numeric Distance
    if (!/^[0-9]+$/.test(routeForm.distance)) {
      return onShowToast('Distance must be numeric!', 'error');
    }

    setSubmitting(true);
    try {
      const payload = { 
        ...routeForm, 
        distance: Number(routeForm.distance),
        preferredDriver: routeForm.preferredDriver || null 
      };

      if (isEditing) {
        await axios.put(`http://localhost:5000/api/routes/${selectedRouteId}`, payload);
        onShowToast('Route Updated Successfully!');
      } else {
        await axios.post('http://localhost:5000/api/routes', payload);
        onShowToast('Route Added Successfully!');
      }

      setIsModalOpen(false);
      fetchData();
    } catch (err) {
      onShowToast(err.response?.data?.error || 'Operation Failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Handler with Busy Check
  const handleDelete = async (route) => {
    const driverId = route.preferredDriver?._id || route.preferredDriver;
    const isBusy = activeShipments.some(s => (s.driver?._id || s.driver) === driverId);

    if (isBusy) {
      return onShowToast('Safety Lock: Cannot delete an active route. Driver is in transit!', 'error');
    }

    if (route.preferredDriver) {
      return onShowToast('Cannot delete! Please unassign the driver first.', 'error');
    }

    if (!window.confirm(`Are you sure you want to delete the route: ${route.origin} to ${route.destination}?`)) return;
    
    try {
      await axios.delete(`http://localhost:5000/api/routes/${route._id}`);
      onShowToast('Route Deleted Successfully');
      fetchData(); 
    } catch (err) {
      onShowToast(err.response?.data?.error || 'Failed to delete route', 'error');
    }
  };

  if (loading) return (
    <div className="p-10 flex justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">Manage Routes & Drivers</h2>
        <button onClick={handleOpenAdd} className="flex items-center gap-2 bg-blue-900 text-white px-4 py-2 rounded-lg font-bold shadow-md hover:bg-blue-800 transition-transform active:scale-95">
          <Plus className="w-4 h-4" /> Add New Route
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Origin</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Destination</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Distance</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Designated Driver</th>
              <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {routes.length === 0 ? (
              <tr><td colSpan="5" className="text-center py-8 text-gray-400">No routes defined.</td></tr>
            ) : routes.map(route => {
              const driverId = route.preferredDriver?._id || route.preferredDriver;
              const driverObj = drivers.find(d => d._id === driverId);
              const isBusy = activeShipments.some(s => (s.driver?._id || s.driver) === driverId);

              return (
                <tr key={route._id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 font-medium text-gray-800 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-blue-500"/> {route.origin}
                  </td>
                  <td className="px-6 py-4 font-medium text-gray-800">{route.destination}</td>
                  <td className="px-6 py-4 text-gray-600">{route.distance} km</td>
                  <td className="px-6 py-4">
                    {driverObj ? (
                      <div className="flex flex-col gap-1">
                        <div className={`flex items-center gap-2 text-xs font-bold ${isBusy ? 'text-amber-700 bg-amber-50 border-amber-100' : 'text-indigo-700 bg-indigo-50 border-indigo-100'} px-3 py-1.5 rounded-full border w-fit`}>
                          <User className="w-3 h-3" />
                          {driverObj.name} {driverObj.driverDetails?.assignedVehicleId?.number ? `(${driverObj.driverDetails.assignedVehicleId.number})` : ''}
                        </div>
                        {isBusy && (
                          <div className="flex items-center gap-1 text-[10px] font-black text-amber-600 uppercase pl-2 animate-pulse">
                            <AlertCircle className="w-3 h-3" /> Currently on Trip
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 italic pl-1">Any Available</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleOpenEdit(route)}
                        // Disable UI style if busy
                        className={`p-2 rounded-full transition-colors ${isBusy ? 'text-gray-300 cursor-not-allowed' : 'text-blue-600 hover:bg-blue-50'}`}
                        title={isBusy ? "Cannot edit during trip" : "Edit Route"}
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => handleDelete(route)} 
                        // Disable UI style if busy or driver assigned
                        className={`p-2 rounded-full transition-colors ${isBusy || route.preferredDriver ? 'text-gray-300 cursor-not-allowed' : 'text-red-500 hover:bg-red-50'}`}
                        title={isBusy ? "Cannot delete during trip" : "Delete Route"}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={isEditing ? "Edit Route Details" : "Add Route & Assign Driver"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Origin City</label>
              <input
                required
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none uppercase"
                placeholder="MUMBAI"
                value={routeForm.origin}
                onChange={(e) => setRouteForm({...routeForm, origin: e.target.value.toUpperCase()})}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Destination City</label>
              <input
                required
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none uppercase"
                placeholder="PUNE"
                value={routeForm.destination}
                onChange={(e) => setRouteForm({...routeForm, destination: e.target.value.toUpperCase()})}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Distance (in km)</label>
            <input
              required
              className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="150"
              value={routeForm.distance}
              onChange={(e) => setRouteForm({...routeForm, distance: e.target.value.replace(/\D/g, '')})}
            />
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Designated Driver (Optional)</label>
            <select
              className="w-full p-2 border rounded bg-white focus:ring-2 focus:ring-blue-500 outline-none"
              value={routeForm.preferredDriver}
              onChange={(e) => setRouteForm({...routeForm, preferredDriver: e.target.value})}
            >
              <option value="">-- No Specific Driver --</option>
              {drivers.filter(d => {
                const assignedRoute = routes.find(r => (r.preferredDriver?._id || r.preferredDriver) === d._id);
                if (!assignedRoute) return true;
                if (isEditing && assignedRoute._id === selectedRouteId) return true;
                return false;
              }).map(d => (
                <option key={d._id} value={d._id}>
                  {d.name} {d.driverDetails?.assignedVehicleId ? `(${d.driverDetails.assignedVehicleId.number})` : '(No Vehicle)'}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-gray-400 mt-1">Unassigned drivers only.</p>
          </div>

          <button disabled={submitting} className="w-full bg-blue-900 text-white py-3 rounded-lg font-bold hover:bg-blue-800 transition-colors shadow-md">
            {submitting ? 'Saving...' : isEditing ? "Update Route" : "Save Route Configuration"}
          </button>
        </form>
      </Modal>
    </div>
  );
};

export default AdminRoutes;