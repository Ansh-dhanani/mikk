import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import { createInvoice, chargeInvoice, markInvoicePaid, refundInvoice } from '../payments/billing'

export const paymentsRouter = Router()

paymentsRouter.post('/invoices', requireAuth, async (req, res) => {
  try {
    const { amount, currency } = req.body
    const userId = (req as any).user.userId
    const invoice = await createInvoice(userId, amount, currency)
    res.status(201).json(invoice)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

paymentsRouter.post('/invoices/:id/charge', requireAuth, async (req, res) => {
  try {
    const clientSecret = await chargeInvoice(req.params.id)
    res.json({ clientSecret })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

paymentsRouter.post('/invoices/:id/paid', requireAuth, async (req, res) => {
  try {
    const { paymentIntentId } = req.body
    await markInvoicePaid(req.params.id, paymentIntentId)
    res.json({ message: 'Invoice marked as paid' })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})

paymentsRouter.post('/invoices/:id/refund', requireAuth, requireAdmin, async (req, res) => {
  try {
    await refundInvoice(req.params.id)
    res.json({ message: 'Refund initiated' })
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})
