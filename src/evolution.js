import axios from 'axios'
import FormData from 'form-data'

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
  const form = new FormData()
  form.append('number', numero)
  form.append('caption', `📄 Proposta de cotação — ${nomeCliente}`)
  form.append('document', pdfBuffer, {
    filename: `Cotacao_${nomeCliente.replace(/\s+/g,'_')}.pdf`,
    contentType: 'application/pdf'
  })

  await api.post(`/message/sendMedia/${INSTANCE}`, form, {
    headers: form.getHeaders()
  })
}

export async function marcarLido(numero, messageId) {
  try {
    await api.post(`/message/markMessageAsRead/${INSTANCE}`, {
      readMessages: [{ remoteJid: `${numero}@s.whatsapp.net`, id: messageId }]
    })
  } catch {}
}
