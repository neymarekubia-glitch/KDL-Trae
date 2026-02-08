import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { apiClient } from "@/api/apiClient";
import { ArrowLeft, Bot, Send } from "lucide-react";

export default function AIAssistant() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Olá! Conte o que precisa: diagnóstico, cadastro, consulta de placa, fornecedores ou produtos." }
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [requestedFields, setRequestedFields] = useState([]);
  const [fieldValues, setFieldValues] = useState({});
  const [lastActions, setLastActions] = useState([]);

  const sendText = async (text, extraContext) => {
    if (!text.trim()) return;
    const nextMessages = [...messages, { role: "user", content: text.trim() }];
    setMessages(nextMessages);
    setSending(true);
    try {
      const data = await apiClient.request("POST", "/ai/chat", { body: { messages: nextMessages, context: extraContext || {} } });
      const reply = data.assistant_message || "Ok.";
      setMessages([...nextMessages, { role: "assistant", content: reply }]);
      setRequestedFields(Array.isArray(data.requested_fields) ? data.requested_fields : []);
      setFieldValues({});
      setLastActions(Array.isArray(data.actions_performed) ? data.actions_performed : []);
    } catch (e) {
      alert("Falha no assistente: " + e.message);
    } finally {
      setSending(false);
      setInput("");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await sendText(input);
  };

  const submitRequestedFields = async () => {
    const parts = Object.entries(fieldValues).map(([k, v]) => `${k}: ${v}`);
    const text = `Dados solicitados -> ${parts.join(", ")}`;
    await sendText(text, { provided_fields: fieldValues });
  };

  return (
    <div className="p-4 md:p-8 bg-white min-h-screen">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="outline" size="icon" onClick={() => navigate(createPageUrl("Dashboard"))}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2">
            <Bot className="w-6 h-6 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">Assistente IA</h1>
          </div>
        </div>

        <Card className="shadow-lg border-0">
          <CardHeader className="border-b bg-gray-50">
            <CardTitle>Conversa</CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-2">
              {messages.map((m, idx) => (
                <div key={idx} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`rounded-lg px-4 py-2 text-sm ${m.role === "user" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-800"}`}>
                    {m.content}
                  </div>
                </div>
              ))}
            </div>
            <form onSubmit={handleSubmit} className="flex gap-3 pt-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ex: Meu carro está engasgando quando ligo, placa DZZ-1A16"
              />
              <Button type="submit" disabled={sending} className="bg-blue-600 hover:bg-blue-700">
                <Send className="w-4 h-4 mr-1" />
                {sending ? "Enviando..." : "Enviar"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {requestedFields.length > 0 && (
          <Card className="shadow-lg border-0 mt-6">
            <CardHeader className="border-b bg-gray-50">
              <CardTitle>Informações necessárias</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              {requestedFields.map((f) => (
                <div key={f.key} className="space-y-1">
                  <Label>{f.label || f.key}</Label>
                  <Input
                    value={fieldValues[f.key] || ""}
                    onChange={(e) => setFieldValues({ ...fieldValues, [f.key]: e.target.value })}
                    placeholder={f.type === "number" ? "0" : ""}
                  />
                </div>
              ))}
              <div className="flex justify-end">
                <Button onClick={submitRequestedFields} className="bg-emerald-600 hover:bg-emerald-700">
                  Enviar dados
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {lastActions.length > 0 && (
          <div className="mt-6 space-y-6">
            {lastActions.map((a, i) => {
              if (a.type === "diagnose_quote" && a.quote_id) {
                return (
                  <Card key={i} className="shadow-lg border-0">
                    <CardHeader className="border-b bg-gray-50">
                      <CardTitle>Diagnóstico e Cotação</CardTitle>
                    </CardHeader>
                    <CardContent className="p-6 space-y-3">
                      {a.diagnosis_summary && (
                        <div className="space-y-1">
                          <Label>Resumo</Label>
                          <p className="text-gray-700">{a.diagnosis_summary}</p>
                        </div>
                      )}
                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <Label>Subtotal</Label>
                          <p className="font-bold">R$ {(a.subtotal || 0).toFixed(2)}</p>
                        </div>
                        <div className="space-y-1">
                          <Label>Total</Label>
                          <p className="font-bold text-green-700">R$ {(a.total || 0).toFixed(2)}</p>
                        </div>
                      </div>
                      <div>
                        <Button
                          onClick={() => navigate(`${createPageUrl("QuoteDetail")}?id=${encodeURIComponent(a.quote_id)}`)}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          Ver cotação {a.quote_number}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              }
              if (a.type === "search_plate") {
                return (
                  <Card key={i} className="shadow-lg border-0">
                    <CardHeader className="border-b bg-gray-50">
                      <CardTitle>Consulta de Placa</CardTitle>
                    </CardHeader>
                    <CardContent className="p-6 space-y-2">
                      {a.vehicle ? (
                        <div className="text-sm text-gray-800">
                          {a.vehicle.brand} {a.vehicle.model} - {a.vehicle.license_plate} • KM {a.vehicle.current_mileage}
                        </div>
                      ) : (
                        <div className="text-sm text-orange-700">Nenhum veículo encontrado para a placa informada.</div>
                      )}
                    </CardContent>
                  </Card>
                );
              }
              return null;
            })}
          </div>
        )}
      </div>
    </div>
  );
}
