# Créditos do Assistente IA por tenant

Cada **conta (tenant)** tem seu próprio limite de créditos por mês. 1 crédito = **1 turno de conversa** (1 mensagem do usuário → 1 resposta do assistente, incluindo uso de ferramentas como diagnóstico e criação de cotação).

---

## Preço da OpenAI (referência)

Modelo usado: **gpt-4o-mini**

| Tipo    | Preço (por 1 milhão de tokens) |
|---------|---------------------------------|
| Entrada | US$ 0,15                        |
| Saída   | US$ 0,60                        |

Média por turno (estimativa): ~1.500 tokens entrada + ~800 saída → **~US$ 0,0007 por crédito** (varia com tamanho da conversa e uso de ferramentas).

---

## Perfis de uso e créditos recomendados por mês

| Perfil              | Uso típico                     | Créditos/mês sugerido | Custo estimado (OpenAI)* |
|---------------------|--------------------------------|------------------------|---------------------------|
| **Não usa**         | 0–2 mensagens no mês           | 10–20                  | ~US$ 0,01                |
| **Usa pouco**       | Algumas consultas por semana   | 50–100                 | ~US$ 0,05–0,07            |
| **Usa muito**       | Quase todo dia, vários turnos  | 200–400                | ~US$ 0,15–0,30            |
| **Usa o tempo todo**| Várias vezes ao dia, muitos turnos | 800–2.000          | ~US$ 0,60–1,40            |

\* Custo direto da API OpenAI para você; o valor que você cobra do cliente é definido no seu plano.

---

## Sugestão de planos para o produto

Você pode vender planos assim (exemplo):

- **Básico**: 50 créditos/mês (atende “usa pouco”).
- **Profissional**: 200 créditos/mês (atende “usa muito”).
- **Ilimitado** (ou alto): 2.000 créditos/mês ou “ilimitado” (sem checagem), para “usa o tempo todo”.

O limite por conta é o campo `ai_credits_limit` na tabela `tenants`. O uso é zerado todo mês (`ai_credits_used_this_month`, `ai_credits_reset_at`).

---

## Como definir o limite por conta (tenant)

1. **Migração**: execute no Supabase (SQL Editor) o arquivo `supabase/migration_ai_credits.sql`.
2. **Alterar limite** (ex.: 200 créditos/mês para um tenant):
   ```sql
   update public.tenants
   set ai_credits_limit = 200
   where id = 'uuid-do-tenant';
   ```
3. **Novos tenants**: o default é 50. Para outro default, altere o `default 50` na migration ou faça o update após criar o tenant.
4. **Painel admin** (futuro): você pode expor `ai_credits_limit` na tela de edição de tenant no SuperAdmin para não usar SQL.
