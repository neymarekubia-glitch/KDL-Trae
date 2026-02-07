import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileText, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Skeleton } from "@/components/ui/skeleton";

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

export default function RecentQuotes({ quotes, customers, vehicles, loading }) {
  const recentQuotes = quotes.slice(0, 10);

  const getCustomerName = (customerId) => {
    const customer = customers.find(c => c.id === customerId);
    return customer?.name || "Cliente não encontrado";
  };

  const getVehicleInfo = (vehicleId) => {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    return vehicle ? `${vehicle.brand} ${vehicle.model} - ${vehicle.license_plate}` : "Veículo não encontrado";
  };

  return (
    <Card className="shadow-lg border-0">
      <CardHeader className="border-b bg-gradient-to-r from-blue-50 to-blue-100/50">
        <CardTitle className="flex items-center gap-2 text-gray-900">
          <FileText className="w-5 h-5 text-blue-600" />
          Cotações Recentes
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="font-semibold">Nº Cotação</TableHead>
                <TableHead className="font-semibold">Cliente</TableHead>
                <TableHead className="font-semibold">Veículo</TableHead>
                <TableHead className="font-semibold">Valor</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="font-semibold">Data</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array(5).fill(0).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-24 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                  </TableRow>
                ))
              ) : (
                recentQuotes.map((quote) => (
                  <TableRow key={quote.id} className="hover:bg-gray-50 transition-colors">
                    <TableCell className="font-mono font-medium">{quote.quote_number}</TableCell>
                    <TableCell>{getCustomerName(quote.customer_id)}</TableCell>
                    <TableCell className="text-sm text-gray-600">{getVehicleInfo(quote.vehicle_id)}</TableCell>
                    <TableCell className="font-semibold text-green-700">
                      R$ {(quote.total || 0).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge className={`${statusColors[quote.status]} border`}>
                        {statusLabels[quote.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {format(new Date(quote.created_date), "dd/MM/yyyy", { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      <Link 
                        to={`${createPageUrl("QuoteDetail")}?id=${quote.id}`}
                        className="text-blue-600 hover:text-blue-800 transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}