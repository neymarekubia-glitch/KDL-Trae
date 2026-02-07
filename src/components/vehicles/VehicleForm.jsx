import React, { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Save } from "lucide-react";

export default function VehicleForm({ vehicle, customers, hideCustomerSelect, onSubmit, onCancel }) {
  const [formData, setFormData] = useState(vehicle || {
    customer_id: customers?.length === 1 ? customers[0].id : "",
    license_plate: "",
    brand: "",
    model: "",
    year: new Date().getFullYear(),
    color: "",
    current_mileage: 0,
    notes: ""
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
    >
      <Card className="shadow-xl border-0">
        <CardHeader className="border-b bg-gradient-to-r from-orange-50 to-orange-100/50">
          <div className="flex justify-between items-center">
            <CardTitle className="text-xl font-bold text-gray-900">
              {vehicle ? "Editar Veículo" : "Novo Veículo"}
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={onCancel}>
              <X className="w-5 h-5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {!hideCustomerSelect && (
              <div className="space-y-2">
                <Label htmlFor="customer_id">Cliente *</Label>
                <Select
                  value={formData.customer_id}
                  onValueChange={(value) => setFormData({...formData, customer_id: value})}
                  required
                >
                  <SelectTrigger className="border-gray-300">
                    <SelectValue placeholder="Selecione o cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers?.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="license_plate">Placa *</Label>
                <Input
                  id="license_plate"
                  value={formData.license_plate}
                  onChange={(e) => setFormData({...formData, license_plate: e.target.value.toUpperCase()})}
                  placeholder="ABC-1234"
                  required
                  className="border-gray-300"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="brand">Marca *</Label>
                <Input
                  id="brand"
                  value={formData.brand}
                  onChange={(e) => setFormData({...formData, brand: e.target.value})}
                  placeholder="Chevrolet, Ford, Volkswagen..."
                  required
                  className="border-gray-300"
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="model">Modelo *</Label>
                <Input
                  id="model"
                  value={formData.model}
                  onChange={(e) => setFormData({...formData, model: e.target.value})}
                  placeholder="Onix, Ka, Gol..."
                  required
                  className="border-gray-300"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="year">Ano</Label>
                <Input
                  id="year"
                  type="number"
                  value={formData.year}
                  onChange={(e) => setFormData({...formData, year: parseInt(e.target.value)})}
                  min="1900"
                  max={new Date().getFullYear() + 1}
                  className="border-gray-300"
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="color">Cor</Label>
                <Input
                  id="color"
                  value={formData.color}
                  onChange={(e) => setFormData({...formData, color: e.target.value})}
                  placeholder="Branco, Preto, Prata..."
                  className="border-gray-300"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="current_mileage">Quilometragem Atual</Label>
                <Input
                  id="current_mileage"
                  type="number"
                  value={formData.current_mileage}
                  onChange={(e) => setFormData({...formData, current_mileage: parseInt(e.target.value)})}
                  min="0"
                  className="border-gray-300"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                rows={3}
                className="border-gray-300"
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800">
                <Save className="w-4 h-4 mr-2" />
                {vehicle ? "Atualizar" : "Salvar"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  );
}