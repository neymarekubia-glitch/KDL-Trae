# Oficina App

Vite + React app desacoplado de qualquer provedor específico. As integrações (API, domínio, assets e branding) são configuráveis via variáveis de ambiente.

## Running the app

```bash
cp .env.example .env
# Edite .env para apontar para seu backend
npm install
npm run dev
```

## Building the app

```bash
npm run build
```

## Assistente IA

O sistema inclui um assistente por chat que permite:

- **Cadastros**: criar/editar clientes, veículos e fornecedores em linguagem natural.
- **Diagnóstico mecânico**: informar o sintoma (ex.: "carro falhando", "engasgando ao acelerar") e receber causas prováveis, peças sugeridas e tempo estimado.
- **Cotações**: gerar cotação automática a partir do diagnóstico (com itens do catálogo da oficina).
- **Consultas**: "Quantas cotações em análise?", "Quanto a receber?", "Faturamento do mês?" etc.
- **Histórico do veículo**: consultar e sugerir revisão geral com base em serviços anteriores.
- **Lembretes**: criar lembretes de manutenção para cliente/veículo.

Para ativar o assistente, configure no **Vercel** (ou no ambiente do backend):

- `OPENAI_API_KEY`: chave da API OpenAI (obrigatório para o chat).
- `OPENAI_CHAT_MODEL`: modelo a usar (opcional; padrão: `gpt-4o-mini`).

O assistente opera apenas nos dados do **tenant** do usuário logado (multi-tenant).

### Créditos por tenant (limite mensal)

Cada oficina (tenant) tem seu próprio limite de créditos por mês no Assistente IA. 1 crédito = 1 turno de conversa.

- **Guia passo a passo (para leigos):** `docs/PASSO_A_PASSO-CREDITOS-IA.md`
- **Referência técnica:** `docs/CREDITOS-IA.md`

O administrador define o plano (Básico, Profissional, Avançado, Ilimitado) em **Painel Administrador** → selecionar oficina → **Plano de créditos IA**. Os usuários veem "Usados" e "Restantes" no topo do Assistente.