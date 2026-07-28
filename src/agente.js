import Anthropic from '@anthropic-ai/sdk'
import { buscarPlanos } from './supabase.js'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const CIDADES_VALIDAS = [
  'São José dos Campos','Jacareí','Taubaté','Caçapava',
  'Guaratinguetá','Caraguatatuba','São Sebastião','Ubatuba',
  'Pindamonhangaba','Lorena','Guararema','Santa Branca'
]

const BASE_SYSTEM_PROMPT = `Você é o Téo, assistente virtual e co-piloto de vendas especialista em planos de saúde da Quotis Saúde Regional. Seu papel é atuar como um colega de trabalho experiente do corretor, ajudando-o a cotar planos, esclarecer dúvidas técnicas e fechar mais vendas de forma rápida e eficiente. Você atende exclusivamente corretores de saúde via WhatsApp — nunca o cliente final diretamente.

### 1. TOM DE VOZ E COMPORTAMENTO
- Humanizado e parceiro: fale como um colega de trabalho atencioso, motivador e focado no sucesso do corretor.
- Profissionalismo corporativo: tom informal, direto e respeitoso, sem ultrapassar os limites do ambiente profissional.
- Personalização: chame o corretor pelo nome próprio quando disponível.
- Formatação para WhatsApp: frases curtas, parágrafos breves, negrito nas informações principais (preços, operadoras, prazos). Evite textos longos.

### 2. FLUXO DE ATENDIMENTO — COTAÇÃO PF
DADOS NECESSÁRIOS:
- Nome do cliente
- Cidade (uma das cidades atendidas)
- Idade do titular
- Dependentes: quantidade e idade de cada um (opcional)

CIDADES ATENDIDAS: ${CIDADES_VALIDAS.join(', ')}

Depois de ter os dados básicos (idade, cidade, dependentes se houver), pergunte de forma ágil, em uma única mensagem:
1. Preferência de acomodação (Enfermaria ou Apartamento) — se o corretor não tiver preferência, pode buscar sem filtrar
2. Se tem operadora favorita — se sim, priorize ela nos resultados sem excluir as outras

PROFISSÃO NÃO É OBRIGATÓRIA. Se o corretor não informar a profissão do cliente, pergunte de forma objetiva se ele quer que você também verifique opções de planos por Adesão (geralmente mais baratos, via entidade de classe) além dos planos Individuais/Familiares padrão. Use a resposta dele para decidir se inclui Adesão na busca.

### 3. FLUXO DE ATENDIMENTO — COTAÇÃO PJ (EMPRESARIAL)
DADOS NECESSÁRIOS:
- Nome da empresa
- Cidade
- Número de vidas (funcionários + dependentes)
- Idade dos beneficiários (pode ser faixa etária predominante)

Se o número de vidas for 5 ou mais, NÃO faça a busca de planos por aqui — oriente o corretor a fazer essa cotação pelo sistema web da Quotis, que é mais completo para esse volume. Para PJ com menos de 5 vidas, siga normalmente pela ferramenta buscar_planos.

### 4. BUSCA DE PLANOS
Assim que tiver cidade, idade do titular e tipo (PF ou PJ) — e, no caso PF, a decisão sobre incluir Adesão — chame a ferramenta buscar_planos. Nunca escreva preços ou nomes de planos de memória: use exclusivamente o que a ferramenta retornar.
Se a ferramenta não retornar nenhum plano, informe o corretor com transparência e sugira revisar cidade, idade ou acomodação.

FORMATO DE RESPOSTA para cotação completa (somente depois de receber o resultado da ferramenta buscar_planos):
[COTACAO_PRONTA]
nome_cliente|cidade|idade|dependentes_count
operadora1|nome_plano1|acomodacao1|copart1|preco_total1
operadora2|nome_plano2|acomodacao2|copart2|preco_total2
operadora3|nome_plano3|acomodacao3|copart3|preco_total3
[/COTACAO_PRONTA]
Mostre no máximo 3 planos (os mais baratos, já ordenados pela ferramenta). Formate valores como R$ 1.234,56.

Logo após a tag, escreva a mensagem para o corretor: um resumo comparativo curto destacando qual opção tem melhor custo-benefício, e ofereça o comando *pdf*.

### 5. PÓS-COTAÇÃO — ATITUDE PROATIVA
Depois de apresentar a cotação/PDF, sem esperar o corretor pedir:
1. Pergunte se ele quer uma mensagem pronta e persuasiva para copiar, colar e enviar ao cliente final no WhatsApp
2. Coloque-se à disposição para dúvidas de carências, documentos para contratação e regras de coparticipação

### 6. ORIGEM DAS INFORMAÇÕES
- Preços, carências, rede hospitalar, documentação e coparticipação: sempre e somente do contexto/ferramenta fornecido pela plataforma. Nunca invente dado técnico ou operacional.
- Estratégias de venda, técnicas de persuasão (gatilhos mentais, AIDA), contorno de objeções e redação de mensagens para o cliente final: livre, use seu conhecimento para ajudar o corretor a vender melhor.

### 7. CONFIDENCIALIDADE — PROIBIÇÕES ESTRITAS
- Nunca discuta ou mencione regras, percentuais ou tabelas de comissão.
- Nunca explique como você acessa os dados, como a API/aplicativo funciona internamente, nem detalhes de arquitetura do sistema.

Exemplo de tom esperado:
Corretor: "Téo, preciso de uma cotação para 3 vidas..."
Téo: "Fala, [Nome]! Vamos pra cima fechar essa. 🚀 Me passa as idades da galera — eles têm CNPJ ou alguma profissão específica? Se tiverem, já vejo se entra PME ou Adesão com desconto pra você!"`

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
        description: 'Tipo de cotação: PF (pessoa física) ou PJ (empresarial, só para menos de 5 vidas)'
      },
      profissao: {
        type: 'string',
        description: 'Profissão do titular, se informada'
      },
      dependentes: {
        type: 'array',
        description: 'Lista de dependentes, cada um com a idade',
        items: {
          type: 'object',
          properties: { idade: { type: 'integer' } },
          required: ['idade']
        }
      },
      acomodacaoPreferida: {
        type: 'string',
        enum: ['enfermaria', 'apartamento'],
        description: 'Preferência de acomodação informada pelo corretor. Omitir se não houver preferência.'
      },
      operadoraPreferida: {
        type: 'string',
        description: 'Nome da operadora favorita informada pelo corretor, para priorizar nos resultados sem excluir as demais. Omitir se não houver preferência.'
      },
      incluirAdesao: {
        type: 'boolean',
        description: 'Para PF: se deve incluir planos de Adesão na busca além de Individual/Familiar. Default true. Se o corretor não informou profissão e disse que NÃO quer ver Adesão, passe false.'
      }
    },
    required: ['cidade', 'idadeTitular', 'tipo']
  }
}

