
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
        await Quote.approve(quote.id);
        alert(`✅ Cotação aprovada!`);
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
