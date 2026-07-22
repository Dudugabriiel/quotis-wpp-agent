import Anthropic from '@anthropic-ai/sdk'
import { buscarPlanos } from './supabase.js'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const CIDADES_VALIDAS = [
  'São José dos Campos','Jacareí','Taubaté','Caçapava',
  'Guaratinguetá','Caraguatatuba','São Sebastião','Ubatuba',
  'Pindamonhangaba','Lorena','Guararema','Santa Branca'
]

const SYSTEM_PROMPT = `Você é o assistente de cotação de planos de saúde da Quotis Saúde Regional.
Você atende exclusivamente corretores de saúde via WhatsApp.

Sua função é:
1. Coletar os dados necessários para fazer uma cotação
2. Identificar dados faltantes e pedir de forma clara e amigável
3. Quando tiver todos os dados, fazer a cotação e apresentar os planos
4. Responder dúvidas sobre planos, carências e coberturas

DADOS NECESSÁRIOS para cotação PF:
- Nome do cliente
- Cidade (deve ser uma das cidades atendidas)
- Idade do titular
- Profissão (importante para planos de adesão)
- Dependentes: quantidade e idade de cada um (opcional)

DADOS NECESSÁRIOS para cotação PJ:
- Nome da empresa
- Cidade
- Número de vidas (funcionários + dependentes)
- Idade dos beneficiários (pode ser faixa etária predominante)

CIDADES ATENDIDAS: ${CIDADES_VALIDAS.join(', ')}

REGRAS:
- Seja direto, objetivo e use emojis com moderação
- Se faltar algum dado, liste EXATAMENTE quais faltam
- Nunca invente preços — use sempre os dados reais do banco
- Quando apresentar planos, mostre no máximo 3 (os mais baratos)
- Formate valores como R$ 1.234,56
- Ao apresentar cotação, sempre ofereça o comando *pdf* no final

FORMATO DE RESPOSTA para cotação completa:
Use este formato exato ao apresentar planos:
[COTACAO_PRONTA]
nome_cliente|cidade|idade|dependentes_count
operadora1|nome_plano1|acomodacao1|copart1|preco_total1
operadora2|nome_plano2|acomodacao2|copart2|preco_total2
operadora3|nome_plano3|acomodacao3|copart3|preco_total3
[/COTACAO_PRONTA]

Seguido da mensagem formatada para o corretor.`

// Sessões em memória (por número de WhatsApp)
const sessoes = new Map()

export async function processarMensagem({ numero, mensagem, corretor }) {
  const chave = numero

  // Inicializar sessão se não existir
  if (!sessoes.has(chave)) {
    sessoes.set(chave, {
      historico: [],
      ultimaCotacao: null,
      corretor
    })
  }

  const sessao = sessoes.get(chave)

  // Comando /pdf ou "pdf"
  if (mensagem.trim().toLowerCase() === 'pdf' || mensagem.trim().toLowerCase() === '/pdf') {
    if (!sessao.ultimaCotacao) {
      return { tipo: 'texto', conteudo: '📄 Ainda não há cotação para gerar o PDF. Faça uma cotação primeiro!' }
    }
    return { tipo: 'pdf', cotacao: sessao.ultimaCotacao, corretor }
  }

  // Comando /ajuda
  if (mensagem.trim().toLowerCase() === '/ajuda' || mensagem.trim().toLowerCase() === 'ajuda') {
    return {
      tipo: 'texto',
      conteudo: `🤖 *Assistente Quotis — Comandos disponíveis*

📋 *Cotação PF:*
Me mande os dados do cliente:
_Ex: "Cotação para João Silva, 35 anos, São José dos Campos, Engenheiro"_

🏢 *Cotação PJ:*
_Ex: "Cotação empresa, 10 funcionários, Taubaté"_

📄 *pdf* — Gera o PDF da última cotação

🔄 *nova* — Inicia uma nova cotação

❓ *ajuda* — Mostra este menu

_Cidades atendidas: ${CIDADES_VALIDAS.join(', ')}_`
    }
  }

  // Comando /nova
  if (mensagem.trim().toLowerCase() === 'nova' || mensagem.trim().toLowerCase() === '/nova') {
    sessoes.set(chave, { historico: [], ultimaCotacao: null, corretor })
    return { tipo: 'texto', conteudo: '✅ Nova cotação iniciada! Me mande os dados do cliente.' }
  }

  // Adicionar mensagem ao histórico
  sessao.historico.push({ role: 'user', content: mensagem })

  // Chamar Claude
  const response = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    system: SYSTEM_PROMPT,
    messages: sessao.historico
  })

  const respostaIA = response.content[0].text

  // Adicionar resposta ao histórico
  sessao.historico.push({ role: 'assistant', content: respostaIA })

  // Limitar histórico a 20 mensagens
  if (sessao.historico.length > 20) {
    sessao.historico = sessao.historico.slice(-20)
  }

  // Verificar se tem cotação pronta
  if (respostaIA.includes('[COTACAO_PRONTA]')) {
    const match = respostaIA.match(/\[COTACAO_PRONTA\]([\s\S]*?)\[\/COTACAO_PRONTA\]/)
    if (match) {
      const linhas = match[1].trim().split('\n')
      const [dadosCliente] = linhas
      const [nomeCliente, cidade, idade, numDeps] = dadosCliente.split('|')
      const planos = linhas.slice(1).map(l => {
        const [operadora, nome, acomodacao, copart, preco] = l.split('|')
        return { operadora, nome, acomodacao, copart, preco: parseFloat(preco) }
      })

      sessao.ultimaCotacao = {
        cliente: { nome: nomeCliente, cidade, idade, dependentes: parseInt(numDeps) || 0 },
        planos,
        corretor
      }
    }

    // Remover tag da resposta
    const respostaLimpa = respostaIA
      .replace(/\[COTACAO_PRONTA\][\s\S]*?\[\/COTACAO_PRONTA\]\n?/, '')
      .trim()

    return { tipo: 'texto', conteudo: respostaLimpa }
  }

  return { tipo: 'texto', conteudo: respostaIA }
}
