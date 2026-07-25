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
3. Quando tiver todos os dados, chamar a ferramenta buscar_planos e apresentar os planos retornados
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
- Assim que tiver cidade, idade do titular e tipo (PF ou PJ), chame a ferramenta buscar_planos — nunca escreva preços ou nomes de planos de memória
- Use EXCLUSIVAMENTE os planos e preços retornados pela ferramenta buscar_planos
- Se a ferramenta não retornar nenhum plano, informe ao corretor que não há planos disponíveis para esses critérios e sugira revisar cidade/idade
- Quando apresentar planos, mostre no máximo 3 (os mais baratos, a ferramenta já retorna ordenado)
- Formate valores como R$ 1.234,56
- Ao apresentar cotação, sempre ofereça o comando *pdf* no final

FORMATO DE RESPOSTA para cotação completa (somente depois de receber o resultado da ferramenta buscar_planos):
Use este formato exato ao apresentar planos:
[COTACAO_PRONTA]
nome_cliente|cidade|idade|dependentes_count
operadora1|nome_plano1|acomodacao1|copart1|preco_total1
operadora2|nome_plano2|acomodacao2|copart2|preco_total2
operadora3|nome_plano3|acomodacao3|copart3|preco_total3
[/COTACAO_PRONTA]

Seguido da mensagem formatada para o corretor.`

const BUSCAR_PLANOS_TOOL = {
  name: 'buscar_planos',
  description: 'Busca no banco de dados da Quotis os planos de saúde reais disponíveis, com preços atualizados, para uma cidade/idade/tipo de cotação. Chame esta ferramenta assim que tiver os dados mínimos — nunca invente planos ou preços.',
  input_schema: {
    type: 'object',
    properties: {
      cidade: {
        type: 'string',
        description: 'Cidade atendida, exatamente como escrita na lista de cidades atendidas'
      },
      idadeTitular: {
        type: 'integer',
        description: 'Idade do titular (cliente PF) ou idade predominante dos beneficiários (PJ)'
      },
      tipo: {
        type: 'string',
        enum: ['PF', 'PJ'],
        description: 'Tipo de cotação: PF (pessoa física) ou PJ (empresarial)'
      },
      profissao: {
        type: 'string',
        description: 'Profissão do titular, relevante para planos de adesão por entidade de classe'
      },
      dependentes: {
        type: 'array',
        description: 'Lista de dependentes, cada um com a idade',
        items: {
          type: 'object',
          properties: {
            idade: { type: 'integer' }
          },
          required: ['idade']
        }
      }
    },
    required: ['cidade', 'idadeTitular', 'tipo']
  }
}

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

  // Mensagens de trabalho para esta chamada (pode incluir idas e vindas de tool use,
  // que não são persistidas no histórico de longo prazo — só a resposta final em texto)
  let mensagensParaClaude = [...sessao.historico]
  let respostaIA = null

  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const response = await claude.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      tools: [BUSCAR_PLANOS_TOOL],
      messages: mensagensParaClaude
    })

    if (response.stop_reason === 'tool_use') {
      const toolUse = response.content.find(b => b.type === 'tool_use')
      let resultadoFerramenta

      try {
        const planos = await buscarPlanos({
          cidade: toolUse.input.cidade,
          idadeTitular: toolUse.input.idadeTitular,
          tipo: toolUse.input.tipo,
          profissao: toolUse.input.profissao,
          dependentes: toolUse.input.dependentes || []
        })
        resultadoFerramenta = JSON.stringify({ planos })
      } catch (err) {
        console.error('❌ Erro ao buscar planos:', err)
        resultadoFerramenta = JSON.stringify({ erro: 'Falha ao consultar planos no banco de dados.' })
      }

      mensagensParaClaude.push({ role: 'assistant', content: response.content })
      mensagensParaClaude.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: resultadoFerramenta
        }]
      })
      continue
    }

    respostaIA = response.content.find(b => b.type === 'text')?.text || ''
    break
  }

  if (respostaIA === null) {
    respostaIA = '⚠️ Não consegui finalizar sua cotação agora. Pode tentar novamente?'
  }

  // Adicionar resposta final ao histórico (sem as idas e vindas de tool use)
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
