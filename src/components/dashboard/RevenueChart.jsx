
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { TrendingUp } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, eachMonthOfInterval, startOfYear } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function RevenueChart({ quotes, quoteItems, period, loading }) {
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const getChartData = () => {
    const now = new Date();
    let intervals = [];
    let formatString = "";

    if (period === "day") {
      // Last 7 days
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        days.push(date);
      }
      intervals = days;
      formatString = "dd/MM";
    } else if (period === "month") {
      intervals = eachDayOfInterval({
        start: startOfMonth(now),
        end: endOfMonth(now)
      });
      formatString = "dd";
    } else { // period === "year"
      intervals = eachMonthOfInterval({
        start: startOfYear(now),
        end: now
      });
      formatString = "MMM";
    }

    return intervals.map(date => {
      const dayQuotes = quotes.filter(q => {
        const qDate = new Date(q.created_date);
        if (period === "year") {
          return qDate.getMonth() === date.getMonth() && 
                 qDate.getFullYear() === date.getFullYear();
        } else {
          return format(qDate, "yyyy-MM-dd") === format(date, "yyyy-MM-dd");
        }
      }).filter(q => q.status === "concluida");

      const revenue = dayQuotes.reduce((sum, q) => sum + (q.total || 0), 0);
      
      const costs = dayQuotes.reduce((sum, quote) => {
        const items = quoteItems.filter(item => item.quote_id === quote.id);
        return sum + items.reduce((itemSum, item) => 
          itemSum + ((item.cost_price || 0) * (item.quantity || 1)), 0
        );
      }, 0);

      return {
        date: format(date, formatString, { locale: ptBR }),
        faturamento: revenue,
        gastos: costs,
        lucro: revenue - costs
      };
    });
  };

  const data = getChartData();

  if (loading) {
    return (
      <Card className="shadow-lg border-0">
        <CardHeader className="border-b bg-gradient-to-r from-blue-50 to-blue-100/50">
          <CardTitle>Carregando...</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="h-80 flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-lg border-0">
      <CardHeader className="border-b bg-gradient-to-r from-blue-50 to-blue-100/50">
        <CardTitle className="flex items-center gap-2 text-gray-900">
          <TrendingUp className="w-5 h-5 text-blue-600" />
          Análise Financeira
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis 
              dataKey="date" 
              stroke="#6b7280"
              style={{ fontSize: '12px' }}
            />
            <YAxis 
              stroke="#6b7280"
              style={{ fontSize: '12px' }}
              tickFormatter={(value) => formatCurrency(value)}
            />
            <Tooltip 
              formatter={(value) => formatCurrency(value)}
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
              }}
            />
            <Legend />
            <Bar dataKey="faturamento" fill="#10b981" name="Faturamento" radius={[8, 8, 0, 0]} />
            <Bar dataKey="gastos" fill="#ef4444" name="Gastos" radius={[8, 8, 0, 0]} />
            <Bar dataKey="lucro" fill="#3b82f6" name="Lucro" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
