import axios from 'axios'

const api = axios.create({
  baseURL: process.env.EVOLUTION_URL,
  headers: { 'apikey': process.env.EVOLUTION_API_KEY }
})

const INSTANCE = process.env.EVOLUTION_INSTANCE || 'quotis'

export async function enviarTexto(numero, mensagem) {
  await api.post(`/message/sendText/${INSTANCE}`, {
    number: numero,
    text: mensagem
  })
}

export async function enviarPDF(numero, pdfBuffer, nomeCliente) {
  await api.post(`/message/sendMedia/${INSTANCE}`, {
    number: numero,
    mediatype: 'document',
    mimetype: 'application/pdf',
    caption: `📄 Proposta de cotação — ${nomeCliente}`,
    media: pdfBuffer.toString('base64'),
    fileName: `Cotacao_${nomeCliente.replace(/\s+/g,'_')}.pdf`
  })
}

export async function marcarLido(numero, messageId) {
  try {
    await api.post(`/message/markMessageAsRead/${INSTANCE}`, {
      readMessages: [{ remoteJid: `${numero}@s.whatsapp.net`, id: messageId }]
    })
  } catch {}
}
