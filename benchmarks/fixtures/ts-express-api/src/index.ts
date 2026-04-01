import express from 'express'
import { authRouter } from './routes/auth'
import { usersRouter } from './routes/users'
import { paymentsRouter } from './routes/payments'
import { requestLogger } from './middleware/logger'
import { errorHandler } from './middleware/error-handler'
import { connectDatabase } from './db/connection'

const app = express()
app.use(express.json())
app.use(requestLogger)

app.use('/auth', authRouter)
app.use('/users', usersRouter)
app.use('/payments', paymentsRouter)
app.use(errorHandler)

async function bootstrap() {
  await connectDatabase()
  const port = process.env.PORT || 3000
  app.listen(port, () => {
    console.log(`Server running on port ${port}`)
  })
}

bootstrap().catch(console.error)
