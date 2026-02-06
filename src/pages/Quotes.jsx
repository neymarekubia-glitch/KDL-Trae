import React, { useState, useEffect } from "react";
import { Quote, Customer, Vehicle } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Filter } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

import QuoteCard from "../components/quotes/QuoteCard";

export default function Quotes() {
  const [quotes, setQuotes] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [quotesData, customersData, vehiclesData] = await Promise.all([
        Quote.list("-created_date"),
        Customer.list("-created_date"),
        Vehicle.list("-created_date")
      ]);
      setQuotes(quotesData);
      setCustomers(customersData);
      setVehicles(vehiclesData);
    } catch (e) {
      console.error("Failed to load quotes:", e);
    } finally {
      setLoading(false);
    }
  };

  const getCustomerName = (customerId) => {
    const customer = customers.find(c => c.id === customerId);
    return customer?.name || "Cliente não encontrado";
  };

  const getVehicleInfo = (vehicleId) => {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    return vehicle ? `${vehicle.brand} ${vehicle.model} - ${vehicle.license_plate}` : "Veículo não encontrado";
  };

  const filteredQuotes = quotes.filter(quote => {
    const matchesSearch = 
      quote.quote_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      getCustomerName(quote.customer_id)?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      getVehicleInfo(quote.vehicle_id)?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || quote.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="p-4 md:p-8 bg-gradient-to-br from-gray-50 to-gray-100 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Cotações</h1>
            <p className="text-gray-500 mt-1">Gerencie todas as cotações</p>
          </div>
          <Link to={createPageUrl("NewQuote")}>
            <Button className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg w-full md:w-auto">
              <Plus className="w-5 h-5 mr-2" />
              Nova Cotação
            </Button>
          </Link>
        </div>

        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <Input
              placeholder="Buscar por número, cliente ou veículo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-white shadow-sm border-gray-200"
            />
          </div>
          <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full md:w-auto">
            <TabsList className="grid w-full md:w-auto grid-cols-5 bg-white shadow-sm">
              <TabsTrigger value="all" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                Todas
              </TabsTrigger>
              <TabsTrigger value="em_analise" className="data-[state=active]:bg-yellow-600 data-[state=active]:text-white">
                Análise
              </TabsTrigger>
              <TabsTrigger value="aprovada" className="data-[state=active]:bg-green-600 data-[state=active]:text-white">
                Aprovadas
              </TabsTrigger>
              <TabsTrigger value="concluida" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                Concluídas
              </TabsTrigger>
              <TabsTrigger value="recusada" className="data-[state=active]:bg-red-600 data-[state=active]:text-white">
                Recusadas
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredQuotes.map((quote) => (
              <QuoteCard
                key={quote.id}
                quote={quote}
                customerName={getCustomerName(quote.customer_id)}
                vehicleInfo={getVehicleInfo(quote.vehicle_id)}
                onRefresh={loadData}
              />
            ))}
          </div>
        )}

        {!loading && filteredQuotes.length === 0 && (
          <div className="text-center py-20">
            <p className="text-gray-500 text-lg">Nenhuma cotação encontrada</p>
          </div>
        )}
      </div>
    </div>
  );
}