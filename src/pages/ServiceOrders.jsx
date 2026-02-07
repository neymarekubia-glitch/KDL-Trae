import React, { useState, useEffect } from "react";
import { ServiceOrder, Quote, Customer, Vehicle, QuoteItem, MaintenanceReminder, ServiceItem, StockMovement } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, Play, StopCircle, Clock, DollarSign } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion, AnimatePresence } from "framer-motion";
import { addDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import ServiceOrderCard from "../components/orders/ServiceOrderCard";

export default function ServiceOrders() {
  const [orders, setOrders] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("aguardando");
  const [loading, setLoading] = useState(true);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [currentOrder, setCurrentOrder] = useState(null);
  const [paymentData, setPaymentData] = useState({
    payment_status: "pago",
    amount_paid: 0,
    discount_type: "none",
    discount_value: 0
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [ordersData, quotesData, customersData, vehiclesData] = await Promise.all([
        ServiceOrder.list("-created_date"),
        Quote.list("-created_date"),
        Customer.list("-created_date"),
        Vehicle.list("-created_date")
      ]);
      setOrders(ordersData);
      setQuotes(quotesData);
      setCustomers(customersData);
      setVehicles(vehiclesData);
    } catch (e) {
      console.error("Failed to load service orders:", e);
    } finally {
      setLoading(false);
    }
  };

  const getQuote = (quoteId) => quotes.find(q => q.id === quoteId);
  const getCustomerName = (customerId) => customers.find(c => c.id === customerId)?.name || "";
  const getVehicleInfo = (vehicleId) => {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    return vehicle ? `${vehicle.brand} ${vehicle.model} - ${vehicle.license_plate}` : "";
  };

  const handleStart = async (order) => {
    if (confirm("Iniciar esta ordem de serviço?")) {
      await ServiceOrder.update(order.id, {
        status: "em_andamento",
        start_date: new Date().toISOString()
      });
      
      loadData();
    }
  };

  const handleFinish = async (order) => {
    const quote = getQuote(order.quote_id);
    setCurrentOrder({ ...order, quote });
    setPaymentData({
      payment_status: "pago",
      amount_paid: quote?.total || 0,
      discount_type: "none",
      discount_value: 0
    });
    setShowPaymentDialog(true);
  };

  const calculateFinalTotal = () => {
    if (!currentOrder?.quote) return 0;
    
    // Valor original da cotação (antes de qualquer desconto)
    const originalTotal = currentOrder.quote.subtotal || currentOrder.quote.total || 0;
    // Desconto já aplicado na fase de cotação
    const quoteDiscount = currentOrder.quote.discount_amount || 0;
    // Base para aplicar descontos adicionais na OS (já considerando o desconto da cotação)
    const baseAfterQuoteDiscount = Math.max(0, originalTotal - quoteDiscount);

    // Se não houver desconto extra na OS, o valor final é o valor já descontado da cotação
    if (paymentData.discount_type === "none") {
      return baseAfterQuoteDiscount;
    }

    let discount = 0;
    
    if (paymentData.discount_type === "percentage") {
      discount = baseAfterQuoteDiscount * (paymentData.discount_value / 100);
    } else if (paymentData.discount_type === "fixed") {
      discount = paymentData.discount_value;
    }
    
    return Math.max(0, baseAfterQuoteDiscount - discount);
  };

  const confirmFinish = async () => {
    if (!currentOrder) return;

    const startDate = new Date(currentOrder.start_date);
    const endDate = new Date();
    const durationHours = (endDate - startDate) / (1000 * 60 * 60);

    await ServiceOrder.update(currentOrder.id, {
      status: "finalizada",
      end_date: endDate.toISOString(),
      duration_hours: durationHours
    });

    // Calcular valores finais com desconto (cotação + eventual desconto extra da OS)
    const finalTotal = calculateFinalTotal();
    const amountPaid = paymentData.payment_status === "pendente" ? 0 : paymentData.amount_paid;
    const amountPending = finalTotal - amountPaid;

    // Atualizar a cotação com status e valores finais
    // Mantemos os campos de desconto da cotação (discount_amount/discount_percent) como foram definidos na criação/edição,
    // e apenas ajustamos total, pago e pendente.
    await Quote.update(currentOrder.quote_id, {
      status: "concluida",
      completion_date: endDate.toISOString(),
      service_duration_hours: durationHours,
      payment_status: paymentData.payment_status,
      amount_paid: amountPaid,
      amount_pending: amountPending,
      total: finalTotal
    });

    // Process stock movements
    const quoteItems = await QuoteItem.filter({ quote_id: currentOrder.quote_id });
    const serviceItems = await ServiceItem.list();

    for (const quoteItem of quoteItems) {
      const serviceItem = serviceItems.find(s => s.id === quoteItem.service_item_id);
      
      if (serviceItem) {
        if (serviceItem.type === "peca" || serviceItem.type === "produto") {
          await StockMovement.create({
            service_item_id: serviceItem.id,
            type: "saida",
            quantity: quoteItem.quantity,
            service_order_id: currentOrder.id,
            movement_date: endDate.toISOString().split('T')[0],
            notes: `Saída para OS ${currentOrder.order_number}`
          });

          await ServiceItem.update(serviceItem.id, {
            current_stock: (serviceItem.current_stock || 0) - quoteItem.quantity
          });
        }

        if (serviceItem.type === "servico" && serviceItem.combo_items) {
          for (const comboItem of serviceItem.combo_items) {
            const stockItem = serviceItems.find(s => s.id === comboItem.item_id);
            if (stockItem) {
              await StockMovement.create({
                service_item_id: comboItem.item_id,
                type: "saida",
                quantity: comboItem.quantity * quoteItem.quantity,
                service_order_id: currentOrder.id,
                movement_date: endDate.toISOString().split('T')[0],
                notes: `Saída para combo: ${serviceItem.name} - OS ${currentOrder.order_number}`
              });

              await ServiceItem.update(comboItem.item_id, {
                current_stock: (stockItem.current_stock || 0) - (comboItem.quantity * quoteItem.quantity)
              });
            }
          }
        }
      }
    }

    setShowPaymentDialog(false);
    setCurrentOrder(null);
    loadData();
  };

  const filteredOrders = orders.filter(order => {
    const quote = getQuote(order.quote_id);
    const matchesSearch = 
      order.order_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      getCustomerName(order.customer_id)?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      getVehicleInfo(order.vehicle_id)?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || order.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="p-4 md:p-8 bg-gradient-to-br from-gray-50 to-gray-100 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Ordens de Serviço</h1>
            <p className="text-gray-500 mt-1">Gerencie as ordens em andamento</p>
          </div>
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
            <TabsList className="grid w-full md:w-auto grid-cols-4 bg-white shadow-sm">
              <TabsTrigger value="all" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                Todas
              </TabsTrigger>
              <TabsTrigger value="aguardando" className="data-[state=active]:bg-yellow-600 data-[state=active]:text-white">
                Aguardando
              </TabsTrigger>
              <TabsTrigger value="em_andamento" className="data-[state=active]:bg-green-600 data-[state=active]:text-white">
                Em Andamento
              </TabsTrigger>
              <TabsTrigger value="finalizada" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                Finalizadas
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
            <AnimatePresence>
              {filteredOrders.map((order) => (
                <ServiceOrderCard
                  key={order.id}
                  order={order}
                  quote={getQuote(order.quote_id)}
                  customer={customers.find(c => c.id === order.customer_id)}
                  vehicle={vehicles.find(v => v.id === order.vehicle_id)}
                  customerName={getCustomerName(order.customer_id)}
                  vehicleInfo={getVehicleInfo(order.vehicle_id)}
                  onStart={handleStart}
                  onFinish={handleFinish}
                />
              ))}
            </AnimatePresence>
          </div>
        )}

        {!loading && filteredOrders.length === 0 && (
          <div className="text-center py-20">
            <p className="text-gray-500 text-lg">Nenhuma ordem de serviço encontrada</p>
          </div>
        )}
      </div>

      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Finalizar Ordem de Serviço</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Aplicar Desconto?</Label>
              <Select
                value={paymentData.discount_type}
                onValueChange={(value) => setPaymentData({...paymentData, discount_type: value, discount_value: 0})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem Desconto</SelectItem>
                  <SelectItem value="percentage">Desconto em Porcentagem (%)</SelectItem>
                  <SelectItem value="fixed">Desconto em Valor Fixo (R$)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {paymentData.discount_type !== "none" && (
              <div className="space-y-2">
                <Label>
                  {paymentData.discount_type === "percentage" ? "Desconto (%)" : "Desconto (R$)"}
                </Label>
                <Input
                  type="number"
                  step={paymentData.discount_type === "percentage" ? "0.01" : "0.01"}
                  min="0"
                  max={paymentData.discount_type === "percentage" ? "100" : undefined}
                  value={paymentData.discount_value}
                  onChange={(e) => setPaymentData({...paymentData, discount_value: parseFloat(e.target.value) || 0})}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Status do Pagamento</Label>
              <Select
                value={paymentData.payment_status}
                onValueChange={(value) => setPaymentData({...paymentData, payment_status: value})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pago">Pago</SelectItem>
                  <SelectItem value="parcialmente_pago">Parcialmente Pago</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {paymentData.payment_status !== "pendente" && (
              <div className="space-y-2">
                <Label>Valor Pago (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={paymentData.amount_paid}
                  onChange={(e) => setPaymentData({...paymentData, amount_paid: parseFloat(e.target.value)})}
                />
              </div>
            )}

            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="flex items-center gap-2 text-blue-900 mb-2">
                <DollarSign className="w-5 h-5" />
                <span className="font-semibold">Resumo do Pagamento</span>
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Valor Original:</span>
                  <span className="font-bold">
                    R$ {(
                      (currentOrder?.quote?.subtotal || currentOrder?.quote?.total || 0)
                    ).toFixed(2)}
                  </span>
                </div>
                {Boolean(currentOrder?.quote?.discount_amount) && (
                  <div className="flex justify-between text-slate-700">
                    <span>Desconto da Cotação:</span>
                    <span className="font-semibold">
                      - R$ {(currentOrder.quote.discount_amount || 0).toFixed(2)}
                    </span>
                  </div>
                )}
                {paymentData.discount_type !== "none" && (
                  <div className="flex justify-between text-red-700">
                    <span>Desconto adicional na OS:</span>
                    <span className="font-semibold">
                      - R$ {paymentData.discount_type === "percentage" 
                        ? (
                            Math.max(
                              0,
                              ((currentOrder?.quote?.subtotal || currentOrder?.quote?.total || 0) - (currentOrder?.quote?.discount_amount || 0))
                            ) * (paymentData.discount_value / 100)
                          ).toFixed(2)
                        : paymentData.discount_value.toFixed(2)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-1">
                  <span className="font-bold">Valor Final:</span>
                  <span className="font-bold text-green-700">R$ {calculateFinalTotal().toFixed(2)}</span>
                </div>
                {paymentData.payment_status !== "pendente" && (
                  <>
                    <div className="flex justify-between">
                      <span>Valor Pago:</span>
                      <span className="text-green-700 font-semibold">R$ {paymentData.amount_paid.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-1">
                      <span>Valor Pendente:</span>
                      <span className="text-orange-700 font-semibold">
                        R$ {Math.max(0, calculateFinalTotal() - paymentData.amount_paid).toFixed(2)}
                      </span>
                    </div>
                  </>
                )}
                {paymentData.payment_status === "pendente" && (
                  <div className="flex justify-between border-t pt-1">
                    <span>Valor Pendente:</span>
                    <span className="text-orange-700 font-semibold">
                      R$ {calculateFinalTotal().toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmFinish} className="bg-green-600 hover:bg-green-700">
              Finalizar OS
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}