import React, { useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Bot, User, Send, Loader2, MessageSquare, AlertCircle, Coins } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/useAuth";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

export default function Assistente() {
  const { token } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [creditsUsed, setCreditsUsed] = useState(null);
  const [creditsLimit, setCreditsLimit] = useState(null);
  const scrollRef = useRef(null);

  const fetchCredits = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/ai/credits`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (data.credits_limit != null) setCreditsLimit(data.credits_limit);
      if (data.credits_used_this_month != null) setCreditsUsed(data.credits_used_this_month);
    } catch (_) {}
  }, [token]);

  useEffect(() => {
    fetchCredits();
  }, [fetchCredits]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    const text = (input || "").trim();
    if (!text || loading) return;

    const userMessage = { role: "user", content: text };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const url = `${API_BASE}/ai/chat`;
      const headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ messages: newMessages }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error === "unauthorized" ? "Faça login para usar o assistente." : data?.message || "Erro ao enviar mensagem.");
        setMessages((prev) => prev.slice(0, -1));
        setInput(text);
        return;
      }

      if (data.credits_used_this_month != null) setCreditsUsed(data.credits_used_this_month);
      if (data.credits_limit != null) setCreditsLimit(data.credits_limit);

      if (data.error) {
        setError(data.error);
        setMessages((prev) => [...prev, { role: "assistant", content: data.error }]);
        return;
      }

      const assistantContent = data.message || "Sem resposta.";
      setMessages((prev) => [...prev, { role: "assistant", content: assistantContent }]);
    } catch (err) {
      setError(err?.message || "Falha de conexão.");
      setMessages((prev) => prev.slice(0, -1));
      setInput(text);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="p-4 md:p-8 bg-gradient-to-br from-gray-50 to-gray-100 min-h-screen">
      <div className="max-w-4xl mx-auto flex flex-col h-[calc(100vh-8rem)]">
        <Card className="flex-1 flex flex-col shadow-lg border-0 overflow-hidden">
          <CardHeader className="border-b bg-gradient-to-r from-blue-50 to-indigo-50/80 shrink-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-3 text-xl">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 text-white" />
                </div>
                <div>
                  <span className="text-gray-900">Assistente da Oficina</span>
                  <p className="text-sm font-normal text-gray-600 mt-0.5">
                    Cadastros, diagnósticos, cotações e consultas em linguagem natural
                  </p>
                </div>
              </CardTitle>
              {creditsLimit != null && (
                <div className="rounded-lg bg-white/80 px-4 py-3 border border-gray-200 min-w-[200px]">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Coins className="w-4 h-4 text-amber-600" />
                    <span className="text-sm font-semibold text-gray-800">Créditos este mês</span>
                  </div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>
                      Usados: <span className={creditsUsed >= creditsLimit ? "font-bold text-red-600" : "font-medium text-gray-800"}>{creditsUsed ?? 0}</span>
                    </span>
                    <span className="text-gray-600">
                      Restantes: <span className="font-medium text-green-700">{Math.max(0, (creditsLimit ?? 0) - (creditsUsed ?? 0))}</span>
                    </span>
                  </div>
                  <Progress value={creditsLimit > 0 ? Math.min(100, ((creditsUsed ?? 0) / creditsLimit) * 100) : 0} className="h-2" />
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1 flex flex-col min-h-0">
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-4 space-y-4"
            >
              {messages.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <Bot className="w-14 h-14 mx-auto mb-4 text-gray-300" />
                  <p className="font-medium text-gray-700">Como posso ajudar?</p>
                  <p className="text-sm mt-2 max-w-md mx-auto">
                    Exemplos: &quot;Cliente João chegou com carro falhando&quot;, &quot;Quantas cotações em análise?&quot;,
                    &quot;Cadastrar cliente Maria telefone 11999999999&quot;, &quot;Carro engasgando ao acelerar&quot;
                  </p>
                </div>
              )}
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {msg.role === "assistant" && (
                    <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                      <Bot className="w-4 h-4 text-blue-600" />
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                      msg.role === "user"
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 text-gray-900 border border-gray-200"
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  </div>
                  {msg.role === "user" && (
                    <div className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center shrink-0">
                      <User className="w-4 h-4 text-gray-600" />
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="flex gap-3 justify-start">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                    <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                  </div>
                  <div className="rounded-2xl px-4 py-3 bg-gray-100 border border-gray-200">
                    <span className="text-sm text-gray-500">Pensando...</span>
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="mx-4 mb-2 flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="p-4 border-t bg-white flex gap-2 items-end">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Digite sua mensagem... (Enter envia, Shift+Enter quebra linha)"
                className="min-h-[44px] max-h-32 resize-none"
                rows={2}
                disabled={loading}
              />
              <Button
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                className="bg-blue-600 hover:bg-blue-700 shrink-0 h-11"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
