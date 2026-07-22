import { jsPDF } from 'jspdf'

function hexToRgb(hex) {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return r ? [parseInt(r[1],16), parseInt(r[2],16), parseInt(r[3],16)] : [21,101,192]
}

export async function gerarPDFWhitelabel({ cliente, planos, corretor, corretora }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = 210, M = 12

  const P  = hexToRgb(corretora?.cor_primaria  || '#1565C0')
  const PD = hexToRgb(corretora?.cor_secundaria || '#0D47A1')
  const AC = hexToRgb(corretora?.cor_acento    || '#00BCD4')
  const BR = [255,255,255]
  const CZ = [100,116,139]
  const PT = [15,23,42]
  const CZL = [241,245,249]

  const sf = (s,st='normal',c=PT) => { doc.setFontSize(s); doc.setFont('helvetica',st); doc.setTextColor(...c) }
  const rf = (x,y,w,h,c,r=0) => { doc.setFillColor(...c); r>0?doc.roundedRect(x,y,w,h,r,r,'F'):doc.rect(x,y,w,h,'F') }
  const tx = (t,x,y,o={}) => doc.text(String(t),x,y,o)
  const ln = (x1,y1,x2,y2,c=CZ,lw=0.25) => { doc.setDrawColor(...c); doc.setLineWidth(lw); doc.line(x1,y1,x2,y2) }

  // Cabeçalho
  rf(0,0,W,46,PD)

  // Logo ou nome da corretora
  if (corretora?.logo_url) {
    try {
      const resp = await fetch(corretora.logo_url)
      const blob = await resp.blob()
      const b64 = await new Promise(res => {
        const reader = new FileReader()
        reader.onloadend = () => res(reader.result)
        reader.readAsDataURL(blob)
      })
      doc.addImage(b64, 'PNG', M, 8, 38, 18, '', 'FAST')
    } catch {
      sf(16,'bold',BR); tx(corretora.nome||'Quotis', M, 20)
    }
  } else {
    sf(16,'bold',BR); tx(corretora?.nome||'Quotis', M, 20)
    sf(8,'normal',AC); tx('Saúde Regional', M, 27)
  }

  // Divisor
  doc.setDrawColor(255,255,255); doc.setLineWidth(0.3)
  doc.line(62,10,62,38)

  // Info cotação
  sf(7,'normal',[180,210,240]); tx('PROPOSTA DE COTAÇÃO', 67,16)
  sf(12,'bold',BR); tx(`Nº ${Date.now().toString().slice(-5)}`, 67,24)
  sf(7,'normal',[180,210,240])
  tx(`Emitida em ${new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'})}`, 67,30)

  // Corretor
  sf(7,'normal',[180,210,240]); tx('Corretor responsável', W-M, 16, {align:'right'})
  sf(9,'bold',BR); tx(corretor?.nome||'—', W-M, 24, {align:'right'})
  sf(6,'normal',[160,200,240]); tx(corretor?.email||'', W-M, 30, {align:'right'})

  // Faixa acento
  rf(0,46,W,7,P)
  sf(7,'bold',BR); tx('COMPARATIVO DE PLANOS DE SAÚDE', M, 51)
  sf(6,'normal',[200,230,255]); tx('Vale do Paraíba · SP', W-M, 51, {align:'right'})

  let y = 62

  // Dados do cliente
  sf(8,'bold',PD); tx('BENEFICIÁRIO', M, y)
  ln(M,y+2,W-M,y+2,P,0.5); y += 8

  const campos = [
    ['Nome', cliente.nome||'—'],
    ['Cidade', cliente.cidade||'—'],
    ['Tipo', 'Pessoa Física'],
    ['Profissão', cliente.profissao||'—'],
    ['Idade', cliente.idade ? `${cliente.idade} anos` : '—'],
    ['Dependentes', cliente.dependentes > 0 ? `${cliente.dependentes} dependente(s)` : 'Sem dependentes'],
  ]

  const cw = (W-M*2-5)/2
  campos.forEach(([lb,vl],i) => {
    const cx = M+(i%2)*(cw+5), cy = y+Math.floor(i/2)*12
    rf(cx,cy-5,cw,10,CZL,2)
    sf(6,'normal',CZ); tx(lb, cx+3, cy-1)
    sf(8,'bold',PT); tx(String(vl).slice(0,35), cx+3, cy+4)
  })
  y += 3*12+6

  // Planos
  sf(8,'bold',PD); tx('PLANOS COTADOS', M, y)
  ln(M,y+2,W-M,y+2,P,0.5); y += 8

  const numP = Math.min(planos.length, 3)
  const colW = (W-M*2-(numP-1)*4)/numP

  planos.slice(0,3).forEach((plano,idx) => {
    const px = M+idx*(colW+4)
    const isD = idx===0

    doc.setDrawColor(...(isD?P:CZL)); doc.setLineWidth(isD?0.8:0.3)
    doc.roundedRect(px,y-2,colW,78,3,3)
    rf(px,y-2,colW,78,isD?[235,244,254]:[250,252,255],3)

    rf(px,y-2,colW,8,isD?P:CZL,3)
    rf(px,y+2,colW,4,isD?P:CZL)
    sf(6,'bold',isD?BR:CZ); tx(isD?'★ RECOMENDADO':`OPÇÃO ${idx+1}`, px+colW/2,y+3,{align:'center'})

    // Badge operadora
    const cx2 = px+colW/2
    const cores = {'hapvida':[0,133,68],'santa casa':[183,28,28],'unimed':[46,125,50],'policlin':[13,71,161],'sao francisco':[74,20,140]}
    const ck = Object.keys(cores).find(k=>(plano.operadora||'').toLowerCase().includes(k))
    doc.setFillColor(...(cores[ck]||P))
    doc.circle(cx2,y+18,8,'F')
    sf(9,'bold',BR); tx((plano.operadora||'?').slice(0,2).toUpperCase(),cx2,y+21,{align:'center'})

    sf(6,'bold',CZ); tx(plano.operadora||'—',cx2,y+30,{align:'center'})
    sf(7,'bold',isD?PD:PT)
    doc.text(doc.splitTextToSize(plano.nome||'—',colW-6).slice(0,2),cx2,y+38,{align:'center'})

    ln(px+4,y+43,px+colW-4,y+43,CZL)
    sf(6,'normal',CZ); tx('MENSALIDADE',cx2,y+49,{align:'center'})
    sf(14,'bold',isD?P:PD); tx(`R$ ${(plano.preco||0).toFixed(2).replace('.',',')}`,cx2,y+58,{align:'center'})

    rf(px+3,y+61,colW/2-5,7,isD?[214,232,254]:CZL,2)
    sf(5.5,'bold',isD?P:CZ); tx(plano.acomodacao||'—',px+colW/4,y+66,{align:'center'})

    const semCp=(plano.copart||'').toLowerCase().includes('sem')
    rf(px+colW/2+2,y+61,colW/2-5,7,semCp?[220,252,231]:[254,243,199],2)
    sf(5.5,'bold',semCp?[21,128,61]:[146,64,14]); tx(plano.copart||'—',px+colW*3/4,y+66,{align:'center'})
  })
  y += 84

  // Rodapé
  rf(0,285,W,12,PD)
  sf(7,'bold',BR); tx(corretora?.nome||'Quotis', M, 291)
  sf(5.5,'normal',[160,200,240]); tx(corretora?.email||'', M, 296)
  sf(6,'normal',[160,200,240]); tx('Plataforma Quotis · Vale do Paraíba · SP', W/2, 291, {align:'center'})
  sf(5.5,'normal',[160,200,240]); tx('Valores estimativos sujeitos a alteração', W/2, 296, {align:'center'})
  sf(7,'normal',[160,200,240]); tx('Página 1 de 1', W-M, 291, {align:'right'})
  if (corretora?.telefone) { sf(5.5,'normal',[160,200,240]); tx(corretora.telefone, W-M, 296, {align:'right'}) }

  return Buffer.from(doc.output('arraybuffer'))
}
