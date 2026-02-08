# Guia passo a passo: Créditos do Assistente IA

Este guia explica como configurar o sistema de créditos para o Assistente IA, quanto cada tipo de conta custa e como definir planos no painel do administrador.

---

## O que são créditos?

- **1 crédito** = 1 conversa com o Assistente (você envia uma mensagem e recebe uma resposta).
- Cada **oficina (conta)** tem seu próprio limite de créditos por mês.
- No início de cada mês, o uso é zerado automaticamente.

---

## Quanto custa cada tipo de conta? (para você)

O custo abaixo é o que **você paga** para a OpenAI (API). O que você cobra das oficinas é você quem define.

| Tipo de conta | Créditos/mês | Quem usa assim | Custo para você (OpenAI)* |
|---------------|--------------|----------------|---------------------------|
| **Básico** | 50 | Usa pouco (algumas vezes por semana) | ~R$ 0,25 |
| **Profissional** | 200 | Usa muito (quase todo dia) | ~R$ 1,00 |
| **Avançado** | 500 | Usa bastante | ~R$ 2,50 |
| **Ilimitado** | 2.000 | Usa o tempo todo | ~R$ 10,00 |

\* Cotação aproximada (US$ 0,0007 por crédito × câmbio). Em reais, pode variar.

**Exemplo de preço para seus clientes:** você pode cobrar, por exemplo, R$ 29/mês pelo plano Básico e R$ 79/mês pelo Profissional. O custo da OpenAI fica embutido e você tem margem.

---

## Passo 1: Executar a migração no Supabase

1. Acesse o **Supabase**: https://supabase.com/dashboard
2. Abra seu projeto (o que está conectado ao sistema).
3. No menu lateral, clique em **SQL Editor**.
4. Clique em **New query**.
5. Copie TODO o conteúdo do arquivo `supabase/migration_ai_credits.sql` do seu projeto.
6. Cole no editor e clique em **Run** (ou Ctrl+Enter).
7. Deve aparecer "Success". Pronto, as colunas de créditos foram criadas.

---

## Passo 2: Configurar a chave da OpenAI (se ainda não fez)

1. Acesse https://platform.openai.com/ e faça login.
2. Vá em **API keys** e crie uma chave (ou use uma existente).
3. No **Vercel**, vá em seu projeto → **Settings** → **Environment Variables**.
4. Adicione:
   - **Nome:** `OPENAI_API_KEY`
   - **Valor:** a chave que começa com `sk-`
5. Marque o ambiente (Production, Preview) e salve.
6. Faça um novo deploy para aplicar.

---

## Passo 3: Definir o plano de cada oficina no Painel Administrador

1. Faça login no sistema com a conta de **Super Admin** (o e-mail configurado em `VITE_SUPERADMIN_EMAIL`).
2. No menu lateral, clique em **Painel Administrador** (ou acesse `/admin/super`).
3. Na lista de oficinas, clique na oficina que deseja configurar.
4. Na seção **"Plano de créditos IA"**, escolha o tipo de conta:
   - **Básico** (50 créditos/mês)
   - **Profissional** (200 créditos/mês)
   - **Avançado** (500 créditos/mês)
   - **Ilimitado** (2.000 créditos/mês)
5. Clique em **Salvar plano**.
6. Repita para cada oficina.

O uso atual da oficina aparece na mesma tela (ex.: "12 de 50 usados este mês").

---

## Passo 4: O que o usuário da oficina vê?

Quando um usuário da oficina abre o **Assistente IA**:

- No topo da tela aparece: **"Créditos usados: X | Créditos restantes: Y"**.
- Uma barra de progresso mostra quanto do limite já foi usado.
- Ao enviar cada mensagem, o número é atualizado automaticamente.
- Se chegar ao limite, o assistente avisa e não responde até o próximo mês (ou até você aumentar o plano).

---

## Resumo dos custos (referência)

| Plano | Créditos | Custo OpenAI (aprox.) | Sugestão de cobrança |
|-------|----------|----------------------|----------------------|
| Básico | 50 | R$ 0,25/mês | R$ 29/mês |
| Profissional | 200 | R$ 1,00/mês | R$ 59/mês |
| Avançado | 500 | R$ 2,50/mês | R$ 99/mês |
| Ilimitado | 2.000 | R$ 10/mês | R$ 149/mês |

Você define os valores que vai cobrar. Os custos da OpenAI são apenas referência para você calcular sua margem.
