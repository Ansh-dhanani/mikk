import { createPaymentIntent, confirmPayment, refundPayment } from './stripe'
import { findUserById } from '../users/repository'   

export interface Invoice {
  id: string
  userId: string
  amount: number
  currency: string
  status: 'pending' | 'paid' | 'refunded'
  createdAt: Date
}

const invoices = new Map<string, Invoice>()

export async function createInvoice(userId: string, amount: number, currency = 'usd'): Promise<Invoice> {
  const user = await findUserById(userId)
  if (!user) throw new Error('User not found')
  
  const invoice: Invoice = {
    id: crypto.randomUUID(),
    userId,
    amount,
    currency,
    status: 'pending',
    createdAt: new Date(),
  }
  invoices.set(invoice.id, invoice)
  return invoice
}

export async function chargeInvoice(invoiceId: string): Promise<string> {
  const invoice = invoices.get(invoiceId)
  if (!invoice) throw new Error('Invoice not found')
  if (invoice.status !== 'pending') throw new Error('Invoice already processed')
  
  const clientSecret = await createPaymentIntent(invoice.amount, invoice.currency, invoice.userId)
  return clientSecret
}

export async function markInvoicePaid(invoiceId: string, paymentIntentId: string): Promise<void> {
  const confirmed = await confirmPayment(paymentIntentId)
  if (!confirmed) throw new Error('Payment not confirmed')
  
  const invoice = invoices.get(invoiceId)
  if (invoice) {
    invoice.status = 'paid'
    invoices.set(invoiceId, invoice)
  }
}

export async function refundInvoice(invoiceId: string): Promise<void> {
  const invoice = invoices.get(invoiceId)
  if (!invoice) throw new Error('Invoice not found')
  if (invoice.status !== 'paid') throw new Error('Can only refund paid invoices')
  
  await refundPayment(invoiceId)
  invoice.status = 'refunded'
  invoices.set(invoiceId, invoice)
}
