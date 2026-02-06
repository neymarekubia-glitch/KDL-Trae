
import React from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, User, Car, Calendar, Clock, Play, StopCircle, Download } from "lucide-react";
import { format, formatDistance } from "date-fns";
import { ptBR } from "date-fns/locale";
import { QuoteItem, Tenant } from "@/api/entities";

const statusColors = {
  aguardando: "bg-yellow-100 text-yellow-800 border-yellow-200",
  em_andamento: "bg-green-100 text-green-800 border-green-200",
  finalizada: "bg-blue-100 text-blue-800 border-blue-200"
};

const statusLabels = {
  aguardando: "Aguardando",
  em_andamento: "Em Andamento",
  finalizada: "Finalizada"
};

function formatDuration(hours) {
  if (!hours || hours <= 0) return "0 minutos";
  const totalMinutes = Math.round(hours * 60);
  if (totalMinutes < 60) {
    return `${totalMinutes} minuto${totalMinutes === 1 ? "" : "s"}`;
  }
  const totalHours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  if (remainingMinutes === 0) {
    return `${totalHours} hora${totalHours === 1 ? "" : "s"}`;
  }
  return `${totalHours}h ${remainingMinutes}min`;
}

export default function ServiceOrderCard({ order, quote, customer, vehicle, customerName, vehicleInfo, onStart, onFinish }) {
  
  const handleGeneratePDF = async () => {
    if (!quote || !customer || !vehicle) return;

    // Buscar itens da cotação
    const items = await QuoteItem.filter({ quote_id: quote.id });

    // Buscar dados da empresa (tenant) atual
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
      // se falhar, usa env / default
    }
    
    // Separar itens por tipo
    const servicos = items.filter(item => item.service_item_type === "servico");
    const pecas = items.filter(item => item.service_item_type === "peca");
    const produtos = items.filter(item => item.service_item_type === "produto");
    
    const renderItemTable = (tableItems, tableTitle) => {
      if (tableItems.length === 0) return '';
      
      return `
        <div class="item-section">
          <h3 class="table-title">${tableTitle}</h3>
          <table class="services-table">
            <thead>
              <tr>
                <th style="width: 35px;">Item</th>
                <th>Descrição</th>
                <th style="width: 40px; text-align: center;">Qtd</th>
                <th style="width: 70px; text-align: right;">Valor Unit.</th>
                <th style="width: 70px; text-align: right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${tableItems.map((item, index) => `
                <tr>
                  <td style="text-align: center; font-weight: 700;">${String(index + 1).padStart(2, '0')}</td>
                  <td>
                    <strong>${item.service_item_name}</strong>
                    ${item.warranty_days > 0 ? `<br><span class="warranty-badge">🛡️ ${item.warranty_days}d</span>` : ''}
                  </td>
                  <td style="text-align: center; font-weight: 600;">${item.quantity}</td>
                  <td style="text-align: right;">R$ ${(item.unit_price || 0).toFixed(2)}</td>
                  <td style="text-align: right; font-weight: 700;">R$ ${(item.total || 0).toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    };
    
    // Renderizar seção de pagamento se houver valores pagos ou pendentes
    const renderPaymentSection = () => {
      const hasPendingPayment = quote.status === "concluida" && (quote.amount_pending > 0 || quote.amount_paid > 0);
      
      if (!hasPendingPayment) return '';
      
      return `
        <div class="payment-section">
          <h3 class="payment-title">💳 DETALHES DO PAGAMENTO</h3>
          <div class="payment-details">
            <div class="payment-row">
              <span>Valor Total:</span>
              <span class="payment-value">R$ ${(quote.total || 0).toFixed(2)}</span>
            </div>
            <div class="payment-row paid">
              <span>Valor Pago:</span>
              <span class="payment-value">R$ ${(quote.amount_paid || 0).toFixed(2)}</span>
            </div>
            <div class="payment-row pending">
              <span>Valor Restante:</span>
              <span class="payment-value">R$ ${(quote.amount_pending || 0).toFixed(2)}</span>
            </div>
          </div>
        </div>
      `;
    };

    const pdfWindow = window.open('', '_blank');
    const baseUrl = window.location.origin;
    const resolveUrl = (value, fallbackPath) => {
      const trimmed = (value || '').toString().trim();
      const finalPath = trimmed.length > 0 ? trimmed : fallbackPath;
      if (/^https?:\/\//i.test(finalPath)) return finalPath;
      if (finalPath.startsWith('/')) return `${baseUrl}${finalPath}`;
      return `${baseUrl}/${finalPath}`;
    };
    const logoUrl = resolveUrl(tenantLogoUrl, '/logogrg.png');
    // Map fallback images per requested positions
    // carro4 -> Vista Frontal, carro3 -> Vista Traseira, carro2 -> Lateral Esquerda, carro1 -> Lateral Direita
    const vehicleFrontUrl = resolveUrl(import.meta.env.VITE_VEHICLE_DIAGRAM_FRONT_URL, '/carro4.png');
    const vehicleRearUrl = resolveUrl(import.meta.env.VITE_VEHICLE_DIAGRAM_REAR_URL, '/carro3.png');
    const vehicleLeftUrl = resolveUrl(import.meta.env.VITE_VEHICLE_DIAGRAM_LEFT_URL, '/carro2.png');
    const vehicleRightUrl = resolveUrl(import.meta.env.VITE_VEHICLE_DIAGRAM_RIGHT_URL, '/carro1.png');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <base href="${baseUrl}/">
        <title>Orçamento ${quote.quote_number}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: 'Segoe UI', Arial, sans-serif; 
            padding: 0;
            color: #1a202c;
            font-size: 9px;
            background: white;
            line-height: 1.2;
          }
          
          @page {
            size: A4;
            margin: 2mm;
          }
          
          .page {
            width: 210mm;
            height: 297mm;
            margin: 0 auto;
            background: white;
            padding: 2mm;
            position: relative;
            display: flex;
            flex-direction: column;
            min-height: 297mm;
            overflow: hidden;
          }
          
          .content {
            flex: 1;
          }
          
          .header {
            background: #000000;
            padding: 6px 12px;
            border-radius: 4px;
            margin-bottom: 3px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          
          .logo-img {
            height: 28px;
            width: auto;
          }
          
          .doc-title {
            font-size: 20px;
            font-weight: bold;
            letter-spacing: 1.5px;
            color: white;
          }
          
          .doc-number {
            font-size: 11px;
            color: #ef4444;
            font-weight: bold;
            margin-top: 2px;
            background: white;
            padding: 2px 8px;
            border-radius: 10px;
            display: inline-block;
          }
          
          .company-info {
            background: #f1f5f9;
            padding: 4px;
            border-radius: 3px;
            border-left: 3px solid #000000;
            margin-bottom: 3px;
            font-size: 8px;
            line-height: 1.2;
          }
          
          .company-info strong {
            color: #000000;
            font-size: 9px;
          }
          
          .info-container {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 3px;
            margin-bottom: 3px;
          }
          
          .info-section {
            background: white;
            padding: 4px;
            border-radius: 3px;
            border: 1px solid #e2e8f0;
          }
          
          .info-section h3 {
            background: #000000;
            color: white;
            padding: 3px 6px;
            margin: -4px -4px 4px -4px;
            border-radius: 2px 2px 0 0;
            font-size: 10px;
            font-weight: 600;
          }
          
          .info-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 3px;
          }
          
          .info-row {
            padding: 3px;
            background: #f8fafc;
            border-radius: 2px;
            border-left: 2px solid #ef4444;
          }
          
          .info-label {
            font-weight: 600;
            color: #64748b;
            font-size: 7px;
            text-transform: uppercase;
            margin-bottom: 1px;
          }
          
          .info-value {
            color: #1e293b;
            font-size: 9px;
            font-weight: 500;
          }
          
          .item-section {
            margin: 2px 0;
          }
          
          .table-title {
            background: #f8fafc;
            padding: 3px 6px;
            border-left: 3px solid #ef4444;
            font-size: 10px;
            font-weight: 700;
            color: #1e293b;
            margin-bottom: 2px;
            border-radius: 2px;
          }
          
          .services-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 2px;
            font-size: 8.5px;
          }
          
          .services-table thead {
            background: #000000;
          }
          
          .services-table th {
            color: white;
            padding: 3px;
            text-align: left;
            font-size: 8.5px;
            font-weight: 600;
            text-transform: uppercase;
          }
          
          .services-table td {
            padding: 2px 3px;
            border-bottom: 1px solid #e2e8f0;
          }
          
          .services-table tbody tr:nth-child(even) {
            background: #f8fafc;
          }
          
          .warranty-badge {
            display: inline-block;
            background: #dcfce7;
            color: #166534;
            padding: 1px 4px;
            border-radius: 3px;
            font-size: 7px;
            font-weight: 600;
            margin-top: 1px;
          }
          
          .total-section {
            background: #000000;
            color: white;
            padding: 6px 10px;
            border-radius: 3px;
            margin: 3px 0;
          }
          
          .total-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 14px;
            font-weight: bold;
          }
          
          .total-value {
            color: #ef4444;
            font-size: 16px;
          }
          
          .payment-section {
            background: #f0f9ff;
            border: 2px solid #3b82f6;
            border-radius: 4px;
            padding: 6px;
            margin: 3px 0;
          }
          
          .payment-title {
            background: #3b82f6;
            color: white;
            padding: 3px 6px;
            margin: -6px -6px 6px -6px;
            border-radius: 2px 2px 0 0;
            font-size: 10px;
            font-weight: 700;
            text-align: center;
          }
          
          .payment-details {
            display: grid;
            gap: 4px;
          }
          
          .payment-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 4px 6px;
            background: white;
            border-radius: 3px;
            font-size: 10px;
            font-weight: 600;
          }
          
          .payment-row.paid {
            background: #dcfce7;
            color: #166534;
            border-left: 3px solid #16a34a;
          }
          
          .payment-row.pending {
            background: #fff7ed;
            color: #9a3412;
            border-left: 3px solid #f97316;
          }
          
          .payment-value {
            font-size: 12px;
            font-weight: 700;
          }
          
          .legal-notice {
            background: #fffbeb;
            border-left: 3px solid #f59e0b;
            padding: 3px;
            margin: 2px 0;
            border-radius: 2px;
            font-size: 7px;
            line-height: 1.2;
            color: #78350f;
          }
          
          .legal-notice strong {
            font-size: 8px;
          }
          
          .inspection-section {
            margin-top: 3px;
          }
          
          .vehicle-diagrams {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 3px;
            margin: 2px 0;
          }
          
          .diagram {
            background: white;
            border: 1px solid #000000;
            border-radius: 3px;
            padding: 2px;
          }
          
          .diagram-title {
            font-weight: 700;
            text-align: center;
            margin-bottom: 1px;
            font-size: 8px;
            color: #000000;
            text-transform: uppercase;
            padding-bottom: 1px;
            border-bottom: 1px solid #ef4444;
          }
          
          .car-diagram {
            width: 100%;
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
          }
          
          .car-diagram img {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
          }
          
          .footer-section {
            margin-top: auto;
            padding-top: 5px;
            border-top: 2px solid #000000;
          }
          
          .signatures {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
            margin-bottom: 5px;
          }
          
          .signature-line {
            border-top: 2px solid #000000;
            margin: 25px 8px 3px 8px;
          }
          
          .signature-label {
            font-weight: 700;
            color: #000000;
            font-size: 9px;
            text-align: center;
            text-transform: uppercase;
          }
          
          .footer {
            text-align: center;
            font-size: 7px;
            color: #64748b;
          }
          
          .footer-company {
            font-weight: 700;
            color: #000000;
            font-size: 9px;
            margin-bottom: 2px;
          }
          
          @media print {
            body { background: white; }
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            .print-button { display: none !important; }
          }
        </style>
        <link rel="preload" as="image" href="${logoUrl}">
        <link rel="preload" as="image" href="${vehicleFrontUrl}">
        <link rel="preload" as="image" href="${vehicleRearUrl}">
        <link rel="preload" as="image" href="${vehicleLeftUrl}">
        <link rel="preload" as="image" href="${vehicleRightUrl}">
      </head>
      <body>
        <div class="page">
          <div class="content">
            <div class="header">
              <div class="logo-section">
                <img src="${logoUrl}" alt="${tenantName}" class="logo-img" loading="eager" fetchpriority="high" decoding="sync">
              </div>
              <div class="header-right">
                <div class="doc-title">ORÇAMENTO</div>
                <div class="doc-number">${quote.quote_number}</div>
              </div>
            </div>
            
            <div class="company-info">
              <strong>${tenantName}</strong><br>
              ${import.meta.env.VITE_COMPANY_ADDRESS || ''} ${import.meta.env.VITE_COMPANY_CONTACT ? `| ${import.meta.env.VITE_COMPANY_CONTACT}` : ''}<br>
              <strong>Data:</strong> ${format(new Date(quote.created_date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} ${import.meta.env.VITE_COMPANY_CNPJ ? `| <strong>CNPJ:</strong> ${import.meta.env.VITE_COMPANY_CNPJ}` : ''}
            </div>
            
            <div class="info-container">
              <div class="info-section">
                <h3>👤 CLIENTE</h3>
                <div class="info-grid">
                  <div class="info-row">
                    <div class="info-label">Nome</div>
                    <div class="info-value">${customer.name}</div>
                  </div>
                  <div class="info-row">
                    <div class="info-label">CPF/CNPJ</div>
                    <div class="info-value">${customer.cpf_cnpj || 'Não informado'}</div>
                  </div>
                  <div class="info-row">
                    <div class="info-label">Telefone</div>
                    <div class="info-value">${customer.phone}</div>
                  </div>
                  <div class="info-row">
                    <div class="info-label">E-mail</div>
                    <div class="info-value">${customer.email || 'Não informado'}</div>
                  </div>
                </div>
              </div>
              
              <div class="info-section">
                <h3>🚗 VEÍCULO</h3>
                <div class="info-grid">
                  <div class="info-row">
                    <div class="info-label">Placa</div>
                    <div class="info-value" style="font-size: 11px; font-weight: 700; color: #ef4444;">${vehicle.license_plate}</div>
                  </div>
                  <div class="info-row">
                    <div class="info-label">Marca / Modelo</div>
                    <div class="info-value">${vehicle.brand} ${vehicle.model}</div>
                  </div>
                  <div class="info-row">
                    <div class="info-label">Ano / Cor</div>
                    <div class="info-value">${vehicle.year || 'N/A'} - ${vehicle.color || 'N/A'}</div>
                  </div>
                  <div class="info-row">
                    <div class="info-label">KM Atual / Data do Serviço</div>
                    <div class="info-value">${quote.vehicle_mileage?.toLocaleString() || 'N/A'} km - ${format(new Date(quote.service_date), "dd/MM/yyyy", { locale: ptBR })}</div>
                  </div>
                </div>
              </div>
            </div>
            
            ${renderItemTable(servicos, '🔧 SERVIÇOS')}
            ${renderItemTable(pecas, '⚙️ PEÇAS')}
            ${renderItemTable(produtos, '📦 PRODUTOS')}
            
            <div class="total-section">
              <div class="total-row">
                <span>VALOR TOTAL:</span>
                <span class="total-value">R$ ${(quote.total || 0).toFixed(2)}</span>
              </div>
            </div>
            
            ${renderPaymentSection()}
            
            ${quote.notes ? `
            <div class="info-section" style="margin-bottom: 2px;">
              <h3>📝 OBSERVAÇÕES</h3>
              <p style="font-size: 8px; line-height: 1.2;">${quote.notes}</p>
            </div>
            ` : ''}
            
            <div class="legal-notice">
              <strong>⚖️ Termos:</strong> Validade de 30 dias. Garantias especificadas por item. Oficina não se responsabiliza por objetos no interior do veículo.
            </div>
            
            <div class="inspection-section">
              <div class="vehicle-diagrams">
                <div class="diagram">
                  <div class="diagram-title">Vista Frontal</div>
                  <div class="car-diagram">
                    <img src="${vehicleFrontUrl}" alt="Vista Frontal" loading="eager" fetchpriority="high" decoding="sync">
                  </div>
                </div>
                
                <div class="diagram">
                  <div class="diagram-title">Vista Traseira</div>
                  <div class="car-diagram">
                    <img src="${vehicleRearUrl}" alt="Vista Traseira" loading="eager" fetchpriority="high" decoding="sync">
                  </div>
                </div>
                
                <div class="diagram">
                  <div class="diagram-title">Lateral Esquerda</div>
                  <div class="car-diagram">
                    <img src="${vehicleLeftUrl}" alt="Lateral Esquerda" loading="eager" fetchpriority="high" decoding="sync">
                  </div>
                </div>
                
                <div class="diagram">
                  <div class="diagram-title">Lateral Direita</div>
                  <div class="car-diagram">
                    <img src="${vehicleRightUrl}" alt="Lateral Direita" loading="eager" fetchpriority="high" decoding="sync">
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div class="footer-section">
            <div class="signatures">
              <div class="signature-box">
                <div class="signature-line"></div>
                <div class="signature-label">Assinatura do Cliente</div>
              </div>
              <div class="signature-box">
                <div class="signature-line"></div>
                <div class="signature-label">Responsável Técnico</div>
              </div>
            </div>
            
            <div class="footer">
              <div class="footer-company">${tenantName}</div>
              <p>Orçamento gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
            </div>
          </div>
        </div>
      <script>
        (function() {
          function waitForImages(timeoutMs) {
            return new Promise(function(resolve) {
              var imgs = Array.prototype.slice.call(document.images || []);
              if (imgs.length === 0) return resolve();
              var remaining = imgs.length;
              var timer = setTimeout(function(){ resolve(); }, timeoutMs || 12000);
              function done(){ if (--remaining === 0) { clearTimeout(timer); resolve(); } }
              imgs.forEach(function(img) {
                if (img.complete && img.naturalWidth > 0) { done(); return; }
                img.addEventListener('load', done, { once: true });
                img.addEventListener('error', done, { once: true });
              });
            });
          }

          function getPxPerMm() {
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

          function fitToSinglePage() {
            var page = document.querySelector('.page');
            if (!page) return;
            var pxPerMm = getPxPerMm();
            var maxHeightPx = 297 * pxPerMm;
            var contentHeightPx = page.scrollHeight;
            if (contentHeightPx > maxHeightPx) {
              var scale = maxHeightPx / contentHeightPx;
              page.style.transform = 'scale(' + scale + ')';
              page.style.transformOrigin = 'top left';
              document.body.style.height = maxHeightPx + 'px';
              document.body.style.overflow = 'hidden';
            }
          }

          window.addEventListener('load', function(){
            waitForImages(12000).then(function(){
              requestAnimationFrame(function() {
                fitToSinglePage();
                setTimeout(function(){ window.print(); }, 200);
              });
            });
          });
        })();
      </script>
      </body>
      </html>
    `;

    pdfWindow.document.write(htmlContent);
    pdfWindow.document.close();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
    >
      <Card className="shadow-lg border-0 hover:shadow-xl transition-all duration-300">
        <div className={`h-2 ${order.status === "em_andamento" ? "bg-gradient-to-r from-green-600 to-green-700" : "bg-gradient-to-r from-blue-600 to-blue-700"}`} />
        <CardHeader className="p-6 bg-gradient-to-br from-blue-50/50 to-transparent">
          <div className="flex justify-between items-start mb-3">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              <span className="font-mono font-bold text-gray-900">{order.order_number}</span>
            </div>
            <Badge className={`${statusColors[order.status]} border`}>
              {statusLabels[order.status]}
            </Badge>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-gray-600">
              <User className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium">{customerName}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <Car className="w-4 h-4 text-blue-600" />
              <span className="text-sm">{vehicleInfo}</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="flex justify-between items-center pb-3 border-b">
            <span className="text-sm text-gray-500">Valor</span>
            <span className="text-xl font-bold text-green-700">
              R$ {(quote?.total || 0).toFixed(2)}
            </span>
          </div>

          {order.start_date && (
            <div className="flex items-center gap-2 text-gray-600 text-sm">
              <Clock className="w-4 h-4 text-green-600" />
              <span>
                Iniciado {formatDistance(new Date(order.start_date), new Date(), { 
                  addSuffix: true, 
                  locale: ptBR 
                })}
              </span>
            </div>
          )}

          {order.end_date && (
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500">Duração</span>
              <span className="font-semibold">
                {formatDuration(order.duration_hours)}
              </span>
            </div>
          )}

          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <Calendar className="w-4 h-4" />
            <span>{format(new Date(order.created_date), "dd/MM/yyyy", { locale: ptBR })}</span>
          </div>

          <div className="flex gap-2">
            {order.status === "aguardando" && (
              <Button
                onClick={() => onStart(order)}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                <Play className="w-4 h-4 mr-2" />
                Iniciar Serviço
              </Button>
            )}

            {order.status === "em_andamento" && (
              <Button
                onClick={() => onFinish(order)}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                <StopCircle className="w-4 h-4 mr-2" />
                Finalizar Serviço
              </Button>
            )}

            <Button
              onClick={handleGeneratePDF}
              variant="outline"
              className="hover:bg-blue-50"
              size="icon"
            >
              <Download className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
