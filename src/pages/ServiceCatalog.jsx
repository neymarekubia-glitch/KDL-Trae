import React, { useState, useEffect } from "react";
import { ServiceItem, Supplier } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, AlertTriangle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import ServiceItemForm from "../components/catalog/ServiceItemForm";
import ServiceItemCard from "../components/catalog/ServiceItemCard";

export default function ServiceCatalog() {
  const [items, setItems] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [itemsData, suppliersData] = await Promise.all([
        ServiceItem.list("-created_date"),
        Supplier.list("-created_date")
      ]);
      setItems(itemsData);
      setSuppliers(suppliersData);
    } catch (e) {
      console.error("Failed to load service catalog:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (itemData) => {
    if (editingItem) {
      await ServiceItem.update(editingItem.id, itemData);
    } else {
      await ServiceItem.create(itemData);
    }
    setShowForm(false);
    setEditingItem(null);
    loadData();
  };

  const handleEdit = (item) => {
    setEditingItem(item);
    setShowForm(true);
  };

  const handleDelete = async (itemId) => {
    if (confirm("Tem certeza que deseja excluir este item?")) {
      await ServiceItem.delete(itemId);
      loadData();
    }
  };

  const handleToggleActive = async (item) => {
    await ServiceItem.update(item.id, { is_active: !item.is_active });
    loadData();
  };

  const filteredItems = items.filter(item => {
    const matchesSearch = item.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTab = activeTab === "all" || item.type === activeTab;
    return matchesSearch && matchesTab && item.is_active !== false;
  });

  // Check for low stock items
  const lowStockItems = items.filter(item => 
    (item.type === "peca" || item.type === "produto") &&
    item.minimum_stock > 0 &&
    item.current_stock <= item.minimum_stock &&
    item.is_active !== false
  );

  return (
    <div className="p-4 md:p-8 bg-gradient-to-br from-gray-50 to-gray-100 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Catálogo de Serviços</h1>
            <p className="text-gray-500 mt-1">Gerencie serviços, peças e produtos</p>
          </div>
          <Button
            onClick={() => {
              setEditingItem(null);
              setShowForm(true);
            }}
            className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg w-full md:w-auto"
          >
            <Plus className="w-5 h-5 mr-2" />
            Novo Item
          </Button>
        </div>

        {lowStockItems.length > 0 && (
          <Card className="bg-red-50 border-red-200 border-2">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-6 h-6 text-red-600 mt-0.5 animate-pulse" />
                <div className="flex-1">
                  <h3 className="font-bold text-red-900 mb-2">⚠️ Alerta de Estoque Baixo!</h3>
                  <div className="space-y-2">
                    {lowStockItems.map(item => {
                      const supplier = suppliers.find(s => s.id === item.supplier_id);
                      return (
                        <div key={item.id} className="flex items-center justify-between bg-white p-3 rounded-lg">
                          <div>
                            <p className="font-semibold text-gray-900">{item.name}</p>
                            <p className="text-sm text-gray-600">
                              Estoque: <Badge variant="destructive">{item.current_stock}</Badge> / 
                              Mínimo: {item.minimum_stock}
                            </p>
                            {supplier && (
                              <p className="text-xs text-gray-500 mt-1">
                                Fornecedor: {supplier.name} - {supplier.phone}
                              </p>
                            )}
                          </div>
                          <Button
                            size="sm"
                            className="bg-red-600 hover:bg-red-700"
                            onClick={() => handleEdit(item)}
                          >
                            Comprar
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <Input
              placeholder="Buscar serviço, peça ou produto..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-white shadow-sm border-gray-200"
            />
          </div>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full md:w-auto">
            <TabsList className="grid w-full md:w-auto grid-cols-4 bg-white shadow-sm">
              <TabsTrigger value="all" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                Todos
              </TabsTrigger>
              <TabsTrigger value="servico" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                Serviços
              </TabsTrigger>
              <TabsTrigger value="peca" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                Peças
              </TabsTrigger>
              <TabsTrigger value="produto" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                Produtos
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <AnimatePresence>
          {showForm && (
            <ServiceItemForm
              item={editingItem}
              onSubmit={handleSubmit}
              onCancel={() => {
                setShowForm(false);
                setEditingItem(null);
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
              {filteredItems.map((item) => (
                <ServiceItemCard
                  key={item.id}
                  item={item}
                  supplier={suppliers.find(s => s.id === item.supplier_id)}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onToggleActive={handleToggleActive}
                />
              ))}
            </AnimatePresence>
          </div>
        )}

        {!loading && filteredItems.length === 0 && (
          <div className="text-center py-20">
            <p className="text-gray-500 text-lg">Nenhum item encontrado</p>
          </div>
        )}
      </div>
    </div>
  );
}