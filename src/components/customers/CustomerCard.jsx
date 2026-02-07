
import React, { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { User, Phone, Mail, Car, Edit, Trash2, MapPin, Plus, ChevronDown, ChevronUp, FileText, Gauge, History } from "lucide-react";
import { Vehicle, VehicleMileageHistory } from "@/api/entities";
import VehicleForm from "../vehicles/VehicleForm";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function CustomerCard({ customer, vehicles, onEdit, onDelete, onRefresh }) {
  const [showVehicles, setShowVehicles] = useState(false);
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [showMileageDialog, setShowMileageDialog] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [newMileage, setNewMileage] = useState(0);
  const [mileageDate, setMileageDate] = useState(new Date().toISOString().split('T')[0]);

  const handleVehicleSubmit = async (vehicleData) => {
    if (editingVehicle) {
      await Vehicle.update(editingVehicle.id, vehicleData);
    } else {
      const createdVehicle = await Vehicle.create({ ...vehicleData, customer_id: customer.id });
      
      // Criar primeiro registro de histórico de km
      await VehicleMileageHistory.create({
        vehicle_id: createdVehicle.id,
        mileage: vehicleData.current_mileage || 0,
        record_date: new Date().toISOString().split('T')[0],
        notes: "KM inicial cadastrada"
      });
    }
    setShowVehicleForm(false);
    setEditingVehicle(null);
    onRefresh();
  };

  const handleVehicleDelete = async (vehicleId) => {
    if (confirm("Tem certeza que deseja excluir este veículo?")) {
      await Vehicle.delete(vehicleId);
      onRefresh();
    }
  };

  const handleUpdateMileage = (vehicle) => {
    setSelectedVehicle(vehicle);
    setNewMileage(vehicle.current_mileage || 0);
    setMileageDate(new Date().toISOString().split('T')[0]); // Initialize with current date
    setShowMileageDialog(true);
  };

  const handleSaveMileage = async () => {
    if (!selectedVehicle) return;

    const mileageValue = parseFloat(newMileage);
    
    if (mileageValue < (selectedVehicle.current_mileage || 0)) {
      alert("A nova quilometragem não pode ser menor que a atual!");
      return;
    }

    // Atualizar KM do veículo
    await Vehicle.update(selectedVehicle.id, {
      current_mileage: mileageValue
    });

    // Criar registro no histórico
    await VehicleMileageHistory.create({
      vehicle_id: selectedVehicle.id,
      mileage: mileageValue,
      record_date: mileageDate, // Use the state variable for date
      notes: "KM atualizada manualmente"
    });

    setShowMileageDialog(false);
    setSelectedVehicle(null);
    onRefresh();
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
    >
      <Card className="shadow-lg border-0 hover:shadow-xl transition-all duration-300 overflow-hidden">
        <div className="h-2 bg-gradient-to-r from-blue-600 to-blue-700" />
        <CardHeader className="p-6 bg-gradient-to-br from-blue-50/50 to-transparent">
          <div className="flex justify-between items-start">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl flex items-center justify-center shadow-md">
                <User className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-gray-900">{customer.name}</h3>
                {customer.cpf_cnpj && (
                  <p className="text-sm text-gray-500">{customer.cpf_cnpj}</p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onEdit(customer)}
                className="hover:bg-blue-100 hover:text-blue-700"
              >
                <Edit className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onDelete(customer.id)}
                className="hover:bg-red-100 hover:text-red-700"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="grid md:grid-cols-2 gap-3">
            <div className="flex items-center gap-2 text-gray-600">
              <Phone className="w-4 h-4 text-blue-600" />
              <span className="text-sm">{customer.phone}</span>
            </div>
            {customer.email && (
              <div className="flex items-center gap-2 text-gray-600">
                <Mail className="w-4 h-4 text-blue-600" />
                <span className="text-sm">{customer.email}</span>
              </div>
            )}
          </div>
          {customer.address && (
            <div className="flex items-center gap-2 text-gray-600">
              <MapPin className="w-4 h-4 text-blue-600" />
              <span className="text-sm">{customer.address}</span>
            </div>
          )}
          {customer.notes && (
            <div className="pt-2 border-t">
              <p className="text-sm text-gray-500 italic">{customer.notes}</p>
            </div>
          )}

          <div className="pt-3 border-t">
            <div className="flex items-center justify-between mb-3">
              <Button
                variant="ghost"
                onClick={() => setShowVehicles(!showVehicles)}
                className="flex items-center gap-2 text-blue-700 font-medium hover:bg-blue-50"
              >
                <Car className="w-4 h-4" />
                <span>{vehicles.length} veículo(s)</span>
                {showVehicles ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setEditingVehicle(null);
                  setShowVehicleForm(true);
                }}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="w-4 h-4 mr-1" />
                Adicionar Veículo
              </Button>
            </div>

            {showVehicleForm && (
              <div className="mb-4">
                <VehicleForm
                  vehicle={editingVehicle}
                  customers={[customer]}
                  hideCustomerSelect={true}
                  onSubmit={handleVehicleSubmit}
                  onCancel={() => {
                    setShowVehicleForm(false);
                    setEditingVehicle(null);
                  }}
                />
              </div>
            )}

            {showVehicles && vehicles.length > 0 && (
              <div className="space-y-2">
                {vehicles.map((vehicle) => (
                  <Card key={vehicle.id} className="border-2 border-gray-200">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge className="bg-gray-900 text-white font-mono">
                              {vehicle.license_plate}
                            </Badge>
                            <span className="font-semibold text-gray-900">
                              {vehicle.brand} {vehicle.model}
                            </span>
                          </div>
                          <div className="text-sm text-gray-600 space-y-1">
                            {vehicle.year && <p>Ano: {vehicle.year}</p>}
                            {vehicle.color && <p>Cor: {vehicle.color}</p>}
                            <p className="font-semibold text-blue-700">KM: {vehicle.current_mileage?.toLocaleString()} km</p>
                            {vehicle.notes && <p className="italic">{vehicle.notes}</p>}
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleUpdateMileage(vehicle)}
                            className="hover:bg-green-100 hover:text-green-700"
                          >
                            <Gauge className="w-4 h-4 mr-1" />
                            Atualizar KM
                          </Button>
                          <Link to={`${createPageUrl("VehicleHistory")}?id=${vehicle.id}`}>
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full hover:bg-purple-100 hover:text-purple-700"
                            >
                              <History className="w-4 h-4 mr-1" />
                              Ver Histórico
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingVehicle(vehicle);
                              setShowVehicleForm(true);
                            }}
                            className="hover:bg-orange-100 hover:text-orange-700"
                          >
                            <Edit className="w-4 h-4 mr-1" />
                            Editar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleVehicleDelete(vehicle.id)}
                            className="hover:bg-red-100 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4 mr-1" />
                            Excluir
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={showMileageDialog} onOpenChange={setShowMileageDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atualizar Quilometragem</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {selectedVehicle && (
              <>
                <div>
                  <p className="text-sm text-gray-500">Veículo</p>
                  <p className="font-semibold">{selectedVehicle.brand} {selectedVehicle.model} - {selectedVehicle.license_plate}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">KM Atual</p>
                  <p className="text-lg font-bold text-blue-700">{selectedVehicle.current_mileage?.toLocaleString()} km</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new_mileage">Nova Quilometragem *</Label>
                  <Input
                    id="new_mileage"
                    type="number"
                    min={selectedVehicle.current_mileage || 0}
                    value={newMileage}
                    onChange={(e) => setNewMileage(e.target.value)}
                    placeholder="Digite a nova quilometragem"
                  />
                  <p className="text-xs text-gray-500">
                    A nova quilometragem deve ser maior ou igual à atual
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mileage_date">Data da Atualização *</Label>
                  <Input
                    id="mileage_date"
                    type="date"
                    value={mileageDate}
                    onChange={(e) => setMileageDate(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMileageDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveMileage} className="bg-green-600 hover:bg-green-700">
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
