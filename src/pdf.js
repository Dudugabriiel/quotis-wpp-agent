import PDFDocument from 'pdfkit'
import { Readable } from 'stream'

function hexToRgb(hex) {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '#1565C0')
  return r ? [parseInt(r[1],16), parseInt(r[2],16), parseInt(r[3],16)] : [21,101,192]
}

export async function gerarPDFWhitelabel({ cliente, planos, corretor, corretora }) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40 })
      const chunks = []
      doc.on('data', chunk => chunks.push(chunk))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      const P = hexToRgb(corretora?.cor_primaria)
      const PD = hexToRgb(corretora?.cor_secundaria)

      // ── CABEÇALHO ──────────────────────────────────
      doc.rect(0, 0, 595, 80).fill(`rgb(${PD[0]},${PD[1]},${PD[2]})`)

      // Logo ou nome da corretora
      if (corretora?.logo_url) {
        try {
          const resp = await fetch(corretora.logo_url)
          const buf = Buffer.from(await resp.arrayBuffer())
          doc.image(buf, 40, 15, { height: 50 })
        } catch {
          doc.fillColor('white').fontSize(20).font('Helvetica-Bold')
             .text(corretora?.nome || 'Quotis', 40, 25)
        }
      } else {
        doc.fillColor('white').fontSize(20).font('Helvetica-Bold')
           .text(corretora?.nome || 'Quotis', 40, 25)
        doc.fillColor('#00BCD4').fontSize(10).font('Helvetica')
           .text('Saúde Regional', 40, 50)
      }

      // Info cotação
      doc.fillColor('white').fontSize(8).font('Helvetica')
         .text('PROPOSTA DE COTAÇÃO', 300, 20, { align: 'right', width: 255 })
      doc.fontSize(13).font('Helvetica-Bold')
         .text(`Nº ${Math.floor(Math.random()*90000)+10000}`, 300, 32, { align: 'right', width: 255 })
      doc.fontSize(8).font('Helvetica')
         .text(new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'}), 300, 46, { align: 'right', width: 255 })

      // Corretor
      if (corretor?.nome) {
        doc.fillColor('white').fontSize(8).font('Helvetica')
           .text(`Corretor: ${corretor.nome}`, 300, 60, { align: 'right', width: 255 })
      }

      // Faixa acento
      doc.rect(0, 80, 595, 14).fill(`rgb(${P[0]},${P[1]},${P[2]})`)
      doc.fillColor('white').fontSize(8).font('Helvetica-Bold')
         .text('COMPARATIVO DE PLANOS DE SAÚDE — Vale do Paraíba · SP', 40, 85)

      let y = 115

      // ── BENEFICIÁRIO ────────────────────────────────
      doc.fillColor(`rgb(${PD[0]},${PD[1]},${PD[2]})`).fontSize(10).font('Helvetica-Bold')
         .text('BENEFICIÁRIO', 40, y)
      doc.moveTo(40, y+14).lineTo(555, y+14).lineWidth(1).stroke(`rgb(${P[0]},${P[1]},${P[2]})`)
      y += 22

      const campos = [
        ['Nome', cliente?.nome || '—'],
        ['Cidade', cliente?.cidade || '—'],
        ['Tipo', 'Pessoa Física'],
        ['Profissão', cliente?.profissao || '—'],
        ['Idade', cliente?.idade ? `${cliente.idade} anos` : '—'],
        ['Dependentes', (parseInt(cliente?.deps)||0) > 0 ? `${cliente.deps} dependente(s)` : 'Sem dependentes'],
      ]

      const cw = 245
      campos.forEach(([lb, vl], i) => {
        const cx = 40 + (i%2)*(cw+20)
        const cy = y + Math.floor(i/2)*28
        doc.rect(cx, cy-2, cw, 22).fill('#F1F5F9')
        doc.fillColor('#64748B').fontSize(7).font('Helvetica').text(lb, cx+4, cy+2)
        doc.fillColor('#0F172A').fontSize(9).font('Helvetica-Bold').text(String(vl).slice(0,40), cx+4, cy+10)
      })
      y += Math.ceil(campos.length/2)*28 + 16

      // ── PLANOS ──────────────────────────────────────
      doc.fillColor(`rgb(${PD[0]},${PD[1]},${PD[2]})`).fontSize(10).font('Helvetica-Bold')
         .text('PLANOS COTADOS', 40, y)
      doc.moveTo(40, y+14).lineTo(555, y+14).lineWidth(1).stroke(`rgb(${P[0]},${P[1]},${P[2]})`)
      y += 22

      const numP = Math.min(planos.length, 3)
      const colW = (515 - (numP-1)*8) / numP

      planos.slice(0,3).forEach((plano, idx) => {
        const px = 40 + idx*(colW+8)
        const isD = idx === 0

        // Fundo card
        doc.rect(px, y, colW, 120)
           .fill(isD ? '#EBF4FE' : '#FAFCFF')
           .stroke(isD ? `rgb(${P[0]},${P[1]},${P[2]})` : '#E2E8F0')

        // Header card
        doc.rect(px, y, colW, 16)
           .fill(isD ? `rgb(${P[0]},${P[1]},${P[2]})` : '#F1F5F9')
        doc.fillColor(isD ? 'white' : '#64748B').fontSize(7).font('Helvetica-Bold')
           .text(isD ? '★ RECOMENDADO' : `OPÇÃO ${idx+1}`, px, y+5, { width: colW, align: 'center' })

        // Operadora
        doc.fillColor('#64748B').fontSize(7).font('Helvetica')
           .text(plano.operadora || '—', px, y+22, { width: colW, align: 'center' })

        // Nome plano
        doc.fillColor(isD ? `rgb(${PD[0]},${PD[1]},${PD[2]})` : '#0F172A')
           .fontSize(8).font('Helvetica-Bold')
           .text(plano.nome || '—', px+4, y+34, { width: colW-8, align: 'center' })

        // Linha
        doc.moveTo(px+8, y+55).lineTo(px+colW-8, y+55).lineWidth(0.5).stroke('#E2E8F0')

        // Preço
        doc.fillColor('#64748B').fontSize(6).font('Helvetica')
           .text('MENSALIDADE', px, y+60, { width: colW, align: 'center' })
        const preco = `R$ ${(plano.preco||0).toFixed(2).replace('.',',')}`
        doc.fillColor(`rgb(${P[0]},${P[1]},${P[2]})`).fontSize(14).font('Helvetica-Bold')
           .text(preco, px, y+70, { width: colW, align: 'center' })

        // Badges
        doc.rect(px+4, y+88, colW/2-8, 14).fill('#DBEAFE')
        doc.fillColor(`rgb(${P[0]},${P[1]},${P[2]})`).fontSize(6).font('Helvetica-Bold')
           .text(plano.acomodacao || '—', px+4, y+93, { width: colW/2-8, align: 'center' })

        const semCp = (plano.copart||'').toLowerCase().includes('sem')
        doc.rect(px+colW/2+4, y+88, colW/2-8, 14).fill(semCp ? '#DCFCE7' : '#FEF3C7')
        doc.fillColor(semCp ? '#15803D' : '#92400E').fontSize(6).font('Helvetica-Bold')
           .text(plano.copart || '—', px+colW/2+4, y+93, { width: colW/2-8, align: 'center' })
      })

      y += 136

      // ── AVISO ───────────────────────────────────────
      if (y < 700) {
        doc.rect(40, y, 515, 30).fill('#FEF9C3').stroke('#EAB308')
        doc.fillColor('#92400E').fontSize(6).font('Helvetica-Bold')
           .text('ATENÇÃO: Valores estimados sujeitos a alteração. Esta cotação não constitui proposta contratual.', 44, y+6, { width: 507 })
        doc.fillColor('#78350F').fontSize(6).font('Helvetica')
           .text('Carências e coparticipações devem ser confirmadas no contrato. Validade: 10 dias.', 44, y+16, { width: 507 })
        y += 36
      }

      // ── RODAPÉ ──────────────────────────────────────
      doc.rect(0, 762, 595, 80).fill(`rgb(${PD[0]},${PD[1]},${PD[2]})`)
      doc.fillColor('white').fontSize(8).font('Helvetica-Bold')
         .text(corretora?.nome || 'Quotis', 40, 772)
      if (corretora?.email) {
        doc.fillColor('#A0C8E8').fontSize(6).font('Helvetica')
           .text(corretora.email, 40, 783)
      }
      doc.fillColor('#A0C8E8').fontSize(6).font('Helvetica')
         .text('Plataforma Quotis · Vale do Paraíba · SP', 200, 772, { align: 'center', width: 195 })
         .text('Valores meramente estimativos', 200, 783, { align: 'center', width: 195 })
      doc.fillColor('#A0C8E8').fontSize(6).font('Helvetica')
         .text('Página 1 de 1', 400, 772, { align: 'right', width: 155 })

      doc.end()
    } catch(e) { reject(e) }
  })
}
