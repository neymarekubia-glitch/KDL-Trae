import React, { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Car, Gauge, Calendar, Edit, Trash2, History } from "lucide-react";
import { Vehicle, VehicleMileageHistory } from "@/api/entities";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function VehicleCard({ vehicle, onEdit, onDelete, onRefresh }) {
  const [showMileageDialog, setShowMileageDialog] = useState(false);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [newMileage, setNewMileage] = useState(vehicle.current_mileage || 0);
  const [mileageNotes, setMileageNotes] = useState("");
  const [mileageHistory, setMileageHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const handleUpdateMileage = async () => {
    if (newMileage < (vehicle.current_mileage || 0)) {
      alert("A nova quilometragem não pode ser menor que a atual!");
      return;
    }

    if (newMileage === vehicle.current_mileage) {
      alert("A quilometragem não foi alterada!");
      return;
    }

    // Atualizar veículo
    await Vehicle.update(vehicle.id, {
      current_mileage: newMileage
    });

    // Registrar no histórico
    await VehicleMileageHistory.create({
      vehicle_id: vehicle.id,
      mileage: newMileage,
      record_date: new Date().toISOString().split('T')[0],
      notes: mileageNotes
    });

    setShowMileageDialog(false);
    setMileageNotes("");
    alert("Quilometragem atualizada com sucesso!");
    onRefresh();
  };

  const loadMileageHistory = async () => {
    setLoadingHistory(true);
    const history = await VehicleMileageHistory.filter({ vehicle_id: vehicle.id }, "-record_date");
    setMileageHistory(history);
    setLoadingHistory(false);
    setShowHistoryDialog(true);
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
      >
        <Card className="shadow-lg border-0 hover:shadow-xl transition-all duration-300">
          <div className="h-2 bg-gradient-to-r from-orange-500 to-orange-600" />
          <CardHeader className="p-6 bg-gradient-to-br from-orange-50/50 to-transparent">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-orange-100 rounded-xl">
                  <Car className="w-6 h-6 text-orange-600" />
                </div>
                <div>
                  <CardTitle className="text-xl font-bold text-gray-900">
                    {vehicle.brand} {vehicle.model}
                  </CardTitle>
                  <p className="text-sm text-gray-500 font-mono font-bold mt-1">{vehicle.license_plate}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="icon" onClick={() => onEdit(vehicle)} className="hover:bg-blue-100">
                  <Edit className="w-4 h-4 text-blue-600" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => onDelete(vehicle.id)} className="hover:bg-red-100">
                  <Trash2 className="w-4 h-4 text-red-600" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {vehicle.year && (
                <div>
                  <p className="text-xs text-gray-500 uppercase">Ano</p>
                  <p className="font-semibold text-gray-900">{vehicle.year}</p>
                </div>
              )}
              {vehicle.color && (
                <div>
                  <p className="text-xs text-gray-500 uppercase">Cor</p>
                  <p className="font-semibold text-gray-900">{vehicle.color}</p>
                </div>
              )}
            </div>

            <div className="pt-4 border-t">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Gauge className="w-5 h-5 text-blue-600" />
                  <span className="text-sm font-medium text-gray-700">Quilometragem</span>
                </div>
                <span className="text-2xl font-bold text-blue-700">
                  {vehicle.current_mileage?.toLocaleString() || 0} km
                </span>
              </div>
              <div className="flex gap-2 mt-3">
                <Button
                  onClick={() => {
                    setNewMileage(vehicle.current_mileage || 0);
                    setShowMileageDialog(true);
                  }}
                  size="sm"
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                >
                  <Gauge className="w-4 h-4 mr-2" />
                  Atualizar KM
                </Button>
                <Button
                  onClick={loadMileageHistory}
                  size="sm"
                  variant="outline"
                  className="flex-1"
                >
                  <History className="w-4 h-4 mr-2" />
                  Histórico
                </Button>
              </div>
            </div>

            {vehicle.notes && (
              <div className="pt-4 border-t">
                <p className="text-xs text-gray-500 uppercase mb-1">Observações</p>
                <p className="text-sm text-gray-700">{vehicle.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Dialog para atualizar quilometragem */}
      <Dialog open={showMileageDialog} onOpenChange={setShowMileageDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atualizar Quilometragem</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <p className="text-sm text-gray-600 mb-2">
                KM Atual: <span className="font-bold text-gray-900">{vehicle.current_mileage?.toLocaleString() || 0} km</span>
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new_mileage">Nova Quilometragem *</Label>
              <Input
                id="new_mileage"
                type="number"
                min={vehicle.current_mileage || 0}
                value={newMileage}
                onChange={(e) => setNewMileage(parseInt(e.target.value))}
                placeholder="Digite a nova quilometragem"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mileage_notes">Observações</Label>
              <Input
                id="mileage_notes"
                value={mileageNotes}
                onChange={(e) => setMileageNotes(e.target.value)}
                placeholder="Ex: Revisão, Troca de óleo, etc."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMileageDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdateMileage} className="bg-blue-600 hover:bg-blue-700">
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para mostrar histórico */}
      <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Histórico de Quilometragem</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            {loadingHistory ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              </div>
            ) : mileageHistory.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <History className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>Nenhum registro de quilometragem encontrado</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {mileageHistory.map((record, index) => (
                  <Card key={record.id} className="border-2">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <Calendar className="w-4 h-4 text-gray-500" />
                            <span className="font-medium text-gray-900">
                              {format(new Date(record.record_date), "dd/MM/yyyy", { locale: ptBR })}
                            </span>
                          </div>
                          {record.notes && (
                            <p className="text-sm text-gray-600 mt-1">{record.notes}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-blue-700">
                            {record.mileage.toLocaleString()} km
                          </p>
                          {index < mileageHistory.length - 1 && (
                            <p className="text-xs text-gray-500 mt-1">
                              +{(record.mileage - mileageHistory[index + 1].mileage).toLocaleString()} km
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}