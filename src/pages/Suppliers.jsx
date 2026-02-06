import React, { useState, useEffect } from "react";
import { Supplier } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import SupplierForm from "../components/suppliers/SupplierForm";
import SupplierCard from "../components/suppliers/SupplierCard";

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await Supplier.list("-created_date");
      setSuppliers(data);
    } catch (e) {
      console.error("Failed to load suppliers:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (supplierData) => {
    if (editingSupplier) {
      await Supplier.update(editingSupplier.id, supplierData);
    } else {
      await Supplier.create(supplierData);
    }
    setShowForm(false);
    setEditingSupplier(null);
    loadData();
  };

  const handleEdit = (supplier) => {
    setEditingSupplier(supplier);
    setShowForm(true);
  };

  const handleDelete = async (supplierId) => {
    if (confirm("Tem certeza que deseja excluir este fornecedor?")) {
      await Supplier.delete(supplierId);
      loadData();
    }
  };

  const filteredSuppliers = suppliers.filter(supplier =>
    supplier.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    supplier.phone?.includes(searchTerm) ||
    supplier.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-4 md:p-8 bg-gradient-to-br from-gray-50 to-gray-100 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Fornecedores</h1>
            <p className="text-gray-500 mt-1">Gerencie seus fornecedores</p>
          </div>
          <Button
            onClick={() => {
              setEditingSupplier(null);
              setShowForm(true);
            }}
            className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg w-full md:w-auto"
          >
            <Plus className="w-5 h-5 mr-2" />
            Novo Fornecedor
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
            <SupplierForm
              supplier={editingSupplier}
              onSubmit={handleSubmit}
              onCancel={() => {
                setShowForm(false);
                setEditingSupplier(null);
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
              {filteredSuppliers.map((supplier) => (
                <SupplierCard
                  key={supplier.id}
                  supplier={supplier}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))}
            </AnimatePresence>
          </div>
        )}

        {!loading && filteredSuppliers.length === 0 && (
          <div className="text-center py-20">
            <p className="text-gray-500 text-lg">Nenhum fornecedor encontrado</p>
          </div>
        )}
      </div>
    </div>
  );
}