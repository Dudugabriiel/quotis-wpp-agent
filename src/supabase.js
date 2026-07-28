import { createClient } from '@supabase/supabase-js'

function getClient() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  )
}

export async function getCorretorByWhatsapp(numero) {
  const supabase = getClient()
  const numLimpo = numero.replace(/\D/g, '').replace(/^55/, '')
  const { data, error } = await supabase
    .from('corretores')
    .select('*, corretoras(id, nome, logo_url, cor_primaria, cor_secundaria, cor_acento, telefone, email)')
    .or(`whatsapp.eq.${numLimpo},whatsapp.eq.55${numLimpo},whatsapp.eq.+55${numLimpo}`)
    .single()
  if (error) {
    console.error('❌ Erro ao buscar corretor:', error.message)
    return null
  }
  return data || null
}

const COPART_LABELS = {
  sem_coparticipacao: 'Sem Copart',
  coparticipacao_consultas: 'Copart Consultas',
  coparticipacao_exames: 'Copart Exames',
  coparticipacao_completa: 'Copart Completa',
  coparticipacao_50_50: 'Copart 50/50'
}

export async function buscarPlanos({
  cidade, idadeTitular, tipo, profissao, dependentes = [],
  acomodacaoPreferida, operadoraPreferida, incluirAdesao = true
}) {
  const supabase = getClient()
  const modalidades = tipo === 'PF'
    ? (incluirAdesao ? ['individual_familiar', 'adesao'] : ['individual_familiar'])
    : ['empresarial_pme', 'empresarial_corporativo']

  let query = supabase
    .from('planos')
    .select(`
      id, nome, modalidade, acomodacao,
      tem_coparticipacao, coparticipacao_tipo,
      operadoras!inner(nome),
      administradoras(nome),
      plan_cities!inner(cidade, tipo),
      plano_faixas_etarias!inner(idade_de, idade_ate, valor)
    `)
    .in('modalidade', modalidades)
    .eq('ativo', true)
    .eq('plan_cities.cidade', cidade)
    .gte('plano_faixas_etarias.idade_ate', idadeTitular)
    .lte('plano_faixas_etarias.idade_de', idadeTitular)

  if (acomodacaoPreferida) {
    query = query.eq('acomodacao', acomodacaoPreferida)
  }

  const { data: planos, error } = await query

  if (error) {
    console.error('❌ Erro ao buscar planos:', error.message)
    return []
  }
  if (!planos) return []

  // plan_cities pode ter mais de uma linha por plano/cidade (tipo: comercializacao/atendimento),
  // o que duplica o plano no resultado do join — deduplicar por id do plano
  const porId = new Map()
  for (const p of planos) {
    if (!porId.has(p.id)) porId.set(p.id, p)
  }

  const resultado = Array.from(porId.values()).map(p => {
    const precoTitular = p.plano_faixas_etarias?.[0]?.valor || 0
    let precoTotal = precoTitular
    for (const dep of dependentes) {
      const faixa = p.plano_faixas_etarias?.find(f => dep.idade >= f.idade_de && dep.idade <= f.idade_ate)
      if (faixa) precoTotal += faixa.valor
    }
    return {
      nome: p.nome,
      operadora: p.operadoras?.nome,
      modalidade: p.modalidade,
      acomodacao: p.acomodacao === 'enfermaria' ? 'Enfermaria' : 'Apartamento',
      copart: p.tem_coparticipacao ? (COPART_LABELS[p.coparticipacao_tipo] || 'Copart') : 'Sem Copart',
      preco: precoTotal,
      administradora: p.administradoras?.nome || null,
    }
  })

  if (operadoraPreferida) {
    const alvo = operadoraPreferida.trim().toLowerCase()
    resultado.sort((a, b) => {
      const aMatch = a.operadora?.toLowerCase().includes(alvo) ? 0 : 1
      const bMatch = b.operadora?.toLowerCase().includes(alvo) ? 0 : 1
      if (aMatch !== bMatch) return aMatch - bMatch
      return a.preco - b.preco
    })
    return resultado
  }

  return resultado.sort((a, b) => a.preco - b.preco)
}

export async function buscarDetalhesPlano({ nomePlano, operadora }) {
  const supabase = getClient()

  let query = supabase
    .from('planos')
    .select(`
      id, nome, modalidade,
      tem_coparticipacao, coparticipacao_tipo, coparticipacao_detalhe,
      carencia_consulta, carencia_exame_simples, carencia_exame_complexo,
      carencia_internacao, carencia_cirurgia, carencia_obstetricia,
      carencia_urgencia_horas, carencia_doenca_preexistente,
      tem_isencao_carencia, isencao_carencia_detalhe,
      rede_resumo, rede_url,
      operadoras!inner(nome)
    `)
    .ilike('nome', `%${nomePlano}%`)
    .eq('ativo', true)
    .limit(1)

  if (operadora) {
    query = query.ilike('operadoras.nome', `%${operadora}%`)
  }

  const { data: planos, error } = await query

  if (error) {
    console.error('❌ Erro ao buscar detalhes do plano:', error.message)
    return null
  }
  if (!planos || planos.length === 0) return null

  const plano = planos[0]

  const [{ data: carenciasDetalhe }, { data: copartDetalhe }, { data: regrasPf }, { data: regrasPj }, { data: rede }] = await Promise.all([
    supabase.from('plan_carencias').select('procedimento, dias, condicao, observacao').eq('plano_id', plano.id),
    supabase.from('plan_coparticipacao').select('servico, tipo_copart, valor_fixo, percentual, valor_maximo, faixa_preco, observacao').eq('plano_id', plano.id),
    supabase.from('plan_regras_pf').select('tipo_beneficiario, documentos, observacao').eq('plano_id', plano.id),
    supabase.from('plan_regras_pj').select('docs_empresa, docs_funcionario, meses_minimos_cnpj, observacao').eq('plano_id', plano.id),
    supabase.from('plano_rede_hospitais').select('nome, tipo, cidade').eq('plano_id', plano.id).limit(10)
  ])

  return {
    nome: plano.nome,
    operadora: plano.operadoras?.nome,
    carencias: {
      consulta_dias: plano.carencia_consulta,
      exame_simples_dias: plano.carencia_exame_simples,
      exame_complexo_dias: plano.carencia_exame_complexo,
      internacao_dias: plano.carencia_internacao,
      cirurgia_dias: plano.carencia_cirurgia,
      obstetricia_dias: plano.carencia_obstetricia,
      urgencia_horas: plano.carencia_urgencia_horas,
      doenca_preexistente_dias: plano.carencia_doenca_preexistente,
      tem_isencao: plano.tem_isencao_carencia,
      isencao_detalhe: plano.isencao_carencia_detalhe,
      detalhes_por_procedimento: carenciasDetalhe || []
    },
    coparticipacao: {
      tem: plano.tem_coparticipacao,
      tipo: plano.coparticipacao_tipo,
      detalhe: plano.coparticipacao_detalhe,
      detalhes_por_servico: copartDetalhe || []
    },
    documentos: {
      pf: regrasPf || [],
      pj: regrasPj || []
    },
    rede: {
      resumo: plano.rede_resumo,
      url: plano.rede_url,
      hospitais_exemplo: rede || []
    }
  }
}
