
import React, { useState } from "react";
import { Vehicle, Customer, Quote, QuoteItem, VehicleMileageHistory } from "@/api/entities"; // Added VehicleMileageHistory
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Car, User, Calendar, Gauge, DollarSign, Wrench, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function VehicleSearch() {
  const [licensePlate, setLicensePlate] = useState("");
  const [vehicle, setVehicle] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [quotes, setQuotes] = useState([]);
  const [mileageHistory, setMileageHistory] = useState([]); // New state for mileage history
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!licensePlate.trim()) return;

    setLoading(true);
    setSearched(true);
    try {
      // Buscar veículo pela placa
      const plateFormatted = licensePlate.trim().toUpperCase();
      const vehiclesData = await Vehicle.filter({ license_plate: plateFormatted });

      if (vehiclesData.length === 0) {
        setVehicle(null);
        setCustomer(null);
        setQuotes([]);
        setMileageHistory([]); // Clear mileage history on no vehicle found
        return;
      }

      const vehicleData = vehiclesData[0];
      setVehicle(vehicleData);

      // Buscar cliente, cotações e histórico de quilometragem em paralelo
      const [customersData, quotesData, historyData] = await Promise.all([
        Customer.filter({ id: vehicleData.customer_id }),
        Quote.filter({ vehicle_id: vehicleData.id }),
        VehicleMileageHistory.filter({ vehicle_id: vehicleData.id }, "-record_date") // Fetch and sort by record_date descending
      ]);

      setCustomer(customersData[0]);
      
      // Ordenar cotações por data de serviço (mais recente primeiro)
      const sortedQuotes = quotesData.sort((a, b) => 
        new Date(b.service_date) - new Date(a.service_date)
      );
      setQuotes(sortedQuotes);
      setMileageHistory(historyData); // Set mileage history
    } catch (e) {
      console.error("Failed to search vehicle:", e);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const colors = {
      em_analise: "bg-yellow-100 text-yellow-800",
      aprovada: "bg-green-100 text-green-800",
      recusada: "bg-red-100 text-red-800",
      concluida: "bg-blue-100 text-blue-800"
    };

    const labels = {
      em_analise: "Em Análise",
      aprovada: "Aprovada",
      recusada: "Recusada",
      concluida: "Concluída"
    };

    return (
      <Badge className={colors[status]}>
        {labels[status]}
      </Badge>
    );
  };

  return (
    <div className="p-4 md:p-8 bg-gradient-to-br from-gray-50 to-gray-100 min-h-screen">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Consulta de Placa</h1>
          <p className="text-gray-500 mt-1">Busque o histórico completo de serviços por placa</p>
        </div>

        <Card className="shadow-lg border-0">
          <CardHeader className="border-b bg-gradient-to-r from-blue-50 to-blue-100/50">
            <CardTitle>Buscar Veículo</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <form onSubmit={handleSearch} className="flex gap-4">
              <Input
                placeholder="Digite a placa (ex: ABC-1234)"
                value={licensePlate}
                onChange={(e) => setLicensePlate(e.target.value.toUpperCase())}
                className="text-lg font-mono uppercase"
              />
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700 min-w-[120px]">
                <Search className="w-5 h-5 mr-2" />
                Buscar
              </Button>
            </form>
          </CardContent>
        </Card>

        {loading && (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
          </div>
        )}

        {!loading && searched && !vehicle && (
          <Card className="bg-orange-50 border-orange-200">
            <CardContent className="p-6 text-center">
              <AlertCircle className="w-12 h-12 text-orange-600 mx-auto mb-3" />
              <p className="text-lg font-semibold text-orange-900">Veículo não encontrado</p>
              <p className="text-orange-700 mt-1">Nenhum veículo cadastrado com a placa "{licensePlate}"</p>
            </CardContent>
          </Card>
        )}

        {!loading && vehicle && (
          <>
            <div className="grid md:grid-cols-3 gap-6">
              <Card className="shadow-lg border-0">
                <CardHeader className="border-b bg-gradient-to-r from-blue-50 to-blue-100/50">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Car className="w-5 h-5 text-blue-600" />
                    Dados do Veículo
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-3">
                  <div>
                    <p className="text-sm text-gray-500">Placa</p>
                    <p className="font-mono font-bold text-xl">{vehicle.license_plate}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Marca/Modelo</p>
                    <p className="font-semibold">{vehicle.brand} {vehicle.model}</p>
                  </div>
                  {vehicle.year && (
                    <div>
                      <p className="text-sm text-gray-500">Ano</p>
                      <p>{vehicle.year}</p>
                    </div>
                  )}
                  {vehicle.color && (
                    <div>
                      <p className="text-sm text-gray-500">Cor</p>
                      <p>{vehicle.color}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-gray-500">KM Atual</p>
                    <p className="font-bold text-lg text-blue-700">
                      {vehicle.current_mileage?.toLocaleString()} km
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-lg border-0">
                <CardHeader className="border-b bg-gradient-to-r from-green-50 to-green-100/50">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <User className="w-5 h-5 text-green-600" />
                    Proprietário
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-3">
                  <div>
                    <p className="text-sm text-gray-500">Nome</p>
                    <p className="font-semibold">{customer?.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Telefone</p>
                    <p>{customer?.phone}</p>
                  </div>
                  {customer?.email && (
                    <div>
                      <p className="text-sm text-gray-500">Email</p>
                      <p className="text-sm">{customer.email}</p>
                    </div>
                  )}
                  {customer?.address && (
                    <div>
                      <p className="text-sm text-gray-500">Endereço</p>
                      <p className="text-sm">{customer.address}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="shadow-lg border-0">
                <CardHeader className="border-b bg-gradient-to-r from-purple-50 to-purple-100/50">
                  <CardTitle className="text-lg">Estatísticas</CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-600">Total de Serviços</p>
                    <p className="text-2xl font-bold text-blue-700">
                      {quotes.filter(q => q.status === "concluida").length}
                    </p>
                  </div>
                  <div className="bg-green-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-600">Valor Total Gasto</p>
                    <p className="text-2xl font-bold text-green-700">
                      R$ {quotes
                        .filter(q => q.status === "concluida")
                        .reduce((sum, q) => sum + (q.total || 0), 0)
                        .toFixed(2)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Novo card de histórico de quilometragem */}
            {mileageHistory.length > 0 && (
              <Card className="shadow-lg border-0">
                <CardHeader className="border-b bg-gradient-to-r from-purple-50 to-purple-100/50">
                  <CardTitle className="flex items-center gap-2">
                    <Gauge className="w-5 h-5 text-purple-600" />
                    Histórico de Quilometragem ({mileageHistory.length} registros)
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {mileageHistory.map((record, index) => (
                      <Card key={record.id} className="border-2 hover:border-purple-300 transition-colors">
                        <CardContent className="p-4">
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4 text-gray-500" />
                              <span className="text-sm font-medium">
                                {format(new Date(record.record_date), "dd/MM/yyyy", { locale: ptBR })}
                              </span>
                            </div>
                          </div>
                          <p className="text-2xl font-bold text-purple-700 mb-1">
                            {record.mileage.toLocaleString()} km
                          </p>
                          {/* Calculate difference only if there's a previous record */}
                          {index < mileageHistory.length - 1 && (
                            <p className="text-xs text-gray-500">
                              +{(record.mileage - mileageHistory[index + 1].mileage).toLocaleString()} km rodados
                            </p>
                          )}
                          {record.notes && (
                            <p className="text-sm text-gray-600 mt-2 pt-2 border-t">
                              {record.notes}
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="shadow-lg border-0">
              <CardHeader className="border-b bg-gradient-to-r from-blue-50 to-blue-100/50">
                <CardTitle className="flex items-center gap-2">
                  <Wrench className="w-5 h-5 text-blue-600" />
                  Histórico de Serviços ({quotes.length} registros)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                {quotes.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <Wrench className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                    <p className="text-lg">Nenhum serviço realizado ainda</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {quotes.map((quote) => (
                      <ServiceHistoryCard key={quote.id} quote={quote} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function ServiceHistoryCard({ quote }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    const loadItems = async () => {
      const itemsData = await QuoteItem.filter({ quote_id: quote.id });
      setItems(itemsData);
      setLoading(false);
    };
    loadItems();
  }, [quote.id]);

  const getStatusBadge = (status) => {
    const colors = {
      em_analise: "bg-yellow-100 text-yellow-800 border-yellow-200",
      aprovada: "bg-green-100 text-green-800 border-green-200",
      recusada: "bg-red-100 text-red-800 border-red-200",
      concluida: "bg-blue-100 text-blue-800 border-blue-200"
    };

    const labels = {
      em_analise: "Em Análise",
      aprovada: "Aprovada",
      recusada: "Recusada",
      concluida: "Concluída"
    };

    return (
      <Badge className={`${colors[status]} border`}>
        {labels[status]}
      </Badge>
    );
  };

  return (
    <Card className="border-2 hover:border-blue-300 transition-colors">
      <CardContent className="p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="font-mono font-bold text-gray-900">{quote.quote_number}</span>
              {getStatusBadge(quote.status)}
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {format(new Date(quote.service_date), "dd/MM/yyyy", { locale: ptBR })}
              </div>
              <div className="flex items-center gap-1">
                <Gauge className="w-4 h-4" />
                {quote.vehicle_mileage ? `${quote.vehicle_mileage.toLocaleString()} km` : "N/A"}
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-green-700">
              R$ {(quote.total || 0).toFixed(2)}
            </p>
            {quote.status === "concluida" && quote.service_duration_hours && (
              <p className="text-sm text-gray-500">
                Duração: {quote.service_duration_hours.toFixed(1)}h
              </p>
            )}
          </div>
        </div>

        {quote.notes && (
          <div className="mb-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-700">{quote.notes}</p>
          </div>
        )}

        {loading ? (
          <div className="text-sm text-gray-500">Carregando itens...</div>
        ) : (
          <div className="border-t pt-4">
            <p className="text-sm font-semibold text-gray-700 mb-2">Serviços Realizados:</p>
            <div className="space-y-2">
              {items.map((item, index) => (
                <div key={index} className="flex justify-between items-center text-sm bg-white p-3 rounded border">
                  <div>
                    <span className="font-medium">{item.service_item_name}</span>
                    <span className="text-gray-500 ml-2">x{item.quantity}</span>
                    {item.warranty_days > 0 && (
                      <Badge variant="outline" className="ml-2 text-xs">
                        Garantia: {item.warranty_days} dias
                      </Badge>
                    )}
                  </div>
                  <span className="font-semibold text-gray-700">
                    R$ {(item.total || 0).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
