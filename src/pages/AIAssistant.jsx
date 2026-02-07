import React, { useEffect, useState } from "react";
import { Customer, Vehicle } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { apiClient } from "@/api/apiClient";
import { ArrowLeft, Save } from "lucide-react";

export default function AIAssistant() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    customer_id: "",
    vehicle_id: "",
    problem_description: ""
  });
  const [result, setResult] = useState(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [cs, vs] = await Promise.all([
          Customer.list("-created_date"),
          Vehicle.list("-created_date")
        ]);
        setCustomers(cs);
        setVehicles(vs);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const customerVehicles = vehicles.filter(v => v.customer_id === form.customer_id);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!form.customer_id || !form.vehicle_id || !form.problem_description.trim()) return;
    setSubmitting(true);
    try {
      const data = await apiClient.request("POST", "/ai/diagnose", { body: form });
      setResult(data);
    } catch (err) {
      alert("Falha ao gerar diagnóstico: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 bg-white min-h-screen">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="outline" size="icon" onClick={() => navigate(createPageUrl("Dashboard"))}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Assistente IA</h1>
            <p className="text-gray-500 mt-1">Diagnóstico e cotação automática</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card className="shadow-lg border-0">
            <CardHeader className="border-b bg-gray-50">
              <CardTitle>Informações</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Cliente</Label>
                  <Select
                    value={form.customer_id}
                    onValueChange={(value) => setForm({ ...form, customer_id: value, vehicle_id: "" })}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map((customer) => (
                        <SelectItem key={customer.id} value={customer.id}>
                          {customer.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Veículo</Label>
                  <Select
                    value={form.vehicle_id}
                    onValueChange={(value) => setForm({ ...form, vehicle_id: value })}
                    required
                    disabled={!form.customer_id}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o veículo" />
                    </SelectTrigger>
                    <SelectContent>
                      {customerVehicles.map((vehicle) => (
                        <SelectItem key={vehicle.id} value={vehicle.id}>
                          {vehicle.brand} {vehicle.model} - {vehicle.license_plate}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Problema relatado</Label>
                <Textarea
                  value={form.problem_description}
                  onChange={(e) => setForm({ ...form, problem_description: e.target.value })}
                  rows={4}
                  placeholder="Descreva o problema relatado pelo cliente"
                  required
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Button
              type="submit"
              className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
              disabled={submitting}
            >
              <Save className="w-4 h-4 mr-2" />
              {submitting ? "Gerando..." : "Gerar diagnóstico e cotação"}
            </Button>
          </div>
        </form>

        {result && (
          <div className="mt-8 space-y-6">
            <Card className="shadow-lg border-0">
              <CardHeader className="border-b bg-gray-50">
                <CardTitle>Resultado</CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                {result.diagnosis_summary && (
                  <div className="space-y-1">
                    <Label>Resumo</Label>
                    <p className="text-gray-700">{result.diagnosis_summary}</p>
                  </div>
                )}
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label>Subtotal</Label>
                    <p className="font-bold">R$ {(result.subtotal || 0).toFixed(2)}</p>
                  </div>
                  <div className="space-y-1">
                    <Label>Total</Label>
                    <p className="font-bold text-green-700">R$ {(result.total || 0).toFixed(2)}</p>
                  </div>
                </div>
                <div>
                  <Button
                    onClick={() => navigate(`${createPageUrl("QuoteDetail")}?id=${encodeURIComponent(result.quote_id)}`)}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    Ver cotação {result.quote_number}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
