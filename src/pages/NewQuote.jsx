
import React, { useState, useEffect } from "react";
import { Quote, QuoteItem, Customer, Vehicle, ServiceItem, VehicleMileageHistory } from "@/api/entities"; // Added VehicleMileageHistory
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Plus, Save, Trash2, Calendar as CalendarIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { addDays, format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export default function NewQuote() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [serviceItems, setServiceItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false); // Added submitting state
  const [allQuotes, setAllQuotes] = useState([]);
  
  const [quoteData, setQuoteData] = useState({
    customer_id: "",
    vehicle_id: "",
    quote_number: "",
    status: "em_analise",
    discount_percent: 0,
    discount_amount: 0,
    service_date: new Date().toISOString().split('T')[0],
    vehicle_mileage: 0,
    notes: ""
  });

  const [items, setItems] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [customersData, vehiclesData, serviceItemsData, quotesData] = await Promise.all([
        Customer.list("-created_date"),
        Vehicle.list("-created_date"),
        ServiceItem.filter({ is_active: true }, "-created_date"),
        Quote.list("-created_date")
      ]);
      setCustomers(customersData);
      setVehicles(vehiclesData);
      setServiceItems(serviceItemsData);
      setAllQuotes(quotesData);
      
      // Generate next quote number
      const nextNumber = quotesData.length + 1;
      const quoteNumber = `COT-${String(nextNumber).padStart(6, '0')}`;
      setQuoteData(prev => ({ ...prev, quote_number: quoteNumber }));
    } catch (e) {
      console.error("Failed to load new quote data:", e);
    } finally {
      setLoading(false);
    }
  };

  const customerVehicles = vehicles.filter(v => v.customer_id === quoteData.customer_id);

  const addItem = () => {
    setItems([...items, {
      service_item_id: "",
      service_item_name: "",
      service_item_type: "",
      quantity: 1,
      unit_price: 0,
      cost_price: 0,
      warranty_days: 0,
      replacement_period_days: 0,
      replacement_mileage: 0
    }]);
  };

  const removeItem = (index) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index, field, value) => {
    const newItems = [...items];
    newItems[index][field] = value;

    if (field === "service_item_id") {
      const serviceItem = serviceItems.find(s => s.id === value);
      if (serviceItem) {
        newItems[index] = {
          ...newItems[index],
          service_item_name: serviceItem.name,
          service_item_type: serviceItem.type,
          unit_price: serviceItem.sale_price,
          cost_price: serviceItem.cost_price,
          warranty_days: serviceItem.default_warranty_days || 0,
          replacement_period_days: serviceItem.replacement_period_days || 0,
          replacement_mileage: serviceItem.replacement_mileage || 0
        };
      }
    }

    setItems(newItems);
  };

  const calculateSubtotal = () => {
    return items.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
  };

  const calculateTotal = () => {
    const subtotal = calculateSubtotal();
    const discountValue = quoteData.discount_percent > 0 
      ? (subtotal * quoteData.discount_percent / 100)
      : quoteData.discount_amount;
    return subtotal - discountValue;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (submitting) return; // Evitar duplo submit
    
    if (items.length === 0) {
      alert("Adicione pelo menos um item à cotação");
      return;
    }
    
    if (!quoteData.customer_id || !quoteData.vehicle_id) {
        alert("Por favor, selecione um cliente e um veículo.");
        return;
    }

    setSubmitting(true);

    try {
      const subtotal = calculateSubtotal();
      const total = calculateTotal();
      const discountValue = quoteData.discount_percent > 0 
        ? (subtotal * quoteData.discount_percent / 100)
        : quoteData.discount_amount;

      const quoteToCreate = {
        ...quoteData,
        subtotal,
        total,
        // Persist the effective discount into the correct column
        discount_amount: discountValue,
        amount_pending: total,
        amount_paid: 0,
        payment_status: "pendente"
      };

      if (quoteData.status === "aprovada") {
        quoteToCreate.approved_date = new Date().toISOString();
      }

      const quote = await Quote.create(quoteToCreate);

      const quoteItemsPromises = items.map(item => {
        const warranty_expiry_date = item.warranty_days > 0 
          ? addDays(new Date(quoteData.service_date), item.warranty_days).toISOString().split('T')[0]
          : null;

        const next_service_date = item.replacement_period_days > 0
          ? addDays(new Date(quoteData.service_date), item.replacement_period_days).toISOString().split('T')[0]
          : null;

        const next_service_mileage = item.replacement_mileage > 0
          ? (quoteData.vehicle_mileage || 0) + item.replacement_mileage
          : null;

        return QuoteItem.create({
          quote_id: quote.id,
          service_item_id: item.service_item_id,
          service_item_name: item.service_item_name,
          service_item_type: item.service_item_type,
          quantity: item.quantity,
          unit_price: item.unit_price,
          cost_price: item.cost_price,
          total: item.unit_price * item.quantity,
          warranty_days: item.warranty_days,
          warranty_expiry_date,
          replacement_period_days: item.replacement_period_days,
          replacement_mileage: item.replacement_mileage,
          next_service_date,
          next_service_mileage
        });
      });

      await Promise.all(quoteItemsPromises);

      if (quoteData.vehicle_mileage > 0 && quoteData.vehicle_id) {
        await Vehicle.update(quoteData.vehicle_id, {
          current_mileage: quoteData.vehicle_mileage
        });
        
        await VehicleMileageHistory.create({
          vehicle_id: quoteData.vehicle_id,
          mileage: quoteData.vehicle_mileage,
          record_date: quoteData.service_date,
          quote_id: quote.id,
          notes: `KM registrada na cotação ${quote.quote_number}`
        });
      }

      navigate(createPageUrl("Quotes"));
    } catch (error) {
      console.error("Erro ao criar cotação:", error);
      alert("Erro ao criar cotação: " + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 bg-white min-h-screen"> {/* Changed background to plain white */}
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="outline" size="icon" onClick={() => navigate(createPageUrl("Quotes"))}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Nova Cotação</h1>
            <p className="text-gray-500 mt-1">Criar cotação de serviço</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card className="shadow-lg border-0">
            <CardHeader className="border-b bg-gray-50"> {/* Changed gradient to plain gray background */}
              <CardTitle>Informações da Cotação</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="grid md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label>Número da Cotação</Label>
                  <Input value={quoteData.quote_number} disabled className="font-mono" />
                </div>
                <div className="space-y-2">
                  <Label>Data do Serviço</Label>
                  <Input
                    type="date"
                    value={quoteData.service_date}
                    onChange={(e) => setQuoteData({...quoteData, service_date: e.target.value})}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Status da Cotação *</Label>
                  <Select
                    value={quoteData.status}
                    onValueChange={(value) => setQuoteData({...quoteData, status: value})}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="em_analise">Em Análise</SelectItem>
                      <SelectItem value="aprovada">Aprovada</SelectItem>
                      <SelectItem value="recusada">Recusada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Cliente *</Label>
                  <Select
                    value={quoteData.customer_id}
                    onValueChange={(value) => setQuoteData({...quoteData, customer_id: value, vehicle_id: ""})}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map((customer) => (
                        <SelectItem key={customer.id} value={customer.id}>
                          {customer.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Veículo *</Label>
                  <Select
                    value={quoteData.vehicle_id}
                    onValueChange={(value) => {
                      const vehicle = vehicles.find(v => v.id === value);
                      setQuoteData({
                        ...quoteData, 
                        vehicle_id: value,
                        vehicle_mileage: vehicle?.current_mileage || 0
                      });
                    }}
                    required
                    disabled={!quoteData.customer_id}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o veículo" />
                    </SelectTrigger>
                    <SelectContent>
                      {customerVehicles.map((vehicle) => (
                        <SelectItem key={vehicle.id} value={vehicle.id}>
                          {vehicle.brand} {vehicle.model} - {vehicle.license_plate}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Quilometragem Atual do Veículo</Label>
                <Input
                  type="number"
                  min="0"
                  value={quoteData.vehicle_mileage}
                  onChange={(e) => setQuoteData({...quoteData, vehicle_mileage: parseInt(e.target.value)})}
                  placeholder="Digite a quilometragem"
                  disabled={!quoteData.vehicle_id}
                />
              </div>

              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea
                  value={quoteData.notes}
                  onChange={(e) => setQuoteData({...quoteData, notes: e.target.value})}
                  rows={3}
                  placeholder="Informações adicionais sobre a cotação..."
                />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-lg border-0">
            <CardHeader className="border-b bg-gray-50"> {/* Changed gradient to plain gray background */}
              <div className="flex justify-between items-center">
                <CardTitle>Itens da Cotação</CardTitle>
                <Button type="button" onClick={addItem} size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  Adicionar Item
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              {items.map((item, index) => (
                <Card key={index} className="border-2">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="font-semibold">Item {index + 1}</h3>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeItem(index)}
                        className="hover:bg-red-100 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="md:col-span-2 space-y-2">
                        <Label>Serviço/Peça *</Label>
                        <Select
                          value={item.service_item_id}
                          onValueChange={(value) => updateItem(index, "service_item_id", value)}
                          required
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione um item" />
                          </SelectTrigger>
                          <SelectContent>
                            {serviceItems.map((serviceItem) => (
                              <SelectItem key={serviceItem.id} value={serviceItem.id}>
                                {serviceItem.name} - R$ {serviceItem.sale_price.toFixed(2)} ({serviceItem.type === "servico" ? "Serviço" : "Peça"})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Quantidade</Label>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateItem(index, "quantity", parseInt(e.target.value))}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Preço Unitário (R$)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.unit_price}
                          onChange={(e) => updateItem(index, "unit_price", parseFloat(e.target.value))}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Garantia (dias)</Label>
                        <Input
                          type="number"
                          min="0"
                          value={item.warranty_days}
                          onChange={(e) => updateItem(index, "warranty_days", parseInt(e.target.value))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Total</Label>
                        <Input
                          value={`R$ ${(item.unit_price * item.quantity).toFixed(2)}`}
                          disabled
                          className="font-bold"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {items.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <p>Nenhum item adicionado ainda</p>
                  <p className="text-sm mt-2">Clique em "Adicionar Item" para começar</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-lg border-0">
            <CardHeader className="border-b bg-gray-50"> {/* Changed gradient to plain gray background */}
              <CardTitle>Totais</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="grid md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Desconto (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={quoteData.discount_percent}
                    onChange={(e) => setQuoteData({...quoteData, discount_percent: parseFloat(e.target.value), discount_amount: 0})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Desconto (R$)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={quoteData.discount_amount}
                    onChange={(e) => setQuoteData({...quoteData, discount_amount: parseFloat(e.target.value), discount_percent: 0})}
                  />
                </div>
              </div>

              <div className="border-t pt-4 space-y-2">
                <div className="flex justify-between text-lg">
                  <span className="font-medium">Subtotal:</span>
                  <span className="font-bold">R$ {calculateSubtotal().toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xl">
                  <span className="font-bold">Total:</span>
                  <span className="font-bold text-green-700">R$ {calculateTotal().toFixed(2)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(createPageUrl("Quotes"))}
              disabled={submitting} // Disabled when submitting
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
              disabled={submitting} // Disabled when submitting
            >
              <Save className="w-4 h-4 mr-2" />
              {submitting ? "Salvando..." : "Salvar Cotação"} {/* Change button text */}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
