<repository_context>
  <name>ts-express-api</name>
  <stats>
    <files>20</files>
    <functions>51</functions>
    <modules>7</modules>
    <language>typescript</language>
  </stats>
</repository_context>

<modules>
  <module id="mikk-test-ts-express-api-auth">
    <name>Authentication</name>
    <location>c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/auth/**</location>
    <purpose>3 files, 0 functions</purpose>
    <entry_points>
      <function signature="signToken(payload) [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/auth/jwt.ts:12]" purpose="Sign token (payload)" />
      <function signature="verifyToken(token) [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/auth/jwt.ts:16]" purpose="Verify token (token)" />
      <function signature="decodeToken(token) [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/auth/jwt.ts:24]" purpose="Decode token (token)" />
      <function signature="refreshToken(token) [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/auth/jwt.ts:32]" purpose="Refresh token (token)" />
      <function signature="async hashPassword(plain) [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/auth/password.ts:5]" purpose="Hash password (plain)" />
    </entry_points>
  </module>
  <module id="mikk-test-ts-express-api-db">
    <name>Database & Components</name>
    <location>c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/db/**</location>
    <purpose>1 files, 0 functions</purpose>
    <entry_points>
      <function signature="async connectDatabase() [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/db/connection.ts:3]" purpose="Connect database" />
      <function signature="isConnected() [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/db/connection.ts:11]" purpose="Check if connected" />
      <function signature="async disconnectDatabase() [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/db/connection.ts:15]" purpose="Disconnect database" />
    </entry_points>
  </module>
  <module id="mikk-test-ts-express-api-payments">
    <name>Payments</name>
    <location>c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/payments/**</location>
    <purpose>2 files, 0 functions</purpose>
    <entry_points>
      <function signature="async createInvoice(userId, amount, currency) [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/payments/billing.ts:15]" purpose="Create invoice (userId, amount, currency)" />
      <function signature="async chargeInvoice(invoiceId) [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/payments/billing.ts:31]" purpose="Charge invoice (invoiceId)" />
      <function signature="async markInvoicePaid(invoiceId, paymentIntentId) [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/payments/billing.ts:40]" purpose="Mark invoice paid (invoiceId, paymentIntentId)" />
      <function signature="async refundInvoice(invoiceId) [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/payments/billing.ts:51]" purpose="Refund invoice (invoiceId)" />
      <function signature="async createPaymentIntent(amount, currency, userId) [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/payments/stripe.ts:5]" purpose="Create payment intent (amount, currency, userId)" />
    </entry_points>
  </module>
  <module id="mikk-test-ts-express-api-utils">
    <name>Utils & API</name>
    <location>c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/utils/**</location>
    <purpose>2 files, 0 functions</purpose>
    <entry_points>
      <function signature="checkRateLimit(ip, limit, windowMs) [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/utils/rate-limit.ts:3]" purpose="Check rate limit (ip, limit, windowMs)" />
      <function signature="resetRateLimitForIp(ip) [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/utils/rate-limit.ts:18]" purpose="Reset rate limit for ip (ip)" />
      <function signature="getRateLimitStats() [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/utils/rate-limit.ts:22]" purpose="Get rate limit stats" />
      <function signature="isValidEmail(email) [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/utils/validate.ts:1]" purpose="Check if valid email (email)" />
      <function signature="isValidUuid(id) [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/utils/validate.ts:5]" purpose="Check if valid uuid (id)" />
    </entry_points>
  </module>
  <module id="mikk-test-ts-express-api-users">
    <name>Authentication</name>
    <location>c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/users/**</location>
    <purpose>2 files, 0 functions</purpose>
    <entry_points>
      <function signature="async createUser(email, password, role) [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/users/repository.ts:14]" purpose="Create user (email, password, role)" />
      <function signature="async findUserById(id) [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/users/repository.ts:30]" purpose="Find user by id (id)" />
      <function signature="async findUserByEmail(email) [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/users/repository.ts:34]" purpose="Find user by email (email)" />
      <function signature="async updateUser(id, updates) [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/users/repository.ts:39]" purpose="Update user (id, updates)" />
      <function signature="async deleteUser(id) [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/users/repository.ts:48]" purpose="Delete user (id)" />
    </entry_points>
  </module>
  <module id="web-mikk-test-ts-express-api">
    <name>API</name>
    <location>c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/**</location>
    <purpose>1 files, 0 functions</purpose>
    <entry_points>
      <function signature="async bootstrap() [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/index.ts:18]" purpose="Bootstrap" />
    </entry_points>
  </module>
  <module id="mikk-test-ts-express-api-middleware">
    <name>API</name>
    <location>c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/middleware/**</location>
    <purpose>3 files, 0 functions</purpose>
    <entry_points>
      <function signature="requireAuth(req, res, next) [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/middleware/auth.ts:5]" purpose="Require auth (req, res, next)" />
      <function signature="requireAdmin(req, res, next) [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/middleware/auth.ts:22]" purpose="Require admin (req, res, next)" />
      <function signature="errorHandler(err, req, res, next) [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/middleware/error-handler.ts:3]" purpose="Error handler" />
      <function signature="requestLogger(req, res, next) [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/middleware/logger.ts:3]" purpose="Request logger (req, res, next)" />
    </entry_points>
  </module>
</modules>

## Data Models & Schemas

These files define the project's data structures, schemas, and configuration.
They are auto-discovered and included verbatim from the source.

### `src/routes/auth.ts` (routes)

```typescript
﻿import { Router } from 'express'
import { loginUser, registerUser } from '../users/service'
import { isValidEmail } from '../utils/validate'

export const authRouter = Router()

authRouter.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'Invalid email format' })
      return
    }
    const result = await loginUser(email, password)
    res.json(result)
  } catch (err: any) {
    res.status(401).json({ error: err.message })
  }
})

authRouter.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'Invalid email format' })
      return
    }
    const user = await registerUser(email, password)
    res.status(201).json(user)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})
```

### `src/routes/payments.ts` (routes)

```typescript
﻿import { Router } from 'express'
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
```

### `src/routes/users.ts` (routes)

```typescript
﻿import { Router } from 'express'
import { requireAuth, requireAdmin } from '../middleware/auth'
import { getUserProfile, removeUser, promoteToAdmin } from '../users/service'

export const usersRouter = Router()

usersRouter.get('/me', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user.userId
    const profile = await getUserProfile(userId)
    res.json(profile)
  } catch (err: any) {
    res.status(404).json({ error: err.message })
  }
})

usersRouter.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await removeUser(req.params.id)
    res.status(204).send()
  } catch (err: any) {
    res.status(404).json({ error: err.message })
  }
})

usersRouter.post('/:id/promote', requireAuth, requireAdmin, async (req, res) => {
  try {
    await promoteToAdmin(req.params.id)
    res.json({ message: 'User promoted to admin' })
  } catch (err: any) {
    res.status(404).json({ error: err.message })
  }
})
```

## File Import Graph

Which files import which — useful for understanding data flow.

### unknown
- `C:/Users/Ansh/Desktop/web/mikk-test/ts-express-api/test-ast.js` → `[object Object]`, `[object Object]`

### API
- `C:/Users/Ansh/Desktop/web/mikk-test/ts-express-api/src/index.ts` → `[object Object]`, `[object Object]`, `[object Object]`, `[object Object]`, `[object Object]`, `[object Object]`, `[object Object]`

### Authentication
- `C:/Users/Ansh/Desktop/web/mikk-test/ts-express-api/src/auth/jwt.ts` → `[object Object]`
- `C:/Users/Ansh/Desktop/web/mikk-test/ts-express-api/src/auth/password.ts` → `[object Object]`
- `C:/Users/Ansh/Desktop/web/mikk-test/ts-express-api/src/auth/session.ts` → `[object Object]`

### Payments
- `C:/Users/Ansh/Desktop/web/mikk-test/ts-express-api/src/payments/billing.ts` → `[object Object]`, `[object Object]`
- `C:/Users/Ansh/Desktop/web/mikk-test/ts-express-api/src/payments/stripe.ts` → `[object Object]`

### API
- `C:/Users/Ansh/Desktop/web/mikk-test/ts-express-api/src/routes/auth.ts` → `[object Object]`, `[object Object]`, `[object Object]`
- `C:/Users/Ansh/Desktop/web/mikk-test/ts-express-api/src/routes/payments.ts` → `[object Object]`, `[object Object]`, `[object Object]`
- `C:/Users/Ansh/Desktop/web/mikk-test/ts-express-api/src/routes/users.ts` → `[object Object]`, `[object Object]`, `[object Object]`

### API
- `C:/Users/Ansh/Desktop/web/mikk-test/ts-express-api/src/middleware/auth.ts` → `[object Object]`, `[object Object]`

### Authentication
- `C:/Users/Ansh/Desktop/web/mikk-test/ts-express-api/src/users/repository.ts` → `[object Object]`
- `C:/Users/Ansh/Desktop/web/mikk-test/ts-express-api/src/users/service.ts` → `[object Object]`, `[object Object]`, `[object Object]`, `[object Object]`

## HTTP Routes

- **POST** `/login` → `async (req, res) => { try { const { email, password } = req.body if (!isValidEma...` *(C:/Users/Ansh/Desktop/web/mikk-test/ts-express-api/src/routes/auth.ts:7)*
- **POST** `/register` → `async (req, res) => { try { const { email, password } = req.body if (!isValidEma...` *(C:/Users/Ansh/Desktop/web/mikk-test/ts-express-api/src/routes/auth.ts:21)*
- **POST** `/invoices` → `async (req, res) => { try { const { amount, currency } = req.body const userId =...` → [requireAuth] *(C:/Users/Ansh/Desktop/web/mikk-test/ts-express-api/src/routes/payments.ts:7)*
- **POST** `/invoices/:id/charge` → `async (req, res) => { try { const clientSecret = await chargeInvoice(req.params....` → [requireAuth] *(C:/Users/Ansh/Desktop/web/mikk-test/ts-express-api/src/routes/payments.ts:18)*
- **POST** `/invoices/:id/paid` → `async (req, res) => { try { const { paymentIntentId } = req.body await markInvoi...` → [requireAuth] *(C:/Users/Ansh/Desktop/web/mikk-test/ts-express-api/src/routes/payments.ts:27)*
- **POST** `/invoices/:id/refund` → `async (req, res) => { try { await refundInvoice(req.params.id) res.json({ messag...` → [requireAuth, requireAdmin] *(C:/Users/Ansh/Desktop/web/mikk-test/ts-express-api/src/routes/payments.ts:37)*
- **GET** `/me` → `async (req, res) => { try { const userId = (req as any).user.userId const profil...` → [requireAuth] *(C:/Users/Ansh/Desktop/web/mikk-test/ts-express-api/src/routes/users.ts:7)*
- **DELETE** `/:id` → `async (req, res) => { try { await removeUser(req.params.id) res.status(204).send...` → [requireAuth, requireAdmin] *(C:/Users/Ansh/Desktop/web/mikk-test/ts-express-api/src/routes/users.ts:17)*
- **POST** `/:id/promote` → `async (req, res) => { try { await promoteToAdmin(req.params.id) res.json({ messa...` → [requireAuth, requireAdmin] *(C:/Users/Ansh/Desktop/web/mikk-test/ts-express-api/src/routes/users.ts:26)*

<!-- MIKK-START -->

<repository_context>
  <name>ts-express-api</name>
  <stats>
    <files>20</files>
    <functions>51</functions>
    <modules>8</modules>
    <language>typescript</language>
  </stats>
</repository_context>

<modules>
  <module id="mikk-test-ts-express-api-auth">
    <name>Authentication</name>
    <location>c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/auth/**</location>
    <purpose>4 files, 0 functions</purpose>
    <entry_points>
      <function signature="signToken(payload) [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/auth/jwt.ts:12]" purpose="Sign token (payload)" />
      <function signature="verifyToken(token) [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/auth/jwt.ts:16]" purpose="Verify token (token)" />
      <function signature="decodeToken(token) [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/auth/jwt.ts:24]" purpose="Decode token (token)" />
      <function signature="refreshToken(token) [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/auth/jwt.ts:32]" purpose="Refresh token (token)" />
      <function signature="async hashPassword(plain) [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/auth/password.ts:5]" purpose="Hash password (plain)" />
    </entry_points>
  </module>
  <module id="mikk-test-ts-express-api-cache">
    <name>Caching</name>
    <location>c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/cache/**</location>
    <purpose>1 files, 0 functions</purpose>
    <entry_points>
      <function signature="set(key, value, ttlMs?) [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/cache/memory-cache.ts:11]" purpose="Set (key, value, ttlMs)" />
      <function signature="get(key) [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/cache/memory-cache.ts:21]" purpose="Get (key)" />
      <function signature="invalidate(key) [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/cache/memory-cache.ts:34]" purpose="Invalidate (key)" />
    </entry_points>
  </module>
  <module id="mikk-test-ts-express-api-db">
    <name>Database & Components</name>
    <location>c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/db/**</location>
    <purpose>1 files, 0 functions</purpose>
    <entry_points>
      <function signature="async connectDatabase() [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/db/connection.ts:3]" purpose="Connect database" />
      <function signature="isConnected() [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/db/connection.ts:11]" purpose="Check if connected" />
      <function signature="async disconnectDatabase() [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/db/connection.ts:15]" purpose="Disconnect database" />
    </entry_points>
  </module>
  <module id="mikk-test-ts-express-api-payments">
    <name>Payments</name>
    <location>c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/payments/**</location>
    <purpose>2 files, 0 functions</purpose>
    <entry_points>
      <function signature="async createInvoice(userId, amount, currency) [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/payments/billing.ts:15]" purpose="Create invoice (userId, amount, currency)" />
      <function signature="async chargeInvoice(invoiceId) [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/payments/billing.ts:31]" purpose="Charge invoice (invoiceId)" />
      <function signature="async markInvoicePaid(invoiceId, paymentIntentId) [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/payments/billing.ts:40]" purpose="Mark invoice paid (invoiceId, paymentIntentId)" />
      <function signature="async refundInvoice(invoiceId) [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/payments/billing.ts:51]" purpose="Refund invoice (invoiceId)" />
      <function signature="async createPaymentIntent(amount, currency, userId) [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/payments/stripe.ts:5]" purpose="Create payment intent (amount, currency, userId)" />
    </entry_points>
  </module>
  <module id="mikk-test-ts-express-api-utils">
    <name>Utils & API</name>
    <location>c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/utils/**</location>
    <purpose>2 files, 0 functions</purpose>
    <entry_points>
      <function signature="checkRateLimit(ip, limit, windowMs) [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/utils/rate-limit.ts:3]" purpose="Check rate limit (ip, limit, windowMs)" />
      <function signature="resetRateLimitForIp(ip) [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/utils/rate-limit.ts:18]" purpose="Reset rate limit for ip (ip)" />
      <function signature="getRateLimitStats() [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/utils/rate-limit.ts:22]" purpose="Get rate limit stats" />
      <function signature="isValidEmail(email) [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/utils/validate.ts:1]" purpose="Check if valid email (email)" />
      <function signature="isValidUuid(id) [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/utils/validate.ts:5]" purpose="Check if valid uuid (id)" />
    </entry_points>
  </module>
  <module id="mikk-test-ts-express-api-users">
    <name>Authentication</name>
    <location>c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/users/**</location>
    <purpose>2 files, 0 functions</purpose>
    <entry_points>
      <function signature="async createUser(email, password, role) [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/users/repository.ts:14]" purpose="Create user (email, password, role)" />
      <function signature="async findUserById(id) [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/users/repository.ts:30]" purpose="Find user by id (id)" />
      <function signature="async findUserByEmail(email) [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/users/repository.ts:34]" purpose="Find user by email (email)" />
      <function signature="async updateUser(id, updates) [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/users/repository.ts:39]" purpose="Update user (id, updates)" />
      <function signature="async deleteUser(id) [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/users/repository.ts:48]" purpose="Delete user (id)" />
    </entry_points>
  </module>
  <module id="web-mikk-test-ts-express-api">
    <name>Testing & API</name>
    <location>c:/users/ansh/desktop/web/mikk-test/ts-express-api/**, c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/**</location>
    <purpose>2 files, 0 functions</purpose>
    <entry_points>
      <function signature="async bootstrap() [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/index.ts:18]" purpose="Bootstrap" />
    </entry_points>
  </module>
  <module id="mikk-test-ts-express-api-middleware">
    <name>API</name>
    <location>c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/middleware/**</location>
    <purpose>3 files, 0 functions</purpose>
    <entry_points>
      <function signature="requireAuth(req, res, next) [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/middleware/auth.ts:5]" purpose="Require auth (req, res, next)" />
      <function signature="requireAdmin(req, res, next) [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/middleware/auth.ts:22]" purpose="Require admin (req, res, next)" />
      <function signature="errorHandler(err, req, res, next) [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/middleware/error-handler.ts:3]" purpose="Error handler" />
      <function signature="requestLogger(req, res, next) [c:/users/ansh/desktop/web/mikk-test/ts-express-api/src/middleware/logger.ts:3]" purpose="Request logger (req, res, next)" />
    </entry_points>
  </module>
</modules>

## Data Models & Schemas

These files define the project's data structures, schemas, and configuration.
They are auto-discovered and included verbatim from the source.

### `src/routes/auth.ts` (routes)

```typescript
﻿import { Router } from 'express'
import { loginUser, registerUser } from '../users/service'
import { isValidEmail } from '../utils/validate'

export const authRouter = Router()

authRouter.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'Invalid email format' })
      return
    }
    const result = await loginUser(email, password)
    res.json(result)
  } catch (err: any) {
    res.status(401).json({ error: err.message })
  }
})

authRouter.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'Invalid email format' })
      return
    }
    const user = await registerUser(email, password)
    res.status(201).json(user)
  } catch (err: any) {
    res.status(400).json({ error: err.message })
  }
})
```

### `src/routes/payments.ts` (routes)

```typescript
﻿import { Router } from 'express'
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
```

### `src/routes/users.ts` (routes)

```typescript
﻿import { Router } from 'express'
import { requireAuth, requireAdmin } from '../middleware/auth'
import { getUserProfile, removeUser, promoteToAdmin } from '../users/service'

export const usersRouter = Router()

usersRouter.get('/me', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user.userId
    const profile = await getUserProfile(userId)
    res.json(profile)
  } catch (err: any) {
    res.status(404).json({ error: err.message })
  }
})

usersRouter.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await removeUser(req.params.id)
    res.status(204).send()
  } catch (err: any) {
    res.status(404).json({ error: err.message })
  }
})

usersRouter.post('/:id/promote', requireAuth, requireAdmin, async (req, res) => {
  try {
    await promoteToAdmin(req.params.id)
    res.json({ message: 'User promoted to admin' })
  } catch (err: any) {
    res.status(404).json({ error: err.message })
  }
})
```

## File Import Graph

Which files import which — useful for understanding data flow.

### Testing & API
- `C:/Users/Ansh/Desktop/web/mikk-test/ts-express-api/test-ast.js` → `node:fs`, `oxc-parser`
- `C:/Users/Ansh/Desktop/web/mikk-test/ts-express-api/src/index.ts` → `express`, `./routes/auth`, `./routes/users`, `./routes/payments`, `./middleware/logger`, `./middleware/error-handler`, `./db/connection`

### Authentication
- `C:/Users/Ansh/Desktop/web/mikk-test/ts-express-api/src/auth/jwt.ts` → `jsonwebtoken`
- `C:/Users/Ansh/Desktop/web/mikk-test/ts-express-api/src/auth/password.ts` → `bcrypt`
- `C:/Users/Ansh/Desktop/web/mikk-test/ts-express-api/src/auth/session.ts` → `./jwt`

### Payments
- `C:/Users/Ansh/Desktop/web/mikk-test/ts-express-api/src/payments/billing.ts` → `./stripe`, `../users/repository`
- `C:/Users/Ansh/Desktop/web/mikk-test/ts-express-api/src/payments/stripe.ts` → `stripe`

### API
- `C:/Users/Ansh/Desktop/web/mikk-test/ts-express-api/src/middleware/auth.ts` → `../auth/jwt`, `../auth/session`

### API
- `C:/Users/Ansh/Desktop/web/mikk-test/ts-express-api/src/routes/auth.ts` → `express`, `../users/service`, `../utils/validate`
- `C:/Users/Ansh/Desktop/web/mikk-test/ts-express-api/src/routes/payments.ts` → `express`, `../middleware/auth`, `../payments/billing`
- `C:/Users/Ansh/Desktop/web/mikk-test/ts-express-api/src/routes/users.ts` → `express`, `../middleware/auth`, `../users/service`

### Authentication
- `C:/Users/Ansh/Desktop/web/mikk-test/ts-express-api/src/users/repository.ts` → `../auth/password`
- `C:/Users/Ansh/Desktop/web/mikk-test/ts-express-api/src/users/service.ts` → `./repository`, `../auth/password`, `../auth/jwt`, `../auth/session`

## HTTP Routes

- **POST** `/login` → `async (req, res) => { try { const { email, password } = req.body if (!isValidEma...` *(C:/Users/Ansh/Desktop/web/mikk-test/ts-express-api/src/routes/auth.ts:7)*
- **POST** `/register` → `async (req, res) => { try { const { email, password } = req.body if (!isValidEma...` *(C:/Users/Ansh/Desktop/web/mikk-test/ts-express-api/src/routes/auth.ts:21)*
- **POST** `/invoices` → `async (req, res) => { try { const { amount, currency } = req.body const userId =...` → [requireAuth] *(C:/Users/Ansh/Desktop/web/mikk-test/ts-express-api/src/routes/payments.ts:7)*
- **POST** `/invoices/:id/charge` → `async (req, res) => { try { const clientSecret = await chargeInvoice(req.params....` → [requireAuth] *(C:/Users/Ansh/Desktop/web/mikk-test/ts-express-api/src/routes/payments.ts:18)*
- **POST** `/invoices/:id/paid` → `async (req, res) => { try { const { paymentIntentId } = req.body await markInvoi...` → [requireAuth] *(C:/Users/Ansh/Desktop/web/mikk-test/ts-express-api/src/routes/payments.ts:27)*
- **POST** `/invoices/:id/refund` → `async (req, res) => { try { await refundInvoice(req.params.id) res.json({ messag...` → [requireAuth, requireAdmin] *(C:/Users/Ansh/Desktop/web/mikk-test/ts-express-api/src/routes/payments.ts:37)*
- **GET** `/me` → `async (req, res) => { try { const userId = (req as any).user.userId const profil...` → [requireAuth] *(C:/Users/Ansh/Desktop/web/mikk-test/ts-express-api/src/routes/users.ts:7)*
- **DELETE** `/:id` → `async (req, res) => { try { await removeUser(req.params.id) res.status(204).send...` → [requireAuth, requireAdmin] *(C:/Users/Ansh/Desktop/web/mikk-test/ts-express-api/src/routes/users.ts:17)*
- **POST** `/:id/promote` → `async (req, res) => { try { await promoteToAdmin(req.params.id) res.json({ messa...` → [requireAuth, requireAdmin] *(C:/Users/Ansh/Desktop/web/mikk-test/ts-express-api/src/routes/users.ts:26)*

<!-- MIKK-END -->
