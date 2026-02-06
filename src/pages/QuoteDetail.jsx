
import React, { useState, useEffect } from "react";
import { Quote, QuoteItem, Customer, Vehicle, MaintenanceReminder, Tenant } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft,
  Edit,
  Save,
  X,
  User,
  Car,
  Calendar,
  DollarSign,
  FileText,
  Plus,
  Trash2,
  Shield,
  Download
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { format, addMonths } from "date-fns";
import { ptBR } from "date-fns/locale";

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

export default function QuoteDetail() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const quoteId = urlParams.get('id');

  const [quote, setQuote] = useState(null);
  const [items, setItems] = useState([]);
  const [customer, setCustomer] = useState(null);
  const [vehicle, setVehicle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [editedQuote, setEditedQuote] = useState(null);
  const [editedItems, setEditedItems] = useState([]);

  useEffect(() => {
    if (quoteId) {
      const loadData = async () => {
        setLoading(true);
        try {
          const quoteData = await Quote.filter({ id: quoteId });
          if (quoteData.length > 0) {
            const q = quoteData[0];
            setQuote(q);
            setEditedQuote(q);

            const [itemsData, customerData, vehicleData] = await Promise.all([
              QuoteItem.filter({ quote_id: q.id }),
              Customer.filter({ id: q.customer_id }),
              Vehicle.filter({ id: q.vehicle_id })
            ]);

            setItems(itemsData);
            setEditedItems(itemsData);
            setCustomer(customerData[0]);
            setVehicle(vehicleData[0]);
          }
        } catch (e) {
          console.error("Failed to load quote detail:", e);
        } finally {
          setLoading(false);
        }
      };

      loadData();
    }
  }, [quoteId]);

  const handleSave = async () => {
    const subtotal = editedItems.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
    const discountValue = editedQuote.discount_percent > 0
      ? (subtotal * editedQuote.discount_percent / 100)
      : editedQuote.discount_amount;
    const total = subtotal - discountValue;

    // Check if status is changing to 'concluida'
    const isStatusChangingToCompleted = editedQuote.status === "concluida" && quote.status !== "concluida";

    await Quote.update(quoteId, {
      ...editedQuote,
      subtotal,
      total,
      // Persist the effective discount into the correct column
      discount_amount: discountValue,
      amount_pending: total - (editedQuote.amount_paid || 0)
    });

    for (const item of editedItems) {
      if (item.id) {
        await QuoteItem.update(item.id, {
          ...item,
          total: item.unit_price * item.quantity
        });
      } else {
        await QuoteItem.create({
          ...item,
          quote_id: quoteId,
          total: item.unit_price * item.quantity
        });
      }
    }

    // Create maintenance reminder if status changed to completed
    if (isStatusChangingToCompleted && customer && vehicle) {
      const reminderDate = addMonths(new Date(editedQuote.service_date), 6);
      await MaintenanceReminder.create({
        customer_id: customer.id,
        vehicle_id: vehicle.id,
        quote_id: quoteId,
        service_name: `Revisão periódica - Cotação #${quote.quote_number}`,
        reminder_type: 'tempo',
        target_date: reminderDate.toISOString().split('T')[0],
        status: 'pendente'
      });
    }

    setEditMode(false);

    // Reload data after save
    const quoteData = await Quote.filter({ id: quoteId });
    if (quoteData.length > 0) {
      const q = quoteData[0];
      setQuote(q);
      setEditedQuote(q);

      const [itemsData, customerData, vehicleData] = await Promise.all([
        QuoteItem.filter({ quote_id: q.id }),
        Customer.filter({ id: q.customer_id }),
        Vehicle.filter({ id: q.vehicle_id })
      ]);

      setItems(itemsData);
      setEditedItems(itemsData);
      setCustomer(customerData[0]);
      setVehicle(vehicleData[0]);
    }
  };

  const handleAddPayment = async (amount) => {
    const newAmountPaid = (quote.amount_paid || 0) + amount;
    const newAmountPending = quote.total - newAmountPaid;

    let paymentStatus = "pendente";
    if (newAmountPending <= 0) {
      paymentStatus = "pago";
    } else if (newAmountPaid > 0) {
      paymentStatus = "parcialmente_pago";
    }

    await Quote.update(quoteId, {
      amount_paid: newAmountPaid,
      amount_pending: Math.max(0, newAmountPending),
      payment_status: paymentStatus
    });

    // Reload data after payment
    const quoteData = await Quote.filter({ id: quoteId });
    if (quoteData.length > 0) {
      const q = quoteData[0];
      setQuote(q);
      setEditedQuote(q);
    }
  };

  const addNewItem = () => {
    setEditedItems([...editedItems, {
      service_item_name: "",
      service_item_type: "servico",
      quantity: 1,
      unit_price: 0,
      cost_price: 0,
      warranty_days: 0
    }]);
  };

  const removeItem = (index) => {
    setEditedItems(editedItems.filter((_, i) => i !== index));
  };

  const updateItem = (index, field, value) => {
    const newItems = [...editedItems];
    newItems[index][field] = value;
    setEditedItems(newItems);
  };

  const handleGeneratePDF = async () => {
    if (!quote || !customer || !vehicle) return;

    const pdfWindow = window.open('', '_blank');
    
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
    
    const renderPaymentSection = () => {
      const hasPendingPayment = quote.status === "concluida" && (quote.amount_pending > 0 || quote.amount_paid > 0);
      
      if (!hasPendingPayment) return '';
      
      return `
        <div class="payment-section">
          <h3 class="payment-title">💳 DETALHES DO PAGAMENTO</h3>
          <div class="payment-details">
            <div class="payment-row">
              <span>Valor Total:</span>
              <span class="payment-value-dark">R$ ${(quote.total || 0).toFixed(2)}</span>
            </div>
            <div class="payment-row paid">
              <span>Valor Pago:</span>
              <span class="payment-value-dark">R$ ${(quote.amount_paid || 0).toFixed(2)}</span>
            </div>
            <div class="payment-row pending">
              <span>Valor Restante:</span>
              <span class="payment-value-dark">R$ ${(quote.amount_pending || 0).toFixed(2)}</span>
            </div>
          </div>
        </div>
      `;
    };
    
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
            color: #000000;
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
            border-left: 2px solid #000000;
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
            border-left: 3px solid #000000;
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
            color: white;
            font-size: 16px;
          }
          
          .payment-section {
            background: #f0f9ff;
            border: 2px solid #000000;
            border-radius: 4px;
            padding: 6px;
            margin: 3px 0;
          }
          
          .payment-title {
            background: #000000;
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
            color: #1e293b;
          }
          
          .payment-row.paid {
            background: #dcfce7;
            color: #166534;
            border-left: 3px solid #166534;
          }
          
          .payment-row.pending {
            background: #fff7ed;
            color: #9a3412;
            border-left: 3px solid #9a3412;
          }
          
          .payment-value-dark {
            font-size: 12px;
            font-weight: 700;
            color: #1e293b;
          }
          
          .legal-notice {
            background: #fffbeb;
            border-left: 3px solid #000000;
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
            border-bottom: 1px solid #000000;
          }
          
          .car-diagram {
            width: 100%;
            height: 25px;
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
            margin-bottom: 3px;
          }
          
          .signature-line {
            border-top: 2px solid #000000;
            margin: 20px 8px 3px 8px;
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
        <button class="print-button" onclick="window.print()">🖨️ Imprimir Orçamento</button>
        
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
                    <div class="info-value" style="font-size: 11px; font-weight: 700; color: #1e293b;">${vehicle.license_plate}</div>
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
              var maxHeightPx = 297 * pxPerMm; // A4 height in pixels
              // Use scrollHeight to account for overflowing content
              var contentHeightPx = page.scrollHeight;
              if (contentHeightPx > maxHeightPx) {
                var scale = maxHeightPx / contentHeightPx;
                page.style.transform = 'scale(' + scale + ')';
                page.style.transformOrigin = 'top left';
                // Constrain body to a single page to avoid an extra blank page
                document.body.style.height = maxHeightPx + 'px';
                document.body.style.overflow = 'hidden';
              }
            }

            window.addEventListener('load', function(){
              waitForImages(12000).then(function(){
                // Give layout a moment to settle, then fit and print
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

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500">Cotação não encontrada</p>
      </div>
    );
  }

  const calculateSubtotal = () => {
    return editedItems.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
  };

  const calculateTotal = () => {
    const subtotal = calculateSubtotal();
    const discountValue = editedQuote.discount_percent > 0
      ? (subtotal * editedQuote.discount_percent / 100)
      : editedQuote.discount_amount;
    return subtotal - discountValue;
  };

  return (
    <div className="p-4 md:p-8 bg-gradient-to-br from-gray-50 to-gray-100 min-h-screen">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" onClick={() => navigate(createPageUrl("Quotes"))}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Detalhes da Cotação</h1>
              <p className="text-gray-500 mt-1 font-mono">{quote.quote_number}</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Button
              onClick={handleGeneratePDF}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Download className="w-4 h-4 mr-2" />
              Gerar PDF
            </Button>
            {editMode ? (
              <>
                <Button variant="outline" onClick={() => {
                  setEditMode(false);
                  setEditedQuote(quote);
                  setEditedItems(items);
                }}>
                  <X className="w-4 h-4 mr-2" />
                  Cancelar
                </Button>
                <Button onClick={handleSave} className="bg-green-600 hover:bg-green-700">
                  <Save className="w-4 h-4 mr-2" />
                  Salvar
                </Button>
              </>
            ) : (
              <Button onClick={() => setEditMode(true)} className="bg-orange-600 hover:bg-orange-700">
                <Edit className="w-4 h-4 mr-2" />
                Editar
              </Button>
            )}
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <Card className="shadow-lg border-0">
            <CardHeader className="border-b bg-gradient-to-r from-blue-50 to-blue-100/50">
              <CardTitle className="flex items-center gap-2 text-lg">
                <User className="w-5 h-5 text-blue-600" />
                Cliente
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
                  <p>{customer?.email}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-lg border-0">
            <CardHeader className="border-b bg-gradient-to-r from-orange-50 to-orange-100/50">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Car className="w-5 h-5 text-orange-600" />
                Veículo
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-3">
              <div>
                <p className="text-sm text-gray-500">Modelo</p>
                <p className="font-semibold">{vehicle?.brand} {vehicle?.model}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Placa</p>
                <p className="font-mono">{vehicle?.license_plate}</p>
              </div>
              {editMode ? (
                <div className="space-y-2">
                  <Label>KM Atual</Label>
                  <Input
                    type="number"
                    value={editedQuote.vehicle_mileage || ''}
                    onChange={(e) => setEditedQuote({ ...editedQuote, vehicle_mileage: parseInt(e.target.value) || 0 })}
                  />
                </div>
              ) : (
                <div>
                  <p className="text-sm text-gray-500">KM Atual</p>
                  <p>{quote.vehicle_mileage?.toLocaleString()} km</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-lg border-0">
            <CardHeader className="border-b bg-gradient-to-r from-green-50 to-green-100/50">
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="w-5 h-5 text-green-600" />
                Status
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-3">
              {editMode ? (
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={editedQuote.status}
                    onValueChange={(value) => setEditedQuote({...editedQuote, status: value})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="em_analise">Em Análise</SelectItem>
                      <SelectItem value="aprovada">Aprovada</SelectItem>
                      <SelectItem value="recusada">Recusada</SelectItem>
                      <SelectItem value="concluida">Concluída</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <Badge className={`${statusColors[quote.status]} border text-base px-4 py-2`}>
                  {statusLabels[quote.status]}
                </Badge>
              )}
              <div>
                <p className="text-sm text-gray-500">Data do Serviço</p>
                <p className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  {format(new Date(quote.service_date), "dd/MM/yyyy", { locale: ptBR })}
                </p>
              </div>
              {quote.completion_date && (
                <div>
                  <p className="text-sm text-gray-500">Data de Conclusão</p>
                  <p>{format(new Date(quote.completion_date), "dd/MM/yyyy", { locale: ptBR })}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="shadow-lg border-0">
          <CardHeader className="border-b bg-gradient-to-r from-blue-50 to-blue-100/50">
            <div className="flex justify-between items-center">
              <CardTitle>Itens da Cotação</CardTitle>
              {editMode && (
                <Button onClick={addNewItem} size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  Adicionar Item
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-4">
              {(editMode ? editedItems : items).map((item, index) => (
                <Card key={index} className="border-2">
                  <CardContent className="p-4">
                    {editMode ? (
                      <div>
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
                          <div className="space-y-2">
                            <Label>Nome</Label>
                            <Input
                              value={item.service_item_name}
                              onChange={(e) => updateItem(index, "service_item_name", e.target.value)}
                              required
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Tipo</Label>
                            <Select
                              value={item.service_item_type}
                              onValueChange={(value) => updateItem(index, "service_item_type", value)}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="servico">Serviço</SelectItem>
                                <SelectItem value="peca">Peça</SelectItem>
                                <SelectItem value="produto">Produto</SelectItem>
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
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Preço Unitário</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={item.unit_price}
                              onChange={(e) => updateItem(index, "unit_price", parseFloat(e.target.value))}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Garantia (dias)</Label>
                            <Input
                              type="number"
                              min="0"
                              value={item.warranty_days || 0}
                              onChange={(e) => updateItem(index, "warranty_days", parseInt(e.target.value))}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Total</Label>
                            <Input
                              value={`R$ ${(item.unit_price * item.quantity).toFixed(2)}`}
                              disabled
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="grid md:grid-cols-4 gap-4">
                        <div className="md:col-span-2">
                          <p className="text-sm text-gray-500">Item</p>
                          <p className="font-semibold">{item.service_item_name}</p>
                          <Badge className="mt-1">{item.service_item_type === "servico" ? "Serviço" : item.service_item_type === "peca" ? "Peça" : "Produto"}</Badge>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Quantidade</p>
                          <p className="font-semibold">{item.quantity}x R$ {item.unit_price?.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Total</p>
                          <p className="font-bold text-green-700">R$ ${(item.total || 0).toFixed(2)}</p>
                        </div>
                        {item.warranty_days > 0 && (
                          <div className="md:col-span-4 flex items-center gap-2 text-sm text-gray-600 bg-green-50 p-2 rounded">
                            <Shield className="w-4 h-4 text-green-600" />
                            <span>Garantia: {item.warranty_days} dias</span>
                            {item.warranty_expiry_date && (
                              <span>- Válida até {format(new Date(item.warranty_expiry_date), "dd/MM/yyyy")}</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-lg border-0">
          <CardHeader className="border-b bg-gradient-to-r from-green-50 to-green-100/50">
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-600" />
              Valores e Pagamento
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            {editMode && (
              <div className="grid md:grid-cols-2 gap-4 pb-4 border-b">
                <div className="space-y-2">
                  <Label>Desconto (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editedQuote.discount_percent || ''}
                    onChange={(e) => setEditedQuote({
                      ...editedQuote,
                      discount_percent: parseFloat(e.target.value) || 0,
                      discount_amount: 0
                    })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Desconto (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editedQuote.discount_amount || ''}
                    onChange={(e) => setEditedQuote({
                      ...editedQuote,
                      discount_amount: parseFloat(e.target.value) || 0,
                      discount_percent: 0
                    })}
                  />
                </div>
              </div>
            )}

            <div className="space-y-3">
              <div className="flex justify-between text-lg">
                <span className="text-gray-600">Subtotal:</span>
                <span className="font-semibold">
                  R$ ${(editMode ? calculateSubtotal() : quote.subtotal || 0).toFixed(2)}
                </span>
              </div>
              {(quote.discount_percent > 0 || quote.discount_amount > 0) && (
                <div className="flex justify-between text-red-600">
                  <span>Desconto:</span>
                  <span>
                    - R$ ${(
                      quote.discount_percent > 0
                        ? (quote.subtotal * quote.discount_percent / 100)
                        : quote.discount_amount
                    ).toFixed(2)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-2xl font-bold border-t pt-3">
                <span>Total:</span>
                <span className="text-green-700">
                  R$ ${(editMode ? calculateTotal() : quote.total || 0).toFixed(2)}
                </span>
              </div>

              {quote.status === "concluida" && (
                <>
                  <div className="flex justify-between text-lg pt-3 border-t">
                    <span className="text-gray-600">Valor Pago:</span>
                    <span className="font-semibold text-green-700">
                      R$ ${(quote.amount_paid || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-lg">
                    <span className="text-gray-600">Valor Pendente:</span>
                    <span className="font-semibold text-orange-700">
                      R$ ${(quote.amount_pending || 0).toFixed(2)}
                    </span>
                  </div>

                  {quote.amount_pending > 0 && !editMode && (
                    <div className="pt-4 border-t">
                      <Label className="mb-2 block">Registrar Pagamento</Label>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="Valor pago"
                          id="payment-amount"
                        />
                        <Button
                          onClick={() => {
                            const input = document.getElementById('payment-amount');
                            const amount = parseFloat(input.value);
                            if (amount > 0) {
                              handleAddPayment(amount);
                              input.value = '';
                            }
                          }}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Adicionar
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {quote.notes && (
          <Card className="shadow-lg border-0">
            <CardHeader className="border-b bg-gradient-to-r from-gray-50 to-gray-100/50">
              <CardTitle className="text-lg">Observações</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <p className="text-gray-700">{quote.notes}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
