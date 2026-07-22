# Quotis WPP Agent

Agente IA para cotação de planos de saúde via WhatsApp.

## Setup

1. Configure as variáveis de ambiente (copie .env.example para .env)
2. Deploy no Railway
3. Configure o webhook na Evolution API apontando para: https://sua-url.railway.app/webhook

## Comandos disponíveis para o corretor

- Mensagem livre → IA coleta dados e faz cotação
- `pdf` → Gera PDF whitelabel da última cotação
- `nova` → Inicia nova cotação
- `ajuda` → Lista comandos