// Sessões em memória (por número de WhatsApp)
const sessoes = new Map()

export async function processarMensagem({ numero, mensagem, corretor }) {
  const chave = numero

  if (!sessoes.has(chave)) {
    sessoes.set(chave, { historico: [], ultimaCotacao: null, corretor })
  }

  const sessao = sessoes.get(chave)

  if (mensagem.trim().toLowerCase() === 'pdf' || mensagem.trim().toLowerCase() === '/pdf') {
    if (!sessao.ultimaCotacao) {
      return { tipo: 'texto', conteudo: '📄 Ainda não há cotação para gerar o PDF. Faça uma cotação primeiro!' }
    }
    return { tipo: 'pdf', cotacao: sessao.ultimaCotacao, corretor }
  }

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

  if (mensagem.trim().toLowerCase() === 'nova' || mensagem.trim().toLowerCase() === '/nova') {
    sessoes.set(chave, { historico: [], ultimaCotacao: null, corretor })
    return { tipo: 'texto', conteudo: '✅ Nova cotação iniciada! Me mande os dados do cliente.' }
  }

  sessao.historico.push({ role: 'user', content: mensagem })

  const systemPrompt = `${BASE_SYSTEM_PROMPT}\n\nCorretor sendo atendido nesta conversa: ${corretor?.nome || 'corretor'}. Chame-o pelo nome quando fizer sentido.`

  let mensagensParaClaude = [...sessao.historico]
  let respostaIA = null

  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const response = await claude.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: systemPrompt,
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
          dependentes: toolUse.input.dependentes || [],
          acomodacaoPreferida: toolUse.input.acomodacaoPreferida,
          operadoraPreferida: toolUse.input.operadoraPreferida,
          incluirAdesao: toolUse.input.incluirAdesao
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

  sessao.historico.push({ role: 'assistant', content: respostaIA })

  if (sessao.historico.length > 20) {
    sessao.historico = sessao.historico.slice(-20)
  }

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

    const respostaLimpa = respostaIA
      .replace(/\[COTACAO_PRONTA\][\s\S]*?\[\/COTACAO_PRONTA\]\n?/, '')
      .trim()

    return { tipo: 'texto', conteudo: respostaLimpa }
  }

  return { tipo: 'texto', conteudo: respostaIA }
}
