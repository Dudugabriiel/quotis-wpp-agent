import express from 'express'
import dotenv from 'dotenv'
import { handleWebhook } from './webhook.js'

dotenv.config()

const app = express()
app.use(express.json())

app.get('/', (req, res) => res.json({ status: 'Quotis WPP Agent online' }))
app.post('/webhook', handleWebhook)

const PORT = process.env.PORT || 3000
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Quotis WPP Agent rodando na porta ${PORT}`))
