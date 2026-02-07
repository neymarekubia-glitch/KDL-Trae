
import React, { useState, useEffect } from "react";
import { MaintenanceReminder, Customer, Vehicle } from "@/api/entities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, User, Car, Calendar, Gauge, MessageSquare, Check, X, Copy, AlertCircle, Zap } from "lucide-react";
import { format, isPast, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Reminders() {
  const [reminders, setReminders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("pendente");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [remindersData, customersData, vehiclesData] = await Promise.all([
        MaintenanceReminder.list("-created_date"),
        Customer.list("-created_date"),
        Vehicle.list("-created_date")
      ]);
      setReminders(remindersData);
      setCustomers(customersData);
      setVehicles(vehiclesData);
    } catch (e) {
      console.error("Failed to load reminders:", e);
    } finally {
      setLoading(false);
    }
  };

  const getCustomer = (customerId) => {
    return customers.find(c => c.id === customerId);
  };

  const getVehicle = (vehicleId) => {
    return vehicles.find(v => v.id === vehicleId);
  };

  const handleMarkAsNotified = async (reminderId) => {
    await MaintenanceReminder.update(reminderId, {
      status: "notificado",
      notification_sent_date: new Date().toISOString().split('T')[0]
    });
    loadData();
  };

  const handleMarkAsCompleted = async (reminderId) => {
    await MaintenanceReminder.update(reminderId, {
      status: "realizado"
    });
    loadData();
  };

  const handleMarkAsIgnored = async (reminderId) => {
    await MaintenanceReminder.update(reminderId, {
      status: "ignorado"
    });
    loadData();
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert("Mensagem copiada para área de transferência!");
  };

  const handleSendWhatsApp = async (reminder, customer) => {
    if (!customer?.phone) {
      alert("Telefone do cliente não cadastrado!");
      return;
    }

    const phone = customer.phone.replace(/\D/g, '');
    const whatsappUrl = `https://wa.me/55${phone}?text=${encodeURIComponent(reminder.whatsapp_message)}`;
    window.open(whatsappUrl, '_blank');

    // Update reminder status to notificado
    await MaintenanceReminder.update(reminder.id, {
      status: "notificado",
      notification_sent_date: new Date().toISOString().split('T')[0]
    });
    
    loadData();
  };

  const isUrgent = (reminder) => {
    if (reminder.target_date) {
      const daysUntil = differenceInDays(new Date(reminder.target_date), new Date());
      if (daysUntil <= 7) return true;
    }
    const vehicle = getVehicle(reminder.vehicle_id);
    if (reminder.target_mileage && vehicle?.current_mileage) {
      const kmUntil = reminder.target_mileage - vehicle.current_mileage;
      if (kmUntil <= 1000) return true;
    }
    return false;
  };

  const shouldSendNow = (reminder) => {
    if (reminder.target_date) {
      const today = new Date();
      const targetDate = new Date(reminder.target_date);
      return targetDate <= today;
    }
    return false;
  };

  const filteredReminders = reminders.filter(r => r.status === statusFilter);

  const urgentReminders = filteredReminders.filter(isUrgent);
  const normalReminders = filteredReminders.filter(r => !isUrgent(r));

  return (
    <div className="p-4 md:p-8 bg-gradient-to-br from-gray-50 to-gray-100 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Lembretes de Manutenção</h1>
          <p className="text-gray-500 mt-1">Central de notificações automáticas</p>
        </div>

        <Card className="bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200 border-2">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Zap className="w-6 h-6 text-blue-600 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-blue-900 mb-2">💬 Sistema de Lembretes</h3>
                <div className="space-y-2 text-sm text-blue-800">
                  <p>
                    <strong>📅 Como funciona:</strong> Os lembretes são criados quando você define uma "Data de Lembrete" ao criar uma cotação.
                  </p>
                  <p>
                    <strong>⏰ Envio:</strong> Quando chegar a data do lembrete, envie a mensagem via WhatsApp. O lembrete irá para a aba "Notificados".
                  </p>
                  <p>
                    <strong>✅ Status:</strong> Marque como "Realizado" quando o cliente agendar ou realizar o serviço.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList className="grid w-full md:w-auto grid-cols-4 bg-white shadow-sm">
            <TabsTrigger value="pendente" className="data-[state=active]:bg-orange-600 data-[state=active]:text-white">
              Pendentes
            </TabsTrigger>
            <TabsTrigger value="notificado" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
              Notificados
            </TabsTrigger>
            <TabsTrigger value="realizado" className="data-[state=active]:bg-green-600 data-[state=active]:text-white">
              Realizados
            </TabsTrigger>
            <TabsTrigger value="ignorado" className="data-[state=active]:bg-gray-600 data-[state=active]:text-white">
              Ignorados
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {loading ? (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
          </div>
        ) : (
          <>
            {urgentReminders.length > 0 && statusFilter === "pendente" && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Bell className="w-5 h-5 text-red-600 animate-bounce" />
                  <h2 className="text-xl font-bold text-red-700">🚨 Urgente - Enviar Agora!</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {urgentReminders.map((reminder) => (
                    <ReminderCard
                      key={reminder.id}
                      reminder={reminder}
                      customer={getCustomer(reminder.customer_id)}
                      vehicle={getVehicle(reminder.vehicle_id)}
                      isUrgent={true}
                      shouldSendNow={shouldSendNow(reminder)}
                      onMarkAsNotified={handleMarkAsNotified}
                      onMarkAsCompleted={handleMarkAsCompleted}
                      onMarkAsIgnored={handleMarkAsIgnored}
                      onCopyMessage={copyToClipboard}
                      onSendWhatsApp={handleSendWhatsApp}
                    />
                  ))}
                </div>
              </div>
            )}

            {normalReminders.length > 0 && (
              <div className="space-y-4">
                {statusFilter === "pendente" && urgentReminders.length > 0 && (
                  <h2 className="text-xl font-bold text-gray-700">📋 Outros Lembretes</h2>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {normalReminders.map((reminder) => (
                    <ReminderCard
                      key={reminder.id}
                      reminder={reminder}
                      customer={getCustomer(reminder.customer_id)}
                      vehicle={getVehicle(reminder.vehicle_id)}
                      isUrgent={false}
                      shouldSendNow={shouldSendNow(reminder)}
                      onMarkAsNotified={handleMarkAsNotified}
                      onMarkAsCompleted={handleMarkAsCompleted}
                      onMarkAsIgnored={handleMarkAsIgnored}
                      onCopyMessage={copyToClipboard}
                      onSendWhatsApp={handleSendWhatsApp}
                    />
                  ))}
                </div>
              </div>
            )}

            {filteredReminders.length === 0 && (
              <div className="text-center py-20">
                <Bell className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 text-lg">Nenhum lembrete {statusFilter}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ReminderCard({ 
  reminder, 
  customer, 
  vehicle, 
  isUrgent,
  shouldSendNow,
  onMarkAsNotified, 
  onMarkAsCompleted, 
  onMarkAsIgnored,
  onCopyMessage,
  onSendWhatsApp
}) {
  const borderColor = isUrgent ? "border-red-500" : "border-blue-500";
  const bgColor = isUrgent ? "from-red-50/50" : "from-blue-50/50";

  return (
    <Card className={`shadow-lg border-2 ${borderColor} hover:shadow-xl transition-all duration-300`}>
      <div className={`h-2 bg-gradient-to-r ${isUrgent ? 'from-red-600 to-red-700' : 'from-blue-600 to-blue-700'}`} />
      <CardHeader className={`p-6 bg-gradient-to-br ${bgColor} to-transparent`}>
        <div className="flex justify-between items-start">
          <CardTitle className="text-lg">{reminder.service_name}</CardTitle>
          <div className="flex flex-col gap-1">
            {isUrgent && (
              <Badge className="bg-red-100 text-red-800 border-red-200 border animate-pulse">
                URGENTE
              </Badge>
            )}
            {shouldSendNow && (
              <Badge className="bg-green-100 text-green-800 border-green-200 border">
                <Zap className="w-3 h-3 mr-1" />
                ENVIAR AGORA
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6 space-y-4">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-gray-700">
            <User className="w-4 h-4 text-blue-600" />
            <span className="font-medium">{customer?.name}</span>
          </div>
          <div className="flex items-center gap-2 text-gray-700">
            <Car className="w-4 h-4 text-orange-600" />
            <span>{vehicle?.brand} {vehicle?.model} - {vehicle?.license_plate}</span>
          </div>

          {reminder.target_date && (
            <div className="flex items-center gap-2 text-gray-700">
              <Calendar className="w-4 h-4 text-green-600" />
              <span>
                Data prevista: {format(new Date(reminder.target_date), "dd/MM/yyyy", { locale: ptBR })}
                {isPast(new Date(reminder.target_date)) && (
                  <Badge className="ml-2 bg-red-100 text-red-800">Vencido</Badge>
                )}
              </span>
            </div>
          )}

          {reminder.target_mileage && (
            <div className="flex items-center gap-2 text-gray-700">
              <Gauge className="w-4 h-4 text-purple-600" />
              <span>
                KM prevista: {reminder.target_mileage.toLocaleString()} km
                {vehicle?.current_mileage && (
                  <span className="text-sm text-gray-500 ml-2">
                    (faltam {Math.max(0, reminder.target_mileage - vehicle.current_mileage).toLocaleString()} km)
                  </span>
                )}
              </span>
            </div>
          )}
        </div>

        {reminder.whatsapp_message && (
          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <MessageSquare className="w-4 h-4 text-green-600" />
                Mensagem WhatsApp
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onCopyMessage(reminder.whatsapp_message)}
              >
                <Copy className="w-4 h-4 mr-1" />
                Copiar
              </Button>
            </div>
            <div className="bg-green-50 p-3 rounded-lg border border-green-200">
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{reminder.whatsapp_message}</p>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              📱 Telefone: {customer?.phone || 'Não informado'}
            </p>
          </div>
        )}

        {reminder.status === "pendente" && (
          <div className="flex gap-2 pt-4 border-t">
            <Button
              onClick={() => onSendWhatsApp(reminder, customer)}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700"
              size="sm"
            >
              <MessageSquare className="w-4 h-4 mr-1" />
              WhatsApp
            </Button>
            <Button
              onClick={() => onMarkAsNotified(reminder.id)}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
              size="sm"
            >
              <Check className="w-4 h-4 mr-1" />
              Notificado
            </Button>
            <Button
              onClick={() => onMarkAsCompleted(reminder.id)}
              className="flex-1 bg-green-600 hover:bg-green-700"
              size="sm"
            >
              <Check className="w-4 h-4 mr-1" />
              Realizado
            </Button>
            <Button
              onClick={() => onMarkAsIgnored(reminder.id)}
              variant="outline"
              size="sm"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}

        {reminder.status === "notificado" && reminder.notification_sent_date && (
          <p className="text-sm text-gray-500 pt-2 border-t">
            Notificado em: {format(new Date(reminder.notification_sent_date), "dd/MM/yyyy", { locale: ptBR })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
