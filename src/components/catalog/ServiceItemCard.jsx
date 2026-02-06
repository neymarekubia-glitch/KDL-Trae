import React from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wrench, Package, DollarSign, TrendingUp, Edit, Trash2, AlertTriangle, User } from "lucide-react";

export default function ServiceItemCard({ item, supplier, onEdit, onDelete, onToggleActive }) {
  const isService = item.type === "servico";
  const isPieceOrProduct = item.type === "peca" || item.type === "produto";
  const Icon = isService ? Wrench : Package;
  const color = isService ? "blue" : item.type === "peca" ? "purple" : "green";
  
  const profit = item.sale_price - item.cost_price;
  const profitMargin = item.sale_price > 0 ? ((profit / item.sale_price) * 100) : 0;

  const isLowStock = isPieceOrProduct && item.minimum_stock > 0 && item.current_stock <= item.minimum_stock;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
    >
      <Card className={`shadow-lg border-0 hover:shadow-xl transition-all duration-300 overflow-hidden ${isLowStock ? 'border-2 border-red-500' : ''}`}>
        <div className={`h-2 bg-gradient-to-r ${isLowStock ? 'from-red-600 to-red-700' : `from-${color}-600 to-${color}-700`}`} />
        <CardHeader className={`p-6 bg-gradient-to-br ${isLowStock ? 'from-red-50/50' : `from-${color}-50/50`} to-transparent`}>
          <div className="flex justify-between items-start">
            <div className="flex items-start gap-3">
              <div className={`w-12 h-12 bg-gradient-to-br ${isLowStock ? 'from-red-600 to-red-700' : `from-${color}-600 to-${color}-700`} rounded-xl flex items-center justify-center shadow-md`}>
                <Icon className="w-6 h-6 text-white" />
              </div>
              <div>
                <Badge className={`mb-2 ${isLowStock ? 'bg-red-100 text-red-800' : `bg-${color}-100 text-${color}-800`}`}>
                  {isService ? "Serviço" : item.type === "peca" ? "Peça" : "Produto"}
                </Badge>
                <h3 className="font-bold text-lg text-gray-900">{item.name}</h3>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onEdit(item)}
                className={`hover:bg-${color}-100 hover:text-${color}-700`}
              >
                <Edit className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onDelete(item.id)}
                className="hover:bg-red-100 hover:text-red-700"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-3">
          {isLowStock && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
              <div className="flex items-center gap-2 text-red-800">
                <AlertTriangle className="w-5 h-5 animate-pulse" />
                <span className="font-bold">Estoque Baixo!</span>
              </div>
              <p className="text-sm text-red-700 mt-1">
                Estoque atual: <strong>{item.current_stock}</strong> / Mínimo: {item.minimum_stock}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 pb-3 border-b">
            <div>
              <p className="text-xs text-gray-500 mb-1">Preço de Venda</p>
              <p className="text-lg font-bold text-green-700">R$ {item.sale_price?.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Custo</p>
              <p className="text-lg font-bold text-red-700">R$ {item.cost_price?.toFixed(2)}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-gray-600">
            <TrendingUp className={`w-4 h-4 text-${color}-600`} />
            <span className="text-sm">
              Lucro: <span className="font-semibold text-green-700">R$ {profit.toFixed(2)}</span>
              <span className="text-gray-500 ml-1">({profitMargin.toFixed(1)}%)</span>
            </span>
          </div>

          {isPieceOrProduct && (
            <>
              <div className="flex items-center gap-2 text-gray-600">
                <Package className={`w-4 h-4 text-${color}-600`} />
                <span className="text-sm">
                  Estoque: <span className={`font-semibold ${isLowStock ? 'text-red-700' : 'text-gray-700'}`}>{item.current_stock || 0}</span> unidades
                </span>
              </div>
              {supplier && (
                <div className="flex items-center gap-2 text-gray-600">
                  <User className={`w-4 h-4 text-${color}-600`} />
                  <span className="text-sm">Fornecedor: {supplier.name}</span>
                </div>
              )}
            </>
          )}

          {isService && item.labor_cost > 0 && (
            <div className="flex items-center gap-2 text-gray-600">
              <Wrench className={`w-4 h-4 text-${color}-600`} />
              <span className="text-sm">Mão de obra: R$ {item.labor_cost.toFixed(2)}</span>
            </div>
          )}

          {item.description && (
            <div className="pt-2 border-t">
              <p className="text-sm text-gray-500 italic">{item.description}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}