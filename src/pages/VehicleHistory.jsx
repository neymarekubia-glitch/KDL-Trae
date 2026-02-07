
import React, { useState, useEffect } from "react";
import { Quote, QuoteItem, Vehicle, Customer, ServiceOrder, VehicleMileageHistory, Tenant } from "@/api/entities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Calendar, Gauge, Wrench, DollarSign, FileText, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function VehicleHistory() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const vehicleId = urlParams.get('id');

  const [vehicle, setVehicle] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [quotes, setQuotes] = useState([]);
  const [serviceOrders, setServiceOrders] = useState([]);
  const [mileageHistory, setMileageHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (vehicleId) {
      loadData();
    }
  }, [vehicleId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const vehicleData = await Vehicle.filter({ id: vehicleId });
      if (vehicleData.length > 0) {
        const v = vehicleData[0];
        setVehicle(v);

        const [customerData, quotesData, ordersData, historyData] = await Promise.all([
          Customer.filter({ id: v.customer_id }),
          Quote.filter({ vehicle_id: vehicleId }),
          ServiceOrder.filter({ vehicle_id: vehicleId }),
          VehicleMileageHistory.filter({ vehicle_id: vehicleId })
        ]);

        setCustomer(customerData[0]);
        
        const sortedQuotes = quotesData.sort((a, b) => 
          new Date(b.service_date) - new Date(a.service_date)
        );
        setQuotes(sortedQuotes);
        setServiceOrders(ordersData);
        
        const sortedHistory = historyData.sort((a, b) => 
          new Date(b.record_date) - new Date(a.record_date)
        );
        setMileageHistory(sortedHistory);
      }
    } catch (e) {
      console.error("Failed to load vehicle history:", e);
    } finally {
      setLoading(false);
    }
  };

  const getServiceOrder = (quoteId) => {
    return serviceOrders.find(so => so.quote_id === quoteId);
  };

  const handleGenerateQuotePDF = async (quote) => {
    // Buscar dados completos da cotação
    const [quoteItemsData, customerData, vehicleData] = await Promise.all([
      QuoteItem.filter({ quote_id: quote.id }),
      Customer.filter({ id: quote.customer_id }),
      Vehicle.filter({ id: quote.vehicle_id })
    ]);

    const items = quoteItemsData;
    const relatedCustomer = customerData[0];
    const relatedVehicle = vehicleData[0];
    
    const getStatusBadgeClass = (status) => {
      switch (status) {
        case "concluida": return "status-concluida";
        case "aprovada": return "status-aprovada";
        case "em_analise": return "status-em_analise";
        case "recusada": return "status-recusada";
        default: return "";
      }
    };

    const getStatusText = (status) => {
      switch (status) {
        case "concluida": return "Concluída";
        case "aprovada": return "Aprovada";
        case "em_analise": return "Em Análise";
        case "recusada": return "Recusada";
        default: return "Desconhecido";
      }
    };

    // Reutilizar a mesma função de geração de PDF
    const pdfWindow = window.open('', '_blank');
    const baseUrl = window.location.origin;
    const resolveUrl = (value, fallbackPath) => {
      const trimmed = (value || '').toString().trim();
      const finalPath = trimmed.length > 0 ? trimmed : fallbackPath;
      if (/^https?:\/\//i.test(finalPath)) return finalPath;
      if (finalPath.startsWith('/')) return `${baseUrl}${finalPath}`;
      return `${baseUrl}/${finalPath}`;
    };
    // Buscar dados da empresa (tenant) para personalizar logo e nome
    let tenantName = import.meta.env.VITE_COMPANY_NAME || 'Sua Oficina Mecânica';
    let tenantLogoUrl = import.meta.env.VITE_COMPANY_LOGO_URL || '';
    try {
      const tenants = await Tenant.list();
      const t = tenants?.[0];
      if (t) {
        tenantName = t.display_name || t.name || tenantName;
        if (t.logo_url) tenantLogoUrl = t.logo_url;
      }
    } catch {
      // fallback para env / default
    }

    const logoUrl = resolveUrl(tenantLogoUrl, '/logogrg.png');
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <base href="${baseUrl}/">
        <title>Orçamento ${quote.quote_number}</title>
        <style>
          body { font-family: 'Helvetica Neue', 'Helvetica', Arial, sans-serif; font-size: 10px; margin: 0; padding: 20px; color: #333; }
          @page { size: A4; margin: 2mm; }
          .container { width: 100%; max-width: 794px; margin: 0 auto; padding: 20px; border: 1px solid #eee; box-shadow: 0 0 10px rgba(0,0,0,0.05); background: #fff; overflow: hidden; }
          h1 { font-size: 20px; color: #0056b3; margin-bottom: 5px; }
          h2 { font-size: 14px; margin-top: 20px; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 5px; color: #0056b3; }
          p { margin: 0 0 5px 0; line-height: 1.4; }
          .header, .footer { text-align: center; margin-bottom: 20px; }
          .header img { max-width: 150px; margin-bottom: 10px; }
          .details-grid { display: flex; justify-content: space-between; margin-bottom: 20px; }
          .details-column { width: 48%; }
          .details-item { margin-bottom: 10px; }
          .details-item strong { display: block; margin-bottom: 3px; color: #555; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #eee; padding: 8px; text-align: left; }
          th { background-color: #f8f8f8; color: #666; font-weight: bold; }
          .total-row td { border-top: 2px solid #0056b3; font-size: 12px; font-weight: bold; }
          .text-right { text-align: right; }
          .status-badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 9px; text-transform: uppercase; }
          .status-concluida { background-color: #d4edda; color: #155724; }
          .status-aprovada { background-color: #d1ecf1; color: #0c5460; }
          .status-em_analise { background-color: #fff3cd; color: #856404; }
          .status-recusada { background-color: #f8d7da; color: #721c24; }
          .notes { background-color: #f9f9f9; padding: 10px; border-left: 3px solid #0056b3; margin-top: 15px; font-size: 9px; }
          .warranty { font-size: 9px; color: #666; margin-top: 10px; }
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: white; }
            .print-button { display: none !important; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <img src="${logoUrl}" alt="${tenantName}" style="max-width: 150px; margin-bottom: 10px;" loading="eager" />
            <h1>${tenantName}</h1>
            ${import.meta.env.VITE_COMPANY_ADDRESS ? `<p>${import.meta.env.VITE_COMPANY_ADDRESS}</p>` : ''}
            ${import.meta.env.VITE_COMPANY_CONTACT ? `<p>${import.meta.env.VITE_COMPANY_CONTACT}</p>` : ''}
          </div>

          <div style="background-color: #0056b3; color: white; padding: 10px; text-align: center; margin-bottom: 20px;">
            <p style="margin: 0; font-size: 16px;">ORÇAMENTO DE SERVIÇOS E PEÇAS</p>
          </div>

          <div class="details-grid">
            <div class="details-column">
              <div class="details-item">
                <strong>ORÇAMENTO Nº:</strong>
                <p>${quote.quote_number}</p>
              </div>
              <div class="details-item">
                <strong>DATA DO SERVIÇO:</strong>
                <p>${format(new Date(quote.service_date), "dd/MM/yyyy", { locale: ptBR })}</p>
              </div>
              <div class="details-item">
                <strong>KM VEÍCULO:</strong>
                <p>${quote.vehicle_mileage ? `${quote.vehicle_mileage.toLocaleString()} km` : "N/A"}</p>
              </div>
              <div class="details-item">
                <strong>STATUS:</strong>
                <p class="status-badge ${getStatusBadgeClass(quote.status)}">
                  ${getStatusText(quote.status)}
                </p>
              </div>
            </div>
            <div class="details-column">
              <div class="details-item">
                <strong>CLIENTE:</strong>
                <p>${relatedCustomer?.name || "N/A"}</p>
              </div>
              <div class="details-item">
                <strong>CONTATO:</strong>
                <p>${relatedCustomer?.phone || "N/A"}</p>
              </div>
              <div class="details-item">
                <strong>VEÍCULO:</strong>
                <p>${relatedVehicle?.brand || "N/A"} ${relatedVehicle?.model || "N/A"} (${relatedVehicle?.year || "N/A"})</p>
              </div>
              <div class="details-item">
                <strong>PLACA:</strong>
                <p>${relatedVehicle?.license_plate || "N/A"}</p>
              </div>
            </div>
          </div>

          <h2>ITENS DO ORÇAMENTO</h2>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th class="text-right">Qtd</th>
                <th class="text-right">Preço Unit.</th>
                <th class="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(item => `
                <tr>
                  <td>
                    ${item.service_item_name}
                    ${item.description ? `<p style="font-size: 8px; color: #777;">${item.description}</p>` : ''}
                    ${item.warranty_days && item.warranty_days > 0 ? `<p class="warranty">Garantia: ${item.warranty_days} dias</p>` : ''}
                  </td>
                  <td class="text-right">${item.quantity}</td>
                  <td class="text-right">R$ ${(item.unit_price || 0).toFixed(2)}</td>
                  <td class="text-right">R$ ${(item.total || 0).toFixed(2)}</td>
                </tr>
              `).join('')}
              <tr class="total-row">
                <td colspan="3" class="text-right">VALOR TOTAL:</td>
                <td class="text-right">R$ ${(quote.total || 0).toFixed(2)}</td>
              </tr>
            </tbody>
          </table>

          ${quote.notes ? `
            <div class="notes">
              <strong>Observações:</strong>
              <p>${quote.notes}</p>
            </div>
          ` : ''}

          <div style="margin-top: 40px; text-align: center; font-size: 9px; color: #777;">
            <p>Obrigado por escolher os nossos serviços!</p>
            <p>Este orçamento tem validade de 7 dias.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Preload logo and wait images before print (improves reliability on Vercel)
    const withPreload = htmlContent.replace('</head>', `
      <link rel="preload" as="image" href="${logoUrl}">
    </head>`);
    const withWaitImages = withPreload.replace('</body>', `
      <script>
        (function(){
          function waitForImages(timeoutMs){
            return new Promise(function(resolve){
              var imgs = Array.prototype.slice.call(document.images || []);
              if (imgs.length === 0) return resolve();
              var remaining = imgs.length;
              var timer = setTimeout(function(){ resolve(); }, timeoutMs || 10000);
              function done(){ if (--remaining === 0) { clearTimeout(timer); resolve(); } }
              imgs.forEach(function(img){
                if (img.complete && img.naturalWidth > 0) { done(); return; }
                img.addEventListener('load', done, { once: true });
                img.addEventListener('error', done, { once: true });
              });
            });
          }
          function getPxPerMm(){
            var div = document.createElement('div');
            div.style.width = '100mm';
            div.style.height = '0';
            div.style.position = 'absolute';
            div.style.left = '-9999px';
            document.body.appendChild(div);
            var px = div.getBoundingClientRect().width;
            document.body.removeChild(div);
            return px / 100;
          }
          function fitToSinglePage(){
            var container = document.querySelector('.container');
            if (!container) return;
            var pxPerMm = getPxPerMm();
            var maxHeightPx = 297 * pxPerMm;
            var contentHeightPx = container.scrollHeight;
            if (contentHeightPx > maxHeightPx) {
              var scale = maxHeightPx / contentHeightPx;
              container.style.transform = 'scale(' + scale + ')';
              container.style.transformOrigin = 'top left';
              document.body.style.height = maxHeightPx + 'px';
              document.body.style.overflow = 'hidden';
            }
          }
          window.addEventListener('load', function(){
            waitForImages(10000).then(function(){
              requestAnimationFrame(function(){
                fitToSinglePage();
                setTimeout(function(){ window.print(); }, 200);
              });
            });
          });
        })();
      </script>
    </body>`);
    pdfWindow.document.write(withWaitImages);
    pdfWindow.document.close();
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500">Veículo não encontrado</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 bg-gradient-to-br from-gray-50 to-gray-100 min-h-screen">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => navigate(createPageUrl("Customers"))}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Histórico do Veículo</h1>
            <p className="text-gray-500 mt-1">{vehicle.brand} {vehicle.model} - {vehicle.license_plate}</p>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <Card className="shadow-lg border-0">
            <CardHeader className="border-b bg-gradient-to-r from-blue-50 to-blue-100/50">
              <CardTitle className="text-lg">Informações do Veículo</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-3">
              <div>
                <p className="text-sm text-gray-500">Proprietário</p>
                <p className="font-semibold">{customer?.name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Placa</p>
                <p className="font-mono font-bold">{vehicle.license_plate}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Marca/Modelo</p>
                <p>{vehicle.brand} {vehicle.model}</p>
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
                <p className="font-bold text-lg text-blue-700">{vehicle.current_mileage?.toLocaleString()} km</p>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-lg border-0 md:col-span-2">
            <CardHeader className="border-b bg-gradient-to-r from-green-50 to-green-100/50">
              <CardTitle className="text-lg">Estatísticas</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600">Total de Serviços</p>
                  <p className="text-2xl font-bold text-blue-700">{quotes.filter(q => q.status === "concluida").length}</p>
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
                <div className="bg-purple-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600">Última Visita</p>
                  <p className="text-lg font-bold text-purple-700">
                    {quotes.length > 0 
                      ? format(new Date(quotes[0].service_date), "dd/MM/yyyy", { locale: ptBR })
                      : "Nenhuma visita"}
                  </p>
                </div>
                <div className="bg-orange-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600">KM na Última Visita</p>
                  <p className="text-lg font-bold text-orange-700">
                    {quotes.length > 0 && quotes[0].vehicle_mileage
                      ? `${quotes[0].vehicle_mileage.toLocaleString()} km`
                      : "N/A"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Histórico de Quilometragem */}
        {mileageHistory.length > 0 && (
          <Card className="shadow-lg border-0">
            <CardHeader className="border-b bg-gradient-to-r from-purple-50 to-purple-100/50">
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-purple-600" />
                Histórico de Quilometragem
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-3">
                {mileageHistory.map((history, index) => (
                  <div key={history.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-semibold text-gray-900">{history.mileage?.toLocaleString()} km</p>
                      <p className="text-sm text-gray-500">{history.notes || "Registro de quilometragem"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-700">
                        {format(new Date(history.record_date), "dd/MM/yyyy", { locale: ptBR })}
                      </p>
                      {index < mileageHistory.length - 1 && (
                        <p className="text-xs text-green-600">
                          +{(history.mileage - mileageHistory[index + 1].mileage).toLocaleString()} km
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Histórico de Serviços */}
        <Card className="shadow-lg border-0">
          <CardHeader className="border-b bg-gradient-to-r from-blue-50 to-blue-100/50">
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              Histórico de Serviços
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
                {quotes.map((quote) => {
                  const serviceOrder = getServiceOrder(quote.id);
                  return (
                    <Card key={quote.id} className="border-2 hover:border-blue-300 transition-colors">
                      <CardContent className="p-6">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <div className="flex items-center gap-3 mb-2">
                              <span className="font-mono font-bold text-gray-900">{quote.quote_number}</span>
                              <Badge className={
                                quote.status === "concluida" ? "bg-green-100 text-green-800" :
                                quote.status === "aprovada" ? "bg-blue-100 text-blue-800" :
                                quote.status === "em_analise" ? "bg-yellow-100 text-yellow-800" :
                                "bg-gray-100 text-gray-800"
                              }>
                                {quote.status === "concluida" ? "Concluída" :
                                 quote.status === "aprovada" ? "Aprovada" :
                                 quote.status === "em_analise" ? "Em Análise" : "Recusada"}
                              </Badge>
                              {serviceOrder && (
                                <Badge variant="outline" className="font-mono">
                                  {serviceOrder.order_number}
                                </Badge>
                              )}
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
                          <div className="text-right space-y-2">
                            <p className="text-2xl font-bold text-green-700">
                              R$ {(quote.total || 0).toFixed(2)}
                            </p>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleGenerateQuotePDF(quote)}
                              className="hover:bg-blue-100"
                            >
                              <FileText className="w-4 h-4 mr-1" />
                              Ver PDF
                            </Button>
                          </div>
                        </div>

                        {quote.notes && (
                          <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                            <p className="text-sm text-gray-700">{quote.notes}</p>
                          </div>
                        )}

                        <QuoteItemsList quoteId={quote.id} />
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function QuoteItemsList({ quoteId }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadItems = async () => {
      const itemsData = await QuoteItem.filter({ quote_id: quoteId });
      setItems(itemsData);
      setLoading(false);
    };
    loadItems();
  }, [quoteId]);

  if (loading) {
    return <div className="text-sm text-gray-500">Carregando itens...</div>;
  }

  return (
    <div className="border-t pt-4">
      <p className="text-sm font-semibold text-gray-700 mb-2">Serviços Realizados:</p>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={index} className="flex justify-between items-center text-sm bg-white p-2 rounded border">
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
  );
}
