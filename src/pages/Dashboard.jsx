
import React, { useState, useEffect } from "react";
import { Quote, QuoteItem, Customer, Vehicle, ServiceItem } from "@/api/entities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  FileText,
  Calendar,
  Clock,
  Percent,
  Package,
  ShoppingCart
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

import StatsCard from "../components/dashboard/StatsCard";
import RevenueChart from "../components/dashboard/RevenueChart";
import RecentQuotes from "../components/dashboard/RecentQuotes";

export default function Dashboard() {
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState([]);
  const [quoteItems, setQuoteItems] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [serviceItems, setServiceItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("month");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [quotesData, itemsData, customersData, vehiclesData, serviceItemsData] = await Promise.all([
        Quote.list("-created_date"),
        QuoteItem.list("-created_date"),
        Customer.list("-created_date"),
        Vehicle.list("-created_date"),
        ServiceItem.list("-created_date")
      ]);
      setQuotes(quotesData);
      setQuoteItems(itemsData);
      setCustomers(customersData);
      setVehicles(vehiclesData);
      setServiceItems(serviceItemsData);
    } catch (e) {
      console.error("Failed to load dashboard:", e);
    } finally {
      setLoading(false);
    }
  };

  // Função para formatar valores em Real Brasileiro
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const getDateRange = () => {
    const now = new Date();
    switch (period) {
      case "day":
        return { start: startOfDay(now), end: endOfDay(now) };
      case "month":
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case "year":
        return { start: startOfYear(now), end: endOfYear(now) };
      default:
        return { start: startOfMonth(now), end: endOfMonth(now) };
    }
  };

  const filterByPeriod = (items) => {
    const { start, end } = getDateRange();
    return items.filter(item => {
      const itemDate = new Date(item.created_date);
      return itemDate >= start && itemDate <= end;
    });
  };

  const calculateStats = () => {
    const periodQuotes = filterByPeriod(quotes);
    const completedQuotes = periodQuotes.filter(q => q.status === "concluida");

    // Faturamento = soma do que foi efetivamente pago
    const revenue = completedQuotes.reduce((sum, q) => sum + (q.amount_paid || 0), 0);

    // Custos proporcionais ao que foi pago
    const costs = completedQuotes.reduce((sum, quote) => {
      const items = quoteItems.filter(item => item.quote_id === quote.id);
      const totalCostOfQuoteItems = items.reduce((itemSum, item) =>
        itemSum + ((item.cost_price || 0) * (item.quantity || 1)), 0
      );
      const paymentRatio = (quote.total > 0 && (quote.amount_paid || 0) > 0) ? (quote.amount_paid || 0) / quote.total : 0;
      return sum + (totalCostOfQuoteItems * paymentRatio);
    }, 0);

    const profit = revenue - costs;
    const profitMargin = revenue > 0 ? ((profit / revenue) * 100) : 0;

    // A Receber = soma de todos os valores pendentes das cotações concluídas
    const pendingPayment = completedQuotes.reduce((sum, q) =>
      sum + (q.amount_pending || 0), 0
    );

    const pendingQuotesCount = completedQuotes.filter(q => (q.amount_pending || 0) > 0).length;

    return {
      revenue,
      costs,
      profit,
      profitMargin,
      pendingPayment,
      quotesCount: periodQuotes.length,
      completedCount: completedQuotes.length,
      pendingQuotesCount: pendingQuotesCount
    };
  };

  const calculateStockValue = () => {
    const stockItems = serviceItems.filter(item =>
      (item.type === "peca" || item.type === "produto") && item.is_active !== false
    );

    const totalCostValue = stockItems.reduce((sum, item) => {
      const stock = item.current_stock || 0;
      const cost = item.cost_price || 0;
      return sum + (stock * cost);
    }, 0);

    const totalSaleValue = stockItems.reduce((sum, item) => {
      const stock = item.current_stock || 0;
      const price = item.sale_price || 0;
      return sum + (stock * price);
    }, 0);

    const potentialProfit = totalSaleValue - totalCostValue;
    const profitMargin = totalCostValue > 0 ? ((potentialProfit / totalCostValue) * 100) : 0;

    return {
      totalCostValue,
      totalSaleValue,
      potentialProfit,
      profitMargin,
      itemCount: stockItems.length,
      totalUnits: stockItems.reduce((sum, item) => sum + (item.current_stock || 0), 0)
    };
  };

  const stats = calculateStats();
  const stockStats = calculateStockValue();

  const getPeriodLabel = () => {
    switch (period) {
      case "day": return "Hoje";
      case "month": return "Este Mês";
      case "year": return "Este Ano";
      default: return "Este Mês";
    }
  };

  return (
    <div className="p-4 md:p-8 bg-gradient-to-br from-gray-50 to-gray-100 min-h-screen">
      <div className="max-w-[1600px] mx-auto space-y-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-gray-500 mt-1">Visão geral do seu negócio</p>
          </div>
          <Tabs value={period} onValueChange={setPeriod} className="w-full md:w-auto">
            <TabsList className="grid w-full md:w-auto grid-cols-3 bg-white shadow-sm">
              <TabsTrigger value="day" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                Hoje
              </TabsTrigger>
              <TabsTrigger value="month" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                Mês
              </TabsTrigger>
              <TabsTrigger value="year" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                Ano
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div>
          <h2 className="text-lg md:text-xl font-bold text-gray-700 mb-4 flex items-center gap-2">
            <span>📊</span>
            <span>Financeiro - {getPeriodLabel()}</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6">
            <StatsCard
              title="FATURAMENTO"
              value={formatCurrency(stats.revenue)}
              subtitle="Valor efetivamente pago"
              icon={DollarSign}
              iconColor="text-green-600"
              bgColor="bg-green-50"
              loading={loading}
            />
            <StatsCard
              title="LUCRO"
              value={formatCurrency(stats.profit)}
              subtitle={`${stats.profitMargin.toFixed(1)}% margem`}
              icon={TrendingUp}
              iconColor="text-blue-600"
              bgColor="bg-blue-50"
              loading={loading}
            />
            <StatsCard
              title="GASTOS"
              value={formatCurrency(stats.costs)}
              subtitle={getPeriodLabel()}
              icon={TrendingDown}
              iconColor="text-red-600"
              bgColor="bg-red-50"
              loading={loading}
            />
            <div onClick={() => navigate(createPageUrl("PendingPayments"))} className="cursor-pointer">
              <StatsCard
                title="A RECEBER"
                value={formatCurrency(stats.pendingPayment)}
                subtitle={`${stats.pendingQuotesCount} cotação(ões) pendente(s)`}
                icon={Clock}
                iconColor="text-orange-600"
                bgColor="bg-orange-50"
                loading={loading}
              />
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-lg md:text-xl font-bold text-gray-700 mb-4 flex items-center gap-2">
            <span>📦</span>
            <span>Estoque Atual</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6">
            <StatsCard
              title="VALOR EM ESTOQUE"
              value={formatCurrency(stockStats.totalCostValue)}
              subtitle={`${stockStats.itemCount} itens cadastrados`}
              icon={Package}
              iconColor="text-purple-600"
              bgColor="bg-purple-50"
              loading={loading}
            />
            <StatsCard
              title="VALOR POTENCIAL DE VENDAS"
              value={formatCurrency(stockStats.totalSaleValue)}
              subtitle={`${stockStats.totalUnits} unidades em estoque`}
              icon={ShoppingCart}
              iconColor="text-indigo-600"
              bgColor="bg-indigo-50"
              loading={loading}
            />
            <StatsCard
              title="LUCRO POTENCIAL"
              value={formatCurrency(stockStats.potentialProfit)}
              subtitle={`${stockStats.profitMargin.toFixed(1)}% margem`}
              icon={TrendingUp}
              iconColor="text-emerald-600"
              bgColor="bg-emerald-50"
              loading={loading}
            />
            <StatsCard
              title="ITENS ATIVOS"
              value={stockStats.itemCount.toString()}
              subtitle={`${stockStats.totalUnits} unidades totais`}
              icon={FileText}
              iconColor="text-cyan-600"
              bgColor="bg-cyan-50"
              loading={loading}
            />
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <RevenueChart
              quotes={quotes}
              quoteItems={quoteItems}
              period={period}
              loading={loading}
            />
          </div>
          <Card className="shadow-lg border-0">
            <CardHeader className="border-b bg-gradient-to-r from-blue-50 to-blue-100/50">
              <CardTitle className="flex items-center gap-2 text-gray-900">
                <FileText className="w-5 h-5 text-blue-600" />
                Resumo de Cotações
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="flex justify-between items-center p-4 bg-yellow-50 rounded-xl border border-yellow-200">
                  <span className="font-medium text-gray-700">Em Análise</span>
                  <span className="text-2xl font-bold text-yellow-700">
                    {filterByPeriod(quotes).filter(q => q.status === "em_analise").length}
                  </span>
                </div>
                <div className="flex justify-between items-center p-4 bg-green-50 rounded-xl border border-green-200">
                  <span className="font-medium text-gray-700">Aprovadas</span>
                  <span className="text-2xl font-bold text-green-700">
                    {filterByPeriod(quotes).filter(q => q.status === "aprovada").length}
                  </span>
                </div>
                <div className="flex justify-between items-center p-4 bg-blue-50 rounded-xl border border-blue-200">
                  <span className="font-medium text-gray-700">Concluídas</span>
                  <span className="text-2xl font-bold text-blue-700">
                    {filterByPeriod(quotes).filter(q => q.status === "concluida").length}
                  </span>
                </div>
                <div className="flex justify-between items-center p-4 bg-red-50 rounded-xl border border-red-200">
                  <span className="font-medium text-gray-700">Recusadas</span>
                  <span className="text-2xl font-bold text-red-700">
                    {filterByPeriod(quotes).filter(q => q.status === "recusada").length}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <RecentQuotes
          quotes={quotes}
          customers={customers}
          vehicles={vehicles}
          loading={loading}
        />
      </div>
    </div>
  );
}
