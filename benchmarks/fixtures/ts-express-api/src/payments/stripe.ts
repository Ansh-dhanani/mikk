import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder')

export async function createPaymentIntent(amount: number, currency: string, userId: string): Promise<string> {
  if (amount <= 0) throw new Error('Amount must be positive')
  
  const intent = await stripe.paymentIntents.create({
    amount: Math.round(amount * 100),
    currency: currency.toLowerCase(),
    metadata: { userId },
  })
  return intent.client_secret!
}

export async function confirmPayment(paymentIntentId: string): Promise<boolean> {
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId)
  return intent.status === 'succeeded'
}

export async function refundPayment(paymentIntentId: string, amount?: number): Promise<string> {
  const refund = await stripe.refunds.create({
    payment_intent: paymentIntentId,
    ...(amount ? { amount: Math.round(amount * 100) } : {}),
  })
  return refund.id
}

export async function createCustomer(email: string, name: string): Promise<string> {
  const customer = await stripe.customers.create({ email, name })
  return customer.id
}
