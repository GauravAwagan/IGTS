import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, MapPin, Truck, CheckCircle, Download, FileText, Loader2, AlertCircle, Package, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { Modal } from './Shared';
import axios from 'axios';

const AdminShipments = ({ onShowToast, initialFilter }) => {
  const [shipments, setShipments] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshingDrivers, setRefreshingDrivers] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [lastRouteUpdate, setLastRouteUpdate] = useState(null);
  const [routeJustCreated, setRouteJustCreated] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedShipment, setSelectedShipment] = useState(null);
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [compatibleDrivers, setCompatibleDrivers] = useState([]);
  const [assignmentMessage, setAssignmentMessage] = useState('');
  const [lastFetchTime, setLastFetchTime] = useState(null);
  
  // Refs for polling intervals
  const pollIntervalRef = useRef(null);
  const routePollIntervalRef = useRef(null);

  // Initial filter
  useEffect(() => { 
    if (initialFilter) setSearchTerm(initialFilter); 
  }, [initialFilter]);

  // Helper function to normalize strings for comparison
  const normalizeString = (str) => {
    if (!str) return '';
    return str.toString().toLowerCase().trim().replace(/\s+/g, ' ').replace(/[^a-z0-9]/g, '');
  };

  // Calculate real-time load for a driver based on their assigned shipments
  const calculateDriverRealTimeLoad = (driver, allShipments) => {
    // Get vehicle capacity
    let capacity = 0;
    let vehicle = null;
    
    if (driver.driverDetails?.assignedVehicleId) {
      vehicle = driver.driverDetails.assignedVehicleId;
      capacity = vehicle.capacity || 0;
    } else if (driver.assignedVehicle) {
      vehicle = driver.assignedVehicle;
      capacity = vehicle.capacity || 0;
    } else if (driver.vehicle) {
      vehicle = driver.vehicle;
      capacity = vehicle.capacity || 0;
    }
    
    // Get all active shipments assigned to this driver (EXCLUDING the current shipment being assigned)
    const assignedShipments = allShipments.filter(shipment => 
      shipment.driver?._id === driver._id && 
      shipment.status !== 'Delivered' && 
      shipment.status !== 'Cancelled' &&
      shipment._id !== selectedShipment?._id // Don't count the shipment we're trying to assign
    );
    
    // Calculate total current load
    const currentLoad = assignedShipments.reduce((total, shipment) => {
      return total + (shipment.weight || 0);
    }, 0);
    
    const availableSpace = capacity - currentLoad;
    
    console.log(`\n=== LOAD FOR ${driver.name} ===`);
    console.log(`Driver ID: ${driver._id}`);
    console.log(`Capacity: ${capacity}kg`);
    console.log(`Current Load: ${currentLoad}kg`);
    console.log(`Available: ${availableSpace}kg`);
    console.log(`Active Shipments: ${assignedShipments.length}`);
    assignedShipments.forEach(s => {
      console.log(`  - ${s.shipmentId}: ${s.weight}kg, ${s.from}→${s.to}, ${s.status}`);
    });
    
    return {
      currentLoad,
      capacity,
      availableSpace,
      assignedShipmentsCount: assignedShipments.length,
      assignedShipments: assignedShipments.map(s => ({
        id: s.shipmentId,
        weight: s.weight,
        route: `${s.from} → ${s.to}`,
        status: s.status,
        from: s.from,
        to: s.to
      })),
      vehicleDetails: vehicle
    };
  };

  // Calculate route-specific load for a driver
  const calculateDriverRouteLoad = (driver, targetFrom, targetTo, allShipments) => {
    const normalizedTargetFrom = normalizeString(targetFrom);
    const normalizedTargetTo = normalizeString(targetTo);
    
    // Get all active shipments for this driver on the specific route (EXCLUDING current shipment)
    const routeShipments = allShipments.filter(shipment => 
      shipment.driver?._id === driver._id &&
      shipment.status !== 'Delivered' && 
      shipment.status !== 'Cancelled' &&
      normalizeString(shipment.from) === normalizedTargetFrom &&
      normalizeString(shipment.to) === normalizedTargetTo &&
      shipment._id !== selectedShipment?._id // Don't count current shipment
    );
    
    const totalRouteWeight = routeShipments.reduce((total, shipment) => {
      return total + (shipment.weight || 0);
    }, 0);
    
    return {
      routeShipments,
      totalRouteWeight,
      routeShipmentsCount: routeShipments.length,
      routeShipmentsList: routeShipments.map(s => ({
        id: s.shipmentId,
        weight: s.weight,
        status: s.status
      }))
    };
  };

  // Check if routes match with flexible comparison
  const doRoutesMatch = (route1From, route1To, route2From, route2To) => {
    const normalized1From = normalizeString(route1From);
    const normalized1To = normalizeString(route1To);
    const normalized2From = normalizeString(route2From);
    const normalized2To = normalizeString(route2To);
    
    // Check if routes are exactly the same
    if (normalized1From === normalized2From && normalized1To === normalized2To) {
      return true;
    }
    
    // Check if one contains the other (for variations like "MUMBAI" vs "MUMBAI CENTRAL")
    const fromMatches = normalized1From.includes(normalized2From) || normalized2From.includes(normalized1From);
    const toMatches = normalized1To.includes(normalized2To) || normalized2To.includes(normalized1To);
    
    return fromMatches && toMatches;
  };

  // Fetch data
  const fetchData = async () => {
    try {
      const [shipmentsRes, driversRes, routesRes] = await Promise.all([
        axios.get('http://localhost:5000/api/shipments/all'),
        axios.get('http://localhost:5000/api/drivers/active'),
        axios.get('http://localhost:5000/api/routes')
      ]);
      
      const allShipments = shipmentsRes.data;
      setShipments(allShipments.reverse());
      
      const driversWithRealTimeLoad = driversRes.data.map(driver => {
        const loadInfo = calculateDriverRealTimeLoad(driver, allShipments);
        return {
          ...driver,
          ...loadInfo
        };
      });
      
      setDrivers(driversWithRealTimeLoad);
      setRoutes(routesRes.data);
      setLastFetchTime(new Date());
      setLastRouteUpdate(new Date());
      setIsConnected(true);
      
      // Log driver status for debugging
      console.log('\n=== DRIVER STATUS ===');
      driversWithRealTimeLoad.forEach(driver => {
        console.log(`${driver.name}: ${driver.currentLoad}/${driver.capacity}kg available (${driver.availableSpace}kg left)`);
      });
      
      if (isModalOpen && selectedShipment) {
        calculateCompatibleDrivers(selectedShipment, driversWithRealTimeLoad, routesRes.data);
      }
    } catch (err) {
      console.error('Fetch error:', err);
      setIsConnected(false);
      if (onShowToast) onShowToast('Failed to load data', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Real-time refresh
  const refreshDriversRealTime = useCallback(async () => {
    if (!selectedShipment) return;
    
    setRefreshingDrivers(true);
    try {
      const [driversRes, routesRes, shipmentsRes] = await Promise.all([
        axios.get('http://localhost:5000/api/drivers/active'),
        axios.get('http://localhost:5000/api/routes'),
        axios.get('http://localhost:5000/api/shipments/all')
      ]);
      
      const allShipments = shipmentsRes.data;
      
      const driversWithRealTimeLoad = driversRes.data.map(driver => {
        const loadInfo = calculateDriverRealTimeLoad(driver, allShipments);
        return {
          ...driver,
          ...loadInfo
        };
      });
      
      setDrivers(driversWithRealTimeLoad);
      setRoutes(routesRes.data);
      setShipments(allShipments.reverse());
      setLastRouteUpdate(new Date());
      setIsConnected(true);
      
      calculateCompatibleDrivers(selectedShipment, driversWithRealTimeLoad, routesRes.data);
      setLastFetchTime(new Date());
    } catch (err) {
      console.error('Error refreshing:', err);
      setIsConnected(false);
    } finally {
      setRefreshingDrivers(false);
    }
  }, [selectedShipment]);

  // Calculate compatible drivers - FIXED with flexible route matching
  const calculateCompatibleDrivers = useCallback((shipment, driverList, routeList) => {
    if (!shipment) return;

    console.log('\n=== CALCULATING COMPATIBLE DRIVERS ===');
    console.log('Shipment:', shipment.shipmentId);
    console.log('Route:', shipment.from, '→', shipment.to);
    console.log('Weight:', shipment.weight, 'kg');
    
    const matchingDriverIds = new Set();
    let matchingRoute = null;
    
    // Log all available drivers for debugging
    console.log('\nAvailable drivers in system:');
    driverList.forEach(d => {
      console.log(`  ${d.name}: ${d.currentLoad}/${d.capacity}kg (${d.availableSpace}kg left)`);
      if (d.assignedShipments && d.assignedShipments.length > 0) {
        d.assignedShipments.forEach(s => {
          console.log(`    → Shipment ${s.id}: ${s.weight}kg on ${s.route}`);
        });
      }
    });
    
    // Method 1: Check route configuration
    console.log('\nMethod 1: Checking route configurations...');
    routeList.forEach(route => {
      if (doRoutesMatch(route.origin, route.destination, shipment.from, shipment.to)) {
        matchingRoute = route;
        console.log(`✓ Found matching route: ${route.origin} → ${route.destination}`);
        
        let driverId = null;
        if (route.preferredDriver) {
          if (typeof route.preferredDriver === 'object') {
            driverId = route.preferredDriver._id;
          } else {
            driverId = route.preferredDriver;
          }
        }
        
        if (driverId) {
          matchingDriverIds.add(driverId);
          console.log(`  Driver from config: ${driverId}`);
        }
      }
    });
    
    // Method 2: Check drivers with active shipments on this route
    console.log('\nMethod 2: Checking drivers with active shipments on this route...');
    shipments.forEach(s => {
      if (doRoutesMatch(s.from, s.to, shipment.from, shipment.to) &&
          s.driver?._id &&
          s.status !== 'Cancelled' &&
          s.status !== 'Delivered' &&
          s._id !== shipment._id) {
        
        console.log(`  Driver ${s.driver.name} (ID: ${s.driver._id}) has shipment ${s.shipmentId} (${s.weight}kg) on this route`);
        matchingDriverIds.add(s.driver._id);
      }
    });
    
    // Method 3: Check all drivers for any that might be assigned to this route in their profile
    console.log('\nMethod 3: Checking driver profiles for route assignments...');
    driverList.forEach(driver => {
      // Check if driver has a preferred route
      if (driver.preferredRoute) {
        if (doRoutesMatch(driver.preferredRoute.origin, driver.preferredRoute.destination, shipment.from, shipment.to)) {
          matchingDriverIds.add(driver._id);
          console.log(`  Driver ${driver.name} has preferred route match`);
        }
      }
      
      // Check if driver's vehicle has a route preference
      if (driver.vehicle?.preferredRoute) {
        if (doRoutesMatch(driver.vehicle.preferredRoute.origin, driver.vehicle.preferredRoute.destination, shipment.from, shipment.to)) {
          matchingDriverIds.add(driver._id);
          console.log(`  Driver ${driver.name}'s vehicle has route preference match`);
        }
      }
    });
    
    console.log(`\nTotal matching driver IDs: ${matchingDriverIds.size}`);
    console.log('Matching IDs:', Array.from(matchingDriverIds));
    
    // Check each matching driver for capacity
    const compatibleDriversList = [];
    
    for (const driverId of matchingDriverIds) {
      const driver = driverList.find(d => d._id === driverId);
      if (driver) {
        console.log(`\n--- Checking ${driver.name} (${driverId}) ---`);
        console.log(`  Capacity: ${driver.capacity}kg`);
        console.log(`  Current Load: ${driver.currentLoad}kg`);
        console.log(`  Available Space: ${driver.availableSpace}kg`);
        
        const routeLoadInfo = calculateDriverRouteLoad(driver, shipment.from, shipment.to, shipments);
        console.log(`  Current on this route: ${routeLoadInfo.totalRouteWeight}kg`);
        
        const remainingCapacity = driver.availableSpace;
        const canAccept = remainingCapacity >= shipment.weight;
        
        console.log(`  Need: ${shipment.weight}kg`);
        console.log(`  Can accept: ${canAccept ? 'YES ✅' : 'NO ❌'}`);
        
        if (!canAccept) {
          console.log(`  Reason: Need ${shipment.weight}kg but only ${remainingCapacity}kg available`);
          if (driver.assignedShipments && driver.assignedShipments.length > 0) {
            console.log(`  Current assignments:`, driver.assignedShipments);
          }
        }
        
        if (canAccept) {
          compatibleDriversList.push({
            ...driver,
            currentRouteLoad: routeLoadInfo.totalRouteWeight,
            routeShipmentsCount: routeLoadInfo.routeShipmentsCount,
            routeShipments: routeLoadInfo.routeShipmentsList,
            remainingCapacity,
            willBeFullAfter: (driver.currentLoad + shipment.weight) >= driver.capacity,
            willBeOverAfter: (driver.currentLoad + shipment.weight) > driver.capacity
          });
        }
      }
    }
    
    console.log(`\n=== RESULT: ${compatibleDriversList.length} compatible drivers found ===`);
    
    // Calculate metrics for display
    const driversWithDetails = compatibleDriversList.map(driver => {
      const currentTotalLoad = driver.currentLoad || 0;
      const capacity = driver.capacity || 0;
      const willBeFull = (currentTotalLoad + shipment.weight) >= capacity;
      const willBeOver = (currentTotalLoad + shipment.weight) > capacity;
      const loadAfterAssignment = currentTotalLoad + shipment.weight;
      const routeLoadAfterAssignment = driver.currentRouteLoad + shipment.weight;
      const remainingAfterAssignment = capacity - loadAfterAssignment;
      const totalLoadPercentage = capacity > 0 ? (currentTotalLoad / capacity) * 100 : 0;
      const routeLoadPercentage = capacity > 0 ? (driver.currentRouteLoad / capacity) * 100 : 0;
      
      return {
        ...driver,
        willBeFull,
        willBeOver,
        loadAfterAssignment,
        routeLoadAfterAssignment,
        remainingAfterAssignment,
        totalLoadPercentage,
        routeLoadPercentage
      };
    });
    
    const sortedList = driversWithDetails.sort((a, b) => b.remainingCapacity - a.remainingCapacity);
    setCompatibleDrivers(sortedList);
    
    // Generate message
    if (sortedList.length > 0) {
      const driverDetails = sortedList.map(d => 
        `${d.name}: ${d.remainingCapacity}kg available (has ${d.currentRouteLoad}kg on route)`
      ).join('; ');
      
      setAssignmentMessage(
        `✅ Found ${sortedList.length} driver(s) for route ${shipment.from} → ${shipment.to}. ` +
        `Shipment weight: ${shipment.weight}kg. ${driverDetails}`
      );
    } else if (matchingDriverIds.size > 0) {
      const driversWithNoCapacity = [];
      for (const driverId of matchingDriverIds) {
        const driver = driverList.find(d => d._id === driverId);
        if (driver) {
          driversWithNoCapacity.push(
            `${driver.name}: ${driver.currentLoad}/${driver.capacity}kg (${driver.availableSpace}kg left), needs ${shipment.weight}kg`
          );
        }
      }
      
      setAssignmentMessage(
        `⚠️ Driver(s) on this route but don't have enough remaining capacity. ` +
        `${driversWithNoCapacity.join('; ')}. ` +
        `Please wait for deliveries to complete or assign a different driver.`
      );
    } else if (!matchingRoute) {
      setAssignmentMessage(
        `⚠️ No drivers found for route ${shipment.from} → ${shipment.to}. ` +
        `Please assign a driver to this route in Route Management.`
      );
    } else {
      setAssignmentMessage(
        `No compatible drivers available for this route.`
      );
    }
  }, [shipments, selectedShipment]);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    let intervalId;
    if (isModalOpen) {
      calculateCompatibleDrivers(selectedShipment, drivers, routes);
      intervalId = setInterval(() => {
        refreshDriversRealTime();
      }, 10000);
    }
    
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isModalOpen, selectedShipment, drivers, routes, calculateCompatibleDrivers, refreshDriversRealTime]);

  // Polling for data updates every 5 seconds
  useEffect(() => {
    fetchData();
    
    pollIntervalRef.current = setInterval(() => {
      fetchData();
    }, 5000);
    
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  // CSV export
  const downloadCSV = () => {
    const headers = ["ID,Product,Weight (kg),Origin,Destination,Status,Sender,Driver,Cost,Last Updated"];
    const rows = filteredShipments.map(s =>
      `${s.shipmentId},"${s.productName}",${s.weight},"${s.from}","${s.to}",${s.status},"${s.sender?.name || 'Unknown'}","${s.driver?.name || 'Unassigned'}",${s.cost},${new Date(s.updatedAt || s.createdAt).toLocaleString()}`
    );
    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `IGTS_Shipments_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setIsExportOpen(false);
  };

  // Open Assign Modal
  const handleOpenAssignModal = async (shipment) => {
    setSelectedShipment(shipment);
    setSelectedDriverId('');
    setRouteJustCreated(false);
    
    console.log('\n=== OPENING ASSIGN MODAL ===');
    console.log('Shipment:', shipment.shipmentId);
    console.log('Route:', shipment.from, '→', shipment.to);
    console.log('Weight:', shipment.weight, 'kg');
    
    setRefreshingDrivers(true);
    try {
      const [driversRes, routesRes, shipmentsRes] = await Promise.all([
        axios.get('http://localhost:5000/api/drivers/active'),
        axios.get('http://localhost:5000/api/routes'),
        axios.get('http://localhost:5000/api/shipments/all')
      ]);
      
      const allShipments = shipmentsRes.data;
      
      const driversWithRealTimeLoad = driversRes.data.map(driver => {
        const loadInfo = calculateDriverRealTimeLoad(driver, allShipments);
        return {
          ...driver,
          ...loadInfo
        };
      });
      
      setDrivers(driversWithRealTimeLoad);
      setRoutes(routesRes.data);
      setShipments(allShipments.reverse());
      setLastRouteUpdate(new Date());
      
      calculateCompatibleDrivers(shipment, driversWithRealTimeLoad, routesRes.data);
    } catch (err) {
      console.error('Error in handleOpenAssignModal:', err);
      calculateCompatibleDrivers(shipment, drivers, routes);
    } finally {
      setRefreshingDrivers(false);
    }
    
    setIsModalOpen(true);
  };

  const confirmAssignment = async () => {
    const driver = drivers.find(d => d._id === selectedDriverId);
    if (!driver) return;

    const vehicle = driver.driverDetails?.assignedVehicleId || driver.assignedVehicle || driver.vehicle;
    if (!vehicle) {
      alert("Error: This driver does not have a vehicle assigned.");
      return;
    }

    const currentLoad = driver.currentLoad || 0;
    const capacity = driver.capacity || 0;
    const newLoad = currentLoad + selectedShipment.weight;

    if (newLoad > capacity) {
      if (!window.confirm(`⚠️ WARNING: This will exceed truck capacity!\n\nDriver: ${driver.name}\nCurrent load: ${currentLoad}kg\nShipment weight: ${selectedShipment.weight}kg\nTotal after assignment: ${newLoad}kg\nCapacity: ${capacity}kg\n\nOver capacity by: ${newLoad - capacity}kg\n\nProceed anyway?`)) {
        return;
      }
    }

    try {
      await axios.put('http://localhost:5000/api/shipments/assign', {
        shipmentId: selectedShipment._id,
        driverId: selectedDriverId
      });
      
      onShowToast(`✅ Assigned ${driver.name} to shipment ${selectedShipment.shipmentId}`, 'success');
      setIsModalOpen(false);
      
      await fetchData();
    } catch (err) {
      onShowToast(err.response?.data?.error || "Failed to assign driver", 'error');
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      'Pending': 'bg-yellow-100 text-yellow-800',
      'Payment Pending': 'bg-orange-100 text-orange-800',
      'Assigned': 'bg-blue-100 text-blue-800',
      'Picked': 'bg-indigo-100 text-indigo-800',
      'In-Transit': 'bg-purple-100 text-purple-800',
      'Delivered': 'bg-emerald-100 text-emerald-800',
      'Cancelled': 'bg-red-100 text-red-800'
    };
    return <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase ${styles[status] || 'bg-gray-100'}`}>{status}</span>;
  };

  const filteredShipments = shipments.filter(s => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return true;
    const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
    const monthIndex = months.findIndex(m => m === term);
    if (monthIndex !== -1) {
      const date = new Date(s.createdAt);
      return date.getMonth() === monthIndex;
    }
    return (
      s.shipmentId.toLowerCase().includes(term) ||
      s.productName.toLowerCase().includes(term) ||
      (s.from && s.from.toLowerCase().includes(term)) ||
      (s.to && s.to.toLowerCase().includes(term)) ||
      s.status.toLowerCase().includes(term)
    );
  });

  if (loading) return <div className="p-10 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Shipment Management</h2>
          <div className="flex items-center gap-3 mt-1">
            <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${isConnected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              <span>{isConnected ? 'Live Updates' : 'Offline'}</span>
            </div>
            {lastFetchTime && (
              <p className="text-xs text-gray-400">
                Last updated: {lastFetchTime.toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>
        <div className="relative flex gap-2">
          <button onClick={() => fetchData()} className="flex items-center gap-2 bg-white border border-gray-200 px-4 py-2 rounded-lg font-bold shadow-sm hover:bg-gray-50">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          <button onClick={() => setIsExportOpen(!isExportOpen)} className="flex items-center gap-2 bg-white border border-gray-200 px-4 py-2 rounded-lg font-bold shadow-sm hover:bg-gray-50">
            <Download className="w-4 h-4" /> Export Data
          </button>
          {isExportOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 z-50 py-1">
              <button onClick={downloadCSV} className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-blue-50 flex items-center gap-2">
                <FileText className="w-4 h-4 text-green-600" /> Export to Excel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-3.5 w-5 h-5 text-gray-400" />
        <input 
          type="text" 
          placeholder="Search by ID, Product, Month or Status..." 
          className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" 
          value={searchTerm} 
          onChange={e => setSearchTerm(e.target.value)} 
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Details</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Route</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Weight</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredShipments.map(shipment => (
                <tr key={shipment._id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <span className="font-bold text-gray-800 block">{shipment.shipmentId}</span>
                    <span className="text-xs text-blue-600 flex items-center gap-1">
                      <Package className="w-3 h-3"/>{shipment.productName}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 font-medium">
                    {shipment.from} ➜ {shipment.to}
                  </td>
                  <td className="px-6 py-4 text-sm font-bold">{shipment.weight} kg</td>
                  <td className="px-6 py-4">{getStatusBadge(shipment.status)}</td>
                  <td className="px-6 py-4 text-right">
                    {shipment.status === 'Pending' ? (
                      <button 
                        onClick={() => handleOpenAssignModal(shipment)} 
                        className="bg-blue-900 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-blue-800"
                      >
                        Assign Driver
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400 italic">
                        Assigned: {shipment.driver?.name}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={`Assign Shipment ${selectedShipment?.shipmentId}`}>
        <div className="space-y-4">
          <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex justify-between items-center">
            <div>
              <p className="text-[10px] text-blue-500 uppercase font-bold">Required Route</p>
              <p className="font-bold text-blue-900 text-sm flex items-center gap-1">
                <MapPin className="w-3 h-3"/> {selectedShipment?.from} ➜ {selectedShipment?.to}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-blue-500 uppercase font-bold">Weight</p>
              <p className="font-bold text-blue-900 text-lg">{selectedShipment?.weight}kg</p>
            </div>
          </div>

          <div className="bg-gray-50 p-2 rounded border text-xs text-gray-600">
            <AlertCircle className="w-4 h-4 inline mr-1 text-blue-500"/> 
            {assignmentMessage}
            {refreshingDrivers && <Loader2 className="w-3 h-3 inline ml-2 animate-spin" />}
          </div>

          <div className="flex justify-between items-center text-xs text-gray-400">
            <span>Auto-detecting capacity (checks every 10 seconds)</span>
            <button onClick={refreshDriversRealTime} disabled={refreshingDrivers} className="flex items-center gap-1 text-blue-600">
              <RefreshCw className={`w-3 h-3 ${refreshingDrivers ? 'animate-spin' : ''}`} />
              Refresh Now
            </button>
          </div>

          <div className="max-h-[400px] overflow-y-auto space-y-2">
            {compatibleDrivers.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Truck className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p>No drivers available with remaining capacity</p>
                <p className="text-xs mt-1">
                  {drivers.length > 0 ? 'Drivers exist but may be at full capacity' : 'No drivers found in system'}
                </p>
                {drivers.length > 0 && (
                  <div className="mt-4 text-left text-xs">
                    <p className="font-bold mb-2">Available drivers in system:</p>
                    {drivers.map(d => (
                      <div key={d._id} className="mb-2 p-2 bg-gray-100 rounded">
                        <p><strong>{d.name}</strong></p>
                        <p>Load: {d.currentLoad}/{d.capacity}kg ({d.availableSpace}kg left)</p>
                        <p>Vehicle: {d.vehicleDetails?.number || 'No vehicle'} - {d.vehicleDetails?.type || ''}</p>
                        {d.assignedShipments && d.assignedShipments.length > 0 && (
                          <p className="text-gray-500">Active: {d.assignedShipments.length} shipments</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              compatibleDrivers.map(driver => {
                const willBeFull = (driver.currentLoad + selectedShipment?.weight) >= driver.capacity;
                const totalLoadPercentage = driver.totalLoadPercentage;

                return (
                  <div
                    key={driver._id}
                    onClick={() => setSelectedDriverId(driver._id)}
                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all
                      ${selectedDriverId === driver._id ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-blue-300'}
                      ${driver.willBeOver ? 'border-red-300 bg-red-50' : ''}`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-gray-900">{driver.name}</h4>
                          <span className="bg-green-100 text-green-700 text-[10px] px-2 py-0.5 rounded-full">
                            ✓ Route Match
                          </span>
                          {driver.routeShipmentsCount > 0 && (
                            <span className="bg-purple-100 text-purple-700 text-[10px] px-2 py-0.5 rounded-full">
                              {driver.routeShipmentsCount} on this route ({driver.currentRouteLoad}kg)
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-500 mt-1">
                          <Truck className="w-3 h-3 inline"/> {driver.vehicleDetails?.number || 'No vehicle'} • {driver.vehicleDetails?.type || ''}
                        </p>
                      </div>
                      {selectedDriverId === driver._id && <CheckCircle className="w-5 h-5 text-blue-600" />}
                    </div>

                    <div className="space-y-2">
                      {/* Remaining Capacity */}
                      <div className={`p-2 rounded-lg ${driver.remainingCapacity >= selectedShipment?.weight ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                        <div className="flex justify-between text-[11px] font-bold">
                          <span>Available Capacity</span>
                          <span className={driver.remainingCapacity >= selectedShipment?.weight ? 'text-green-700' : 'text-red-700'}>
                            {driver.remainingCapacity} kg
                          </span>
                        </div>
                        {driver.remainingCapacity >= selectedShipment?.weight && (
                          <div className="text-[10px] text-green-600 mt-1">
                            ✓ Can accept {selectedShipment?.weight}kg shipment
                            {driver.remainingAfterAssignment > 0 && ` (${driver.remainingAfterAssignment}kg left after)`}
                          </div>
                        )}
                      </div>

                      {/* Load Progress */}
                      <div>
                        <div className="flex justify-between text-[10px] mb-1">
                          <span className="text-gray-600">Current Load</span>
                          <span>{driver.currentLoad} / {driver.capacity} kg</span>
                        </div>
                        <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all ${totalLoadPercentage > 90 ? 'bg-red-500' : 'bg-blue-500'}`}
                            style={{ width: `${Math.min(100, totalLoadPercentage)}%` }}
                          />
                        </div>
                      </div>

                      {/* After Assignment Preview */}
                      <div className="text-[10px] text-gray-500 pt-1 border-t">
                        After assignment: <strong>{driver.currentLoad + selectedShipment?.weight} / {driver.capacity} kg</strong>
                        {willBeFull && !driver.willBeOver && <span className="ml-1 text-orange-600">(Full)</span>}
                        {driver.willBeOver && <span className="ml-1 text-red-600">(Over capacity!)</span>}
                      </div>

                      {/* Active Shipments List */}
                      {driver.assignedShipments.length > 0 && (
                        <div className="mt-2 pt-2 border-t">
                          <p className="text-[9px] text-gray-400 font-bold">Active Shipments:</p>
                          {driver.assignedShipments.map((ship, idx) => (
                            <p key={idx} className="text-[9px] text-gray-500">
                              • {ship.id} ({ship.weight}kg) - {ship.route}
                              {ship.route.includes(`${selectedShipment?.from} → ${selectedShipment?.to}`) && (
                                <span className="ml-1 text-purple-500">(Same Route)</span>
                              )}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <button
            disabled={!selectedDriverId || compatibleDrivers.length === 0}
            onClick={confirmAssignment}
            className="w-full bg-blue-900 disabled:bg-gray-300 disabled:cursor-not-allowed text-white py-3 rounded-xl font-bold mt-2 hover:bg-blue-800 transition-colors"
          >
            Confirm Assignment
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default AdminShipments;