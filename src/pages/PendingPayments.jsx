import React, { useState, useEffect } from "react";
import { Quote, Customer, Vehicle } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, DollarSign, User, Car, Calendar, Plus, ExternalLink } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function PendingPayments() {
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState(0);

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
      // Filtrar apenas cotações concluídas com pagamento pendente
      const pendingQuotes = quotesData.filter(q => 
        q.status === "concluida" && (q.amount_pending || 0) > 0
      );
      setQuotes(pendingQuotes);
      setCustomers(customersData);
      setVehicles(vehiclesData);
    } catch (e) {
      console.error("Failed to load pending payments:", e);
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

  const handleAddPayment = (quote) => {
    setSelectedQuote(quote);
    setPaymentAmount(quote.amount_pending || 0);
    setShowPaymentDialog(true);
  };

  const confirmPayment = async () => {
    if (!selectedQuote || paymentAmount <= 0) return;

    const newAmountPaid = (selectedQuote.amount_paid || 0) + paymentAmount;
    const newAmountPending = selectedQuote.total - newAmountPaid;

    let paymentStatus = "pendente";
    if (newAmountPending <= 0) {
      paymentStatus = "pago";
    } else if (newAmountPaid > 0) {
      paymentStatus = "parcialmente_pago";
    }

    await Quote.update(selectedQuote.id, {
      amount_paid: newAmountPaid,
      amount_pending: Math.max(0, newAmountPending),
      payment_status: paymentStatus
    });

    setShowPaymentDialog(false);
    setSelectedQuote(null);
    setPaymentAmount(0);
    loadData();
  };

  const totalPending = quotes.reduce((sum, q) => sum + (q.amount_pending || 0), 0);

  return (
    <div className="p-4 md:p-8 bg-gradient-to-br from-gray-50 to-gray-100 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => navigate(createPageUrl("Dashboard"))}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Pagamentos Pendentes</h1>
            <p className="text-gray-500 mt-1">Gerencie os recebíveis em aberto</p>
          </div>
        </div>

        <Card className="shadow-lg border-0 bg-gradient-to-r from-orange-50 to-orange-100/50">
          <CardContent className="p-8">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-gray-600 font-medium mb-2">Total a Receber</p>
                <p className="text-4xl font-bold text-orange-700">
                  R$ {totalPending.toFixed(2)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-gray-600 font-medium mb-2">Cotações Pendentes</p>
                <p className="text-4xl font-bold text-orange-700">{quotes.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
          </div>
        ) : quotes.length === 0 ? (
          <Card className="shadow-lg border-0">
            <CardContent className="p-12 text-center">
              <DollarSign className="w-16 h-16 mx-auto mb-4 text-green-600" />
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                Nenhum pagamento pendente! 🎉
              </h3>
              <p className="text-gray-600">
                Todas as cotações estão com pagamento em dia.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6">
            {quotes.map((quote) => (
              <Card key={quote.id} className="shadow-lg border-0 hover:shadow-xl transition-shadow">
                <CardHeader className="border-b bg-gradient-to-r from-orange-50 to-orange-100/50">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="font-mono text-xl">{quote.quote_number}</CardTitle>
                      <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                        <div className="flex items-center gap-1">
                          <User className="w-4 h-4" />
                          {getCustomerName(quote.customer_id)}
                        </div>
                        <div className="flex items-center gap-1">
                          <Car className="w-4 h-4" />
                          {getVehicleInfo(quote.vehicle_id)}
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {format(new Date(quote.service_date), "dd/MM/yyyy", { locale: ptBR })}
                        </div>
                      </div>
                    </div>
                    <Badge className={
                      quote.payment_status === "pendente" 
                        ? "bg-red-100 text-red-800" 
                        : "bg-orange-100 text-orange-800"
                    }>
                      {quote.payment_status === "pendente" ? "Pagamento Pendente" : "Parcialmente Pago"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="grid md:grid-cols-3 gap-6 mb-6">
                    <div>
                      <p className="text-sm text-gray-500 mb-1">Valor Total</p>
                      <p className="text-2xl font-bold text-gray-900">
                        R$ {(quote.total || 0).toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 mb-1">Valor Pago</p>
                      <p className="text-2xl font-bold text-green-700">
                        R$ {(quote.amount_paid || 0).toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 mb-1">Valor Pendente</p>
                      <p className="text-2xl font-bold text-orange-700">
                        R$ {(quote.amount_pending || 0).toFixed(2)}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <Button
                      onClick={() => handleAddPayment(quote)}
                      className="flex-1 bg-green-600 hover:bg-green-700"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Registrar Pagamento
                    </Button>
                    <Link to={`${createPageUrl("QuoteDetail")}?id=${quote.id}`}>
                      <Button variant="outline">
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Ver Detalhes
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Pagamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Valor Total:</span>
                  <span className="font-bold">R$ {selectedQuote?.total?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Já Pago:</span>
                  <span className="text-green-700 font-semibold">
                    R$ {selectedQuote?.amount_paid?.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between border-t pt-2">
                  <span className="text-gray-600">Pendente:</span>
                  <span className="text-orange-700 font-bold">
                    R$ {selectedQuote?.amount_pending?.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Valor do Pagamento (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                max={selectedQuote?.amount_pending}
              />
              <p className="text-xs text-gray-500">
                Valor máximo: R$ {selectedQuote?.amount_pending?.toFixed(2)}
              </p>
            </div>

            {paymentAmount > 0 && (
              <div className="bg-green-50 p-4 rounded-lg">
                <p className="text-sm font-semibold text-green-900 mb-2">Após este pagamento:</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Total Pago:</span>
                    <span className="font-bold text-green-700">
                      R$ {((selectedQuote?.amount_paid || 0) + paymentAmount).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Ainda Pendente:</span>
                    <span className="font-bold text-orange-700">
                      R$ {Math.max(0, (selectedQuote?.amount_pending || 0) - paymentAmount).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={confirmPayment} 
              className="bg-green-600 hover:bg-green-700"
              disabled={paymentAmount <= 0 || paymentAmount > (selectedQuote?.amount_pending || 0)}
            >
              Confirmar Pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}