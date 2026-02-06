import React from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, Phone, Mail, MapPin, Calendar, Edit, Trash2, User } from "lucide-react";

export default function SupplierCard({ supplier, onEdit, onDelete }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
    >
      <Card className="shadow-lg border-0 hover:shadow-xl transition-all duration-300 overflow-hidden">
        <div className="h-2 bg-gradient-to-r from-purple-600 to-purple-700" />
        <CardHeader className="p-6 bg-gradient-to-br from-purple-50/50 to-transparent">
          <div className="flex justify-between items-start">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-purple-700 rounded-xl flex items-center justify-center shadow-md">
                <Building2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-gray-900">{supplier.name}</h3>
                {supplier.cnpj && (
                  <p className="text-sm text-gray-500">CNPJ: {supplier.cnpj}</p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onEdit(supplier)}
                className="hover:bg-purple-100 hover:text-purple-700"
              >
                <Edit className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onDelete(supplier.id)}
                className="hover:bg-red-100 hover:text-red-700"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-3">
          {supplier.contact_name && (
            <div className="flex items-center gap-2 text-gray-600">
              <User className="w-4 h-4 text-purple-600" />
              <span className="text-sm">{supplier.contact_name}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-gray-600">
            <Phone className="w-4 h-4 text-purple-600" />
            <span className="text-sm">{supplier.phone}</span>
          </div>
          {supplier.email && (
            <div className="flex items-center gap-2 text-gray-600">
              <Mail className="w-4 h-4 text-purple-600" />
              <span className="text-sm">{supplier.email}</span>
            </div>
          )}
          {supplier.address && (
            <div className="flex items-center gap-2 text-gray-600">
              <MapPin className="w-4 h-4 text-purple-600" />
              <span className="text-sm">{supplier.address}</span>
            </div>
          )}
          {supplier.purchase_frequency_days && (
            <div className="flex items-center gap-2 text-gray-600 pt-2 border-t">
              <Calendar className="w-4 h-4 text-purple-600" />
              <span className="text-sm">Compra a cada {supplier.purchase_frequency_days} dias</span>
            </div>
          )}
          {supplier.notes && (
            <div className="pt-2 border-t">
              <p className="text-sm text-gray-500 italic">{supplier.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}