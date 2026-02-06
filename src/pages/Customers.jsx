import React, { useState, useEffect } from "react";
import { Customer, Vehicle } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import CustomerForm from "../components/customers/CustomerForm";
import CustomerCard from "../components/customers/CustomerCard";

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [customersData, vehiclesData] = await Promise.all([
        Customer.list("-created_date"),
        Vehicle.list("-created_date")
      ]);
      setCustomers(customersData);
      setVehicles(vehiclesData);
    } catch (e) {
      console.error("Failed to load customers:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (customerData) => {
    if (editingCustomer) {
      await Customer.update(editingCustomer.id, customerData);
    } else {
      await Customer.create(customerData);
    }
    setShowForm(false);
    setEditingCustomer(null);
    loadData();
  };

  const handleEdit = (customer) => {
    setEditingCustomer(customer);
    setShowForm(true);
  };

  const handleDelete = async (customerId) => {
    if (confirm("Tem certeza que deseja excluir este cliente?")) {
      await Customer.delete(customerId);
      loadData();
    }
  };

  const getCustomerVehicles = (customerId) => {
    return vehicles.filter(v => v.customer_id === customerId);
  };

  const filteredCustomers = customers.filter(customer =>
    customer.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.phone?.includes(searchTerm) ||
    customer.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-4 md:p-8 bg-gradient-to-br from-gray-50 to-gray-100 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Clientes</h1>
            <p className="text-gray-500 mt-1">Gerencie seus clientes e veículos</p>
          </div>
          <Button
            onClick={() => {
              setEditingCustomer(null);
              setShowForm(true);
            }}
            className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg w-full md:w-auto"
          >
            <Plus className="w-5 h-5 mr-2" />
            Novo Cliente
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <Input
            placeholder="Buscar por nome, telefone ou email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-white shadow-sm border-gray-200"
          />
        </div>

        <AnimatePresence>
          {showForm && (
            <CustomerForm
              customer={editingCustomer}
              onSubmit={handleSubmit}
              onCancel={() => {
                setShowForm(false);
                setEditingCustomer(null);
              }}
            />
          )}
        </AnimatePresence>

        {loading ? (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            <AnimatePresence>
              {filteredCustomers.map((customer) => (
                <CustomerCard
                  key={customer.id}
                  customer={customer}
                  vehicles={getCustomerVehicles(customer.id)}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onRefresh={loadData}
                />
              ))}
            </AnimatePresence>
          </div>
        )}

        {!loading && filteredCustomers.length === 0 && (
          <div className="text-center py-20">
            <p className="text-gray-500 text-lg">Nenhum cliente encontrado</p>
          </div>
        )}
      </div>
    </div>
  );
}