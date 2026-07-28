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
