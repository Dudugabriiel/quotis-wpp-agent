import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

// Buscar corretor pelo número de WhatsApp
export async function getCorretorByWhatsapp(numero) {
  const numLimpo = numero.replace(/\D/g, '').replace(/^55/, '')
  const { data } = await supabase
    .from('corretores')
    .select('*, corretoras(id, nome, logo_url, cor_primaria, cor_secundaria, cor_acento, telefone, email)')
    .or(`whatsapp.eq.${numLimpo},whatsapp.eq.55${numLimpo},whatsapp.eq.+55${numLimpo}`)
    .single()
  return data || null
}

// Buscar planos disponíveis para cotação
export async function buscarPlanos({ cidade, idadeTitular, tipo, profissao, dependentes = [] }) {
  const modalidades = tipo === 'PF'
    ? ['individual_familiar', 'adesao']
    : ['empresarial_pme']

  const { data: planos } = await supabase
    .from('planos')
    .select(`
      id, nome, modalidade, acomodacao,
      coparticipacao_consultas, coparticipacao_exames,
      coparticipacao_pa, coparticipacao_internacao,
      carencia_urgencia, carencia_consultas,
      carencia_internacao, carencia_parto,
      administradora, profissoes_elegiveis,
      operadoras!inner(nome),
      plano_cidades!inner(cidade),
      plano_precos!inner(idade_min, idade_max, preco)
    `)
    .in('modalidade', modalidades)
    .eq('ativo', true)
    .eq('plano_cidades.cidade', cidade)
    .gte('plano_precos.idade_max', idadeTitular)
    .lte('plano_precos.idade_min', idadeTitular)

  if (!planos) return []

  // Calcular preço total com dependentes
  return planos.map(p => {
    const precoTitular = p.plano_precos?.[0]?.preco || 0
    let precoTotal = precoTitular

    for (const dep of dependentes) {
      const faixa = p.plano_precos?.find(f => dep.idade >= f.idade_min && dep.idade <= f.idade_max)
      if (faixa) precoTotal += faixa.preco
    }

    const cp = []
    if (p.coparticipacao_consultas) cp.push('Consultas')
    if (p.coparticipacao_exames) cp.push('Exames')
    const copart = cp.length === 0 ? 'Sem Copart' : cp.join(' + ')

    return {
      nome: p.nome,
      operadora: p.operadoras?.nome,
      modalidade: p.modalidade,
      acomodacao: p.acomodacao === 'enfermaria' ? 'Enfermaria' : 'Apartamento',
      copart,
      precoTitular,
      precoTotal,
      administradora: p.administradora || null,
    }
  }).sort((a, b) => a.precoTotal - b.precoTotal)
}
