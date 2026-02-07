import React, { useState, useEffect } from "react";
import { Vehicle, Customer } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import VehicleForm from "../components/vehicles/VehicleForm";
import VehicleCard from "../components/vehicles/VehicleCard";

export default function Vehicles() {
  const [vehicles, setVehicles] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [vehiclesData, customersData] = await Promise.all([
        Vehicle.list("-created_date"),
        Customer.list("-created_date")
      ]);
      setVehicles(vehiclesData);
      setCustomers(customersData);
    } catch (e) {
      console.error("Failed to load vehicles:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (vehicleData) => {
    if (editingVehicle) {
      await Vehicle.update(editingVehicle.id, vehicleData);
    } else {
      await Vehicle.create(vehicleData);
    }
    setShowForm(false);
    setEditingVehicle(null);
    loadData();
  };

  const handleEdit = (vehicle) => {
    setEditingVehicle(vehicle);
    setShowForm(true);
  };

  const handleDelete = async (vehicleId) => {
    if (confirm("Tem certeza que deseja excluir este veículo?")) {
      await Vehicle.delete(vehicleId);
      loadData();
    }
  };

  const getCustomerName = (customerId) => {
    const customer = customers.find(c => c.id === customerId);
    return customer?.name || "Cliente não encontrado";
  };

  const filteredVehicles = vehicles.filter(vehicle =>
    vehicle.license_plate?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    vehicle.brand?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    vehicle.model?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    getCustomerName(vehicle.customer_id)?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-4 md:p-8 bg-gradient-to-br from-gray-50 to-gray-100 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Veículos</h1>
            <p className="text-gray-500 mt-1">Gerencie os veículos dos clientes</p>
          </div>
          <Button
            onClick={() => {
              setEditingVehicle(null);
              setShowForm(true);
            }}
            className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg w-full md:w-auto"
          >
            <Plus className="w-5 h-5 mr-2" />
            Novo Veículo
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <Input
            placeholder="Buscar por placa, marca, modelo ou cliente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-white shadow-sm border-gray-200"
          />
        </div>

        <AnimatePresence>
          {showForm && (
            <VehicleForm
              vehicle={editingVehicle}
              customers={customers}
              onSubmit={handleSubmit}
              onCancel={() => {
                setShowForm(false);
                setEditingVehicle(null);
              }}
            />
          )}
        </AnimatePresence>

        {loading ? (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence>
              {filteredVehicles.map((vehicle) => (
                <VehicleCard
                  key={vehicle.id}
                  vehicle={vehicle}
                  customerName={getCustomerName(vehicle.customer_id)}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))}
            </AnimatePresence>
          </div>
        )}

        {!loading && filteredVehicles.length === 0 && (
          <div className="text-center py-20">
            <p className="text-gray-500 text-lg">Nenhum veículo encontrado</p>
          </div>
        )}
      </div>
    </div>
  );
}