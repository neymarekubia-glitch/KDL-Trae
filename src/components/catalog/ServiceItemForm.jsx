import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Save } from "lucide-react";
import { Supplier } from "@/api/entities";

export default function ServiceItemForm({ item, onSubmit, onCancel }) {
  const [suppliers, setSuppliers] = useState([]);
  const [formData, setFormData] = useState(item || {
    name: "",
    type: "servico",
    sale_price: 0,
    cost_price: 0,
    supplier_id: "",
    current_stock: 0,
    minimum_stock: 0,
    labor_cost: 0,
    description: "",
    is_active: true
  });

  useEffect(() => {
    loadSuppliers();
  }, []);

  const loadSuppliers = async () => {
    const data = await Supplier.list("-created_date");
    setSuppliers(data);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const sanitizeNumber = (value, fallback = 0) => {
      if (value === '' || value === null || value === undefined) return fallback;
      const num = Number(value);
      return Number.isFinite(num) ? num : fallback;
    };

    const payload = {
      ...formData,
      sale_price: sanitizeNumber(formData.sale_price, 0),
      cost_price: sanitizeNumber(formData.cost_price, 0),
      labor_cost: sanitizeNumber(formData.labor_cost, 0),
      current_stock: Math.max(0, parseInt(formData.current_stock ?? 0, 10) || 0),
      minimum_stock: Math.max(0, parseInt(formData.minimum_stock ?? 0, 10) || 0),
      supplier_id: formData.supplier_id ? formData.supplier_id : null,
    };

    onSubmit(payload);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
    >
      <Card className="shadow-xl border-0">
        <CardHeader className="border-b bg-gradient-to-r from-blue-50 to-blue-100/50">
          <div className="flex justify-between items-center">
            <CardTitle className="text-xl font-bold text-gray-900">
              {item ? "Editar Item" : "Novo Item"}
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={onCancel}>
              <X className="w-5 h-5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="name">Nome *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  placeholder="Ex: Troca de óleo, Filtro de ar..."
                  required
                  className="border-gray-300"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">Tipo *</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) => setFormData({...formData, type: value})}
                  required
                >
                  <SelectTrigger className="border-gray-300">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="servico">Serviço</SelectItem>
                    <SelectItem value="peca">Peça</SelectItem>
                    <SelectItem value="produto">Produto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="sale_price">Preço de Venda (R$) *</Label>
                <Input
                  id="sale_price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.sale_price === '' ? '' : formData.sale_price}
                  onChange={(e) => {
                    const value = e.target.value;
                    setFormData({ ...formData, sale_price: value === '' ? '' : parseFloat(value) });
                  }}
                  required
                  className="border-gray-300"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cost_price">Preço de Custo (R$) *</Label>
                <Input
                  id="cost_price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.cost_price === '' ? '' : formData.cost_price}
                  onChange={(e) => {
                    const value = e.target.value;
                    setFormData({ ...formData, cost_price: value === '' ? '' : parseFloat(value) });
                  }}
                  required
                  className="border-gray-300"
                />
              </div>
            </div>

            {(formData.type === "peca" || formData.type === "produto") && (
              <>
                <div className="grid md:grid-cols-3 gap-6 p-4 bg-orange-50 rounded-lg border border-orange-200">
                  <div className="space-y-2">
                    <Label htmlFor="supplier_id">Fornecedor</Label>
                    <Select
                      value={formData.supplier_id}
                      onValueChange={(value) => setFormData({...formData, supplier_id: value})}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {suppliers.map((supplier) => (
                          <SelectItem key={supplier.id} value={supplier.id}>
                            {supplier.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="current_stock">Estoque Atual</Label>
                    <Input
                      id="current_stock"
                      type="number"
                      min="0"
                      value={formData.current_stock === '' ? '' : formData.current_stock}
                      onChange={(e) => {
                        const value = e.target.value;
                        setFormData({ ...formData, current_stock: value === '' ? '' : parseInt(value, 10) });
                      }}
                      className="border-gray-300"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="minimum_stock">Estoque Mínimo ⚠️</Label>
                    <Input
                      id="minimum_stock"
                      type="number"
                      min="0"
                      value={formData.minimum_stock === '' ? '' : formData.minimum_stock}
                      onChange={(e) => {
                        const value = e.target.value;
                        setFormData({ ...formData, minimum_stock: value === '' ? '' : parseInt(value, 10) });
                      }}
                      className="border-gray-300"
                      placeholder="Alerta quando atingir"
                    />
                  </div>
                </div>
                <p className="text-sm text-orange-700 flex items-center gap-2">
                  ⚠️ O sistema vai alertar automaticamente quando o estoque atingir o mínimo
                </p>
              </>
            )}

            {formData.type === "servico" && (
              <div className="space-y-2 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <Label htmlFor="labor_cost">Custo de Mão de Obra (R$)</Label>
                <Input
                  id="labor_cost"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.labor_cost === '' ? '' : formData.labor_cost}
                  onChange={(e) => {
                    const value = e.target.value;
                    setFormData({ ...formData, labor_cost: value === '' ? '' : parseFloat(value) });
                  }}
                  className="border-gray-300"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                rows={2}
                className="border-gray-300"
                placeholder="Detalhes sobre o serviço ou peça..."
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800">
                <Save className="w-4 h-4 mr-2" />
                {item ? "Atualizar" : "Salvar"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  );
}