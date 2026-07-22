import { getCorretorByWhatsapp } from './supabase.js'
import { processarMensagem } from './agente.js'
import { gerarPDFWhitelabel } from './pdf.js'
import { enviarTexto, enviarPDF, marcarLido } from './evolution.js'

export async function handleWebhook(req, res) {
  res.sendStatus(200) // Responder imediatamente para a Evolution API

  try {
    const body = req.body
    if (!body?.data?.message) return

    const { key, message } = body.data
    const numero = key?.remoteJid?.replace('@s.whatsapp.net','')
    if (!numero || key?.fromMe) return

    // Pegar texto da mensagem
    const texto = message?.conversation || message?.extendedTextMessage?.text || ''
    if (!texto.trim()) return

    console.log(`📨 Mensagem de ${numero}: ${texto}`)

    // Marcar como lido
    if (key?.id) await marcarLido(numero, key.id)

    // Verificar se corretor está autorizado
    const corretor = await getCorretorByWhatsapp(numero)
    if (!corretor) {
      await enviarTexto(numero,
        `⛔ *Número não autorizado*\n\n` +
        `Seu número não está cadastrado no sistema Quotis.\n` +
        `Solicite ao seu gestor que cadastre seu WhatsApp no sistema.\n\n` +
        `📞 Suporte: suporte@quotis.app`
      )
      return
    }

    console.log(`✅ Corretor autorizado: ${corretor.nome} | Corretora: ${corretor.corretoras?.nome}`)

    // Processar mensagem com IA
    const resultado = await processarMensagem({
      numero,
      mensagem: texto,
      corretor
    })

    if (resultado.tipo === 'texto') {
      await enviarTexto(numero, resultado.conteudo)
    }

    if (resultado.tipo === 'pdf') {
      await enviarTexto(numero, '⏳ Gerando seu PDF personalizado...')

      const { cotacao } = resultado
      const corretora = corretor.corretoras

      const pdfBuffer = await gerarPDFWhitelabel({
        cliente: cotacao.cliente,
        planos: cotacao.planos,
        corretor,
        corretora
      })

      await enviarPDF(numero, pdfBuffer, cotacao.cliente.nome || 'cliente')
      await enviarTexto(numero,
        `✅ PDF enviado com a marca da *${corretora?.nome || 'sua corretora'}*!\n\n` +
        `Encaminhe para seu cliente. 📲`
      )
    }

  } catch (err) {
    console.error('❌ Erro no webhook:', err)
  }
}
