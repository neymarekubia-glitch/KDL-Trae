
import React from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, User, Car, Calendar, ExternalLink, CheckCircle, XCircle } from "lucide-react";
import { format, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Quote, ServiceOrder, QuoteItem, ServiceItem, MaintenanceReminder, Customer, Vehicle } from "@/api/entities";

const statusColors = {
  em_analise: "bg-yellow-100 text-yellow-800 border-yellow-200",
  aprovada: "bg-green-100 text-green-800 border-green-200",
  recusada: "bg-red-100 text-red-800 border-red-200",
  concluida: "bg-blue-100 text-blue-800 border-blue-200"
};

const statusLabels = {
  em_analise: "Em Análise",
  aprovada: "Aprovada",
  recusada: "Recusada",
  concluida: "Concluída"
};

const paymentStatusColors = {
  pendente: "bg-red-100 text-red-800",
  parcialmente_pago: "bg-orange-100 text-orange-800",
  pago: "bg-green-100 text-green-800"
};

const paymentStatusLabels = {
  pendente: "Pendente",
  parcialmente_pago: "Parcial",
  pago: "Pago"
};

export default function QuoteCard({ quote, customerName, vehicleInfo, onRefresh }) {
  const handleApprove = async () => {
    if (confirm("Aprovar esta cotação e gerar Ordem de Serviço?")) {
      try {
        await Quote.update(quote.id, {
          status: "aprovada",
          approved_date: new Date().toISOString()
        });
        
        // Gera número de OS baseado no número da própria cotação,
        // garantindo unicidade por tenant sem depender de contadores frágeis.
        const orderNumber = `OS-${quote.quote_number}`;
        
        const serviceOrder = await ServiceOrder.create({
          quote_id: quote.id,
          order_number: orderNumber,
          customer_id: quote.customer_id,
          vehicle_id: quote.vehicle_id,
          vehicle_mileage: quote.vehicle_mileage,
          status: "aguardando"
        });

        console.log("✅ Service Order created:", serviceOrder);

        // Buscar lembretes já existentes relacionados a esta cotação (evita duplicação)
        const existingReminders = await MaintenanceReminder.filter({ quote_id: quote.id });
        
        // Criar faltantes agora com base nos itens (idempotente)
        {
          // Buscar dados necessários
          const quoteItems = await QuoteItem.filter({ quote_id: quote.id });
          const serviceItems = await ServiceItem.list();
          const customers = await Customer.filter({ id: quote.customer_id });
          const vehicles = await Vehicle.filter({ id: quote.vehicle_id });
          const customerData = customers[0];
          const vehicleData = vehicles[0];

          console.log("📋 Creating reminders - Quote Items:", quoteItems.length);
          
          let remindersCreated = 0;
          
          // Criar lembretes para cada item que tem período de substituição
          for (const quoteItem of quoteItems) {
            if (quoteItem.next_service_date || quoteItem.next_service_mileage) {
              const alreadyExists = existingReminders.some(r => r.quote_item_id === quoteItem.id);
              if (alreadyExists) continue;
              const reminderType = quoteItem.next_service_date && quoteItem.next_service_mileage
                ? "ambos"
                : quoteItem.next_service_date
                  ? "tempo"
                  : "quilometragem";

              const serviceItem = serviceItems.find(s => s.id === quoteItem.service_item_id);
              const templateMessage = serviceItem?.template_reminder_message || "";
              const whatsappMessage = templateMessage
                ? `Olá ${customerName}! 🔧\n\n${templateMessage}\n\nVeículo: ${vehicleInfo}\n\nAgende agora mesmo! 📅`
                : `Olá ${customerName}! 🔧\n\nLembrando que está próximo o período para realizar ${quoteItem.service_item_name} no seu ${vehicleInfo}.\n\nAgende agora mesmo! 📅`;

              await MaintenanceReminder.create({
                customer_id: quote.customer_id,
                vehicle_id: quote.vehicle_id,
                quote_item_id: quoteItem.id,
                service_order_id: serviceOrder.id,
                service_name: quoteItem.service_item_name,
                reminder_type: reminderType,
                target_date: quoteItem.next_service_date || null,
                target_mileage: quoteItem.next_service_mileage || null,
                status: "pendente",
                whatsapp_message: whatsappMessage,
                customer_phone: customerData?.phone
              });

              remindersCreated++;
            }
          }
          
          if (remindersCreated > 0) {
            console.log(`✅ ${remindersCreated} lembrete(s) criado(s) automaticamente!`);
          }
        }
        
        alert(`✅ Cotação aprovada e OS ${orderNumber} criada com sucesso!`);
        
        onRefresh();
      } catch (error) {
        console.error("❌ Error approving quote:", error);
        alert("Erro ao aprovar cotação: " + error.message);
      }
    }
  };

  const handleReject = async () => {
    if (confirm("Rejeitar esta cotação?")) {
      await Quote.update(quote.id, {
        status: "recusada"
      });
      onRefresh();
    }
  };

  return (
    <Card className="shadow-lg border-0 hover:shadow-xl transition-all duration-300">
      <div className="h-2 bg-gradient-to-r from-blue-600 to-blue-700" />
      <CardHeader className="p-6 bg-gradient-to-br from-blue-50/50 to-transparent">
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            <span className="font-mono font-bold text-gray-900">{quote.quote_number}</span>
          </div>
          <Badge className={`${statusColors[quote.status]} border`}>
            {statusLabels[quote.status]}
          </Badge>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-gray-700">
            <User className="w-4 h-4 text-blue-600" />
            <span className="font-medium">{customerName}</span>
          </div>
          <div className="flex items-center gap-2 text-gray-600">
            <Car className="w-4 h-4 text-orange-600" />
            <span className="text-sm">{vehicleInfo}</span>
          </div>
          <div className="flex items-center gap-2 text-gray-600">
            <Calendar className="w-4 h-4 text-green-600" />
            <span className="text-sm">
              {format(new Date(quote.service_date), "dd/MM/yyyy", { locale: ptBR })}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6 space-y-4">
        <div className="flex justify-between items-center">
          <span className="text-gray-600">Valor Total:</span>
          <span className="text-2xl font-bold text-green-700">
            R$ {(quote.total || 0).toFixed(2)}
          </span>
        </div>

        {quote.status === "concluida" && (
          <div className="pt-4 border-t">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Status do Pagamento:</span>
              <Badge className={paymentStatusColors[quote.payment_status]}>
                {paymentStatusLabels[quote.payment_status]}
              </Badge>
            </div>
            {quote.amount_pending > 0 && (
              <div className="text-sm text-orange-700">
                Pendente: R$ {(quote.amount_pending || 0).toFixed(2)}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2 pt-4 border-t">
          <Link to={`${createPageUrl("QuoteDetail")}?id=${quote.id}`} className="w-full">
            <Button variant="outline" className="w-full">
              <ExternalLink className="w-4 h-4 mr-2" />
              Ver Detalhes
            </Button>
          </Link>
          
          {quote.status === "em_analise" && (
            <div className="flex gap-2">
              <Button
                onClick={handleApprove}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Aprovar
              </Button>
              <Button
                onClick={handleReject}
                variant="destructive"
                className="flex-1"
              >
                <XCircle className="w-4 h-4 mr-2" />
                Rejeitar
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
