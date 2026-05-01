import express from 'express'
import cors from 'cors'
import { MongoClient, ObjectId } from 'mongodb'

const app = express()
const port = Number(process.env.PORT || 3001)

app.use(cors())
app.use(express.json())

let mongoClient = null

const seededAccounts = [
  { username: 'u1', name: 'Pottie', password: 'Pottie996', role: 'admin' },
  { username: 'u2', name: 'Lizele', password: 'LizPot996', role: 'admin' },
  { username: 'u3', name: 'Danelle', password: '@143', role: 'member' },
  { username: 'u4', name: 'Suzelle', password: '2304', role: 'member' },
]

async function getDb() {
  const uri = process.env.MONGODB_URI || process.env.RIDGEWAY_MONGODB_URI
  const dbName = process.env.MONGODB_DB || process.env.RIDGEWAY_MONGODB_DB || 'RidgewayMansion'

  if (!uri) {
    throw new Error('Missing MONGODB_URI (or RIDGEWAY_MONGODB_URI)')
  }

  if (!mongoClient) {
    mongoClient = new MongoClient(uri)
    await mongoClient.connect()
  }

  return mongoClient.db(dbName)
}

function toId(value) {
  try {
    return new ObjectId(value)
  } catch {
    return null
  }
}

function serializeId(doc) {
  return { ...doc, _id: String(doc._id) }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function startOfDayMs(ts) {
  const d = new Date(Number(ts))
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function addCalendarDaysMs(ms, n) {
  const d = new Date(startOfDayMs(ms))
  d.setDate(d.getDate() + n)
  return d.getTime()
}

async function ensureUsersSeeded(db) {
  const usersCollection = db.collection('users')
  for (const account of seededAccounts) {
    await usersCollection.updateOne(
      { username: account.username },
      { $set: account, $setOnInsert: { createdAt: Date.now() } },
      { upsert: true },
    )
  }
}

async function getRequestUser(db, req) {
  await ensureUsersSeeded(db)
  const userId = req.body?.userId || req.query?.userId || req.headers['x-user-id']
  const id = typeof userId === 'string' ? toId(userId) : null
  if (!id) return null

  return await db.collection('users').findOne({ _id: id })
}

function isAdmin(user) {
  return user?.role === 'admin'
}

function sendForbidden(res) {
  res.status(403).json({ ok: false, error: 'You do not have permission for this action' })
}

app.get('/health', async (_req, res) => {
  try {
    const db = await getDb()
    await db.command({ ping: 1 })
    res.json({
      ok: true,
      service: 'ridgeway-mansion-api',
      db: 'connected',
      database: db.databaseName,
    })
  } catch (error) {
    res.status(500).json({
      ok: false,
      service: 'ridgeway-mansion-api',
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

app.post('/api/auth/login', async (req, res) => {
  try {
    const db = await getDb()
    await ensureUsersSeeded(db)

    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : ''
    const password = typeof req.body?.password === 'string' ? req.body.password : ''
    if (!username || !password) {
      res.status(400).json({ ok: false, error: 'Name and password are required' })
      return
    }

    const user = await db.collection('users').findOne({
      password,
      $or: [
        { username: username.toLowerCase() },
        { name: { $regex: `^${escapeRegex(username)}$`, $options: 'i' } },
      ],
    })
    if (!user) {
      res.status(401).json({ ok: false, error: 'Invalid credentials' })
      return
    }

    res.json({
      ok: true,
      user: {
        _id: String(user._id),
        username: user.username,
        name: user.name,
        role: user.role,
      },
    })
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

app.get('/api/users', async (_req, res) => {
  try {
    const db = await getDb()
    await ensureUsersSeeded(db)
    const users = await db.collection('users').find({}).sort({ username: 1 }).toArray()
    res.json(
      users.map((user) => ({
        _id: String(user._id),
        username: user.username,
        name: user.name,
        role: user.role,
      })),
    )
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' })
  }
})

app.get('/api/pawn-tickets', async (_req, res) => {
  try {
    const db = await getDb()
    const tickets = await db.collection('pawn_tickets').find({}).sort({ pawnedDate: -1 }).toArray()
    res.json(
      tickets.map((ticket) => ({
        ...serializeId(ticket),
        pawnedDate: ticket.pawnedDate ?? null,
        returnDate: ticket.returnDate ?? null,
        totalRepayAmount: ticket.totalRepayAmount ?? 0,
        items: Array.isArray(ticket.items) ? ticket.items : [],
        status: ticket.status || 'open',
        collectedAt: ticket.collectedAt ?? null,
        lostAt: ticket.lostAt ?? null,
        extendedAt: ticket.extendedAt ?? null,
        extendedToTicketId: ticket.extendedToTicketId ? String(ticket.extendedToTicketId) : null,
        extendedFromTicketId: ticket.extendedFromTicketId ? String(ticket.extendedFromTicketId) : null,
        priority: Math.min(5, Math.max(1, Math.round(Number(ticket.priority)) || 3)),
      })),
    )
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' })
  }
})

app.post('/api/pawn-tickets', async (req, res) => {
  try {
    const db = await getDb()
    const user = await getRequestUser(db, req)
    if (!isAdmin(user)) {
      sendForbidden(res)
      return
    }

    const shopName = typeof req.body?.shopName === 'string' ? req.body.shopName.trim() : ''
    const pawnedDate = Number(req.body?.pawnedDate || Date.now())
    const returnDate = Number(req.body?.returnDate || 0)
    const totalRepayAmount = Number(req.body?.totalRepayAmount || 0)
    const itemsInput = Array.isArray(req.body?.items) ? req.body.items : []
    const items = itemsInput
      .map((item) => ({
        description: typeof item?.description === 'string' ? item.description.trim() : '',
        amountReceived: Number(item?.amountReceived || 0),
      }))
      .filter((item) => item.description.length > 0)

    if (!shopName || items.length === 0) {
      res.status(400).json({ ok: false, error: 'Shop name and at least one item are required' })
      return
    }

    const priority = Math.min(5, Math.max(1, Math.round(Number(req.body?.priority)) || 3))

    const result = await db.collection('pawn_tickets').insertOne({
      shopName,
      pawnedDate,
      returnDate: returnDate || null,
      totalRepayAmount,
      items,
      status: 'open',
      priority,
      createdAt: Date.now(),
    })
    res.status(201).json({ ok: true, _id: String(result.insertedId) })
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' })
  }
})

app.patch('/api/pawn-tickets/:id', async (req, res) => {
  try {
    const db = await getDb()
    const user = await getRequestUser(db, req)
    if (!isAdmin(user)) {
      sendForbidden(res)
      return
    }

    const id = toId(req.params.id)
    if (!id) {
      res.status(400).json({ ok: false, error: 'Invalid id' })
      return
    }

    const ticket = await db.collection('pawn_tickets').findOne({ _id: id })
    if (!ticket) {
      res.status(404).json({ ok: false, error: 'Ticket not found' })
      return
    }

    if (req.body && typeof req.body.priority === 'number' && !Number.isNaN(req.body.priority)) {
      const p = Math.min(5, Math.max(1, Math.round(req.body.priority)))
      await db.collection('pawn_tickets').updateOne({ _id: id }, { $set: { priority: p } })
      res.json({ ok: true })
      return
    }

    const currentStatus = ticket.status || 'open'
    if (currentStatus !== 'open') {
      res.status(400).json({ ok: false, error: 'This ticket is already closed' })
      return
    }

    const action = typeof req.body?.action === 'string' ? req.body.action : ''

    if (action === 'lost') {
      await db.collection('pawn_tickets').updateOne({ _id: id }, { $set: { status: 'lost', lostAt: Date.now() } })
      res.json({ ok: true })
      return
    }

    if (action === 'collect') {
      const collectedAt = Number(req.body?.collectedAt || Date.now())
      await db.collection('pawn_tickets').updateOne(
        { _id: id },
        { $set: { status: 'collected', collectedAt } },
      )
      res.json({ ok: true })
      return
    }

    if (action === 'extend') {
      const ext = Number(req.body?.extendedDate)
      if (!ext || Number.isNaN(ext)) {
        res.status(400).json({ ok: false, error: 'extendedDate is required' })
        return
      }
      const pawned = startOfDayMs(ext)
      const ret = addCalendarDaysMs(pawned, 30)
      const items = Array.isArray(ticket.items) ? ticket.items : []
      const carryPriority = Math.min(5, Math.max(1, Math.round(Number(ticket.priority)) || 3))
      const insertResult = await db.collection('pawn_tickets').insertOne({
        shopName: ticket.shopName,
        pawnedDate: pawned,
        returnDate: ret,
        totalRepayAmount: Number(ticket.totalRepayAmount || 0),
        items,
        status: 'open',
        priority: carryPriority,
        extendedFromTicketId: id,
        createdAt: Date.now(),
      })
      await db.collection('pawn_tickets').updateOne(
        { _id: id },
        {
          $set: {
            status: 'extended',
            extendedAt: Date.now(),
            extendedToTicketId: insertResult.insertedId,
          },
        },
      )
      res.json({ ok: true, newTicketId: String(insertResult.insertedId) })
      return
    }

    res.status(400).json({ ok: false, error: 'Invalid action' })
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' })
  }
})

app.delete('/api/pawn-tickets/:id', async (req, res) => {
  try {
    const db = await getDb()
    const user = await getRequestUser(db, req)
    if (!isAdmin(user)) {
      sendForbidden(res)
      return
    }

    const id = toId(req.params.id)
    if (!id) {
      res.status(400).json({ ok: false, error: 'Invalid id' })
      return
    }

    const result = await db.collection('pawn_tickets').deleteOne({ _id: id })
    if (result.deletedCount === 0) {
      res.status(404).json({ ok: false, error: 'Ticket not found' })
      return
    }

    res.json({ ok: true })
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' })
  }
})

app.get('/api/pawn-shops', async (_req, res) => {
  try {
    const db = await getDb()
    const shops = await db.collection('pawn_shops').find({}).sort({ createdAt: 1, _id: 1 }).toArray()
    res.json(
      shops.map((shop) => ({
        _id: String(shop._id),
        name: shop.name,
      })),
    )
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' })
  }
})

app.post('/api/pawn-shops', async (req, res) => {
  try {
    const db = await getDb()
    const user = await getRequestUser(db, req)
    if (!isAdmin(user)) {
      sendForbidden(res)
      return
    }

    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
    if (!name) {
      res.status(400).json({ ok: false, error: 'Shop name is required' })
      return
    }

    const existing = await db.collection('pawn_shops').findOne({
      name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' },
    })
    if (existing) {
      res.json({ ok: true, _id: String(existing._id), duplicate: true })
      return
    }

    const result = await db.collection('pawn_shops').insertOne({ name, createdAt: Date.now() })
    res.status(201).json({ ok: true, _id: String(result.insertedId) })
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' })
  }
})

app.get('/api/meters', async (_req, res) => {
  try {
    const db = await getDb()
    const meters = await db.collection('meters').find({}).sort({ createdAt: -1 }).toArray()
    res.json(
      meters.map((meter) => ({
        ...serializeId(meter),
        meterType: meter.meterType === 'water' ? 'water' : 'power',
      })),
    )
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' })
  }
})

app.post('/api/meters', async (req, res) => {
  try {
    const db = await getDb()
    const user = await getRequestUser(db, req)
    if (!isAdmin(user)) {
      sendForbidden(res)
      return
    }

    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
    const meterNumber = typeof req.body?.meterNumber === 'string' ? req.body.meterNumber.trim() : ''
    const meterType = req.body?.meterType === 'water' ? 'water' : 'power'
    if (!name) {
      res.status(400).json({ ok: false, error: 'Meter name is required' })
      return
    }
    const result = await db.collection('meters').insertOne({ name, meterNumber, meterType, createdAt: Date.now() })
    res.status(201).json({ ok: true, _id: String(result.insertedId) })
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' })
  }
})

app.get('/api/meter-transactions', async (req, res) => {
  try {
    const meterId = typeof req.query?.meterId === 'string' ? req.query.meterId : ''
    const db = await getDb()
    const filter = meterId ? { meterId } : {}
    const transactions = await db.collection('meter_transactions').find(filter).sort({ date: -1 }).toArray()
    res.json(
      transactions.map((doc) => {
        const row = serializeId(doc)
        const readingRaw = doc.reading
        const reading =
          readingRaw !== undefined && readingRaw !== null && readingRaw !== ''
            ? Number(readingRaw)
            : null
        return {
          ...row,
          reading: Number.isFinite(reading) ? reading : null,
          entryType: doc.entryType === 'reading' ? 'reading' : 'load',
        }
      }),
    )
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' })
  }
})

app.post('/api/meter-transactions', async (req, res) => {
  try {
    const meterId = typeof req.body?.meterId === 'string' ? req.body.meterId.trim() : ''
    const amount = Number(req.body?.amount || 0)
    const units = Number(req.body?.units || 0)
    const date = Number(req.body?.date || Date.now())
    const entryType = req.body?.entryType === 'reading' ? 'reading' : 'load'
    const readingRaw = req.body?.reading
    let reading = null
    if (readingRaw !== undefined && readingRaw !== null && readingRaw !== '') {
      const n = Number(readingRaw)
      reading = Number.isFinite(n) ? n : null
    }
    if (!meterId) {
      res.status(400).json({ ok: false, error: 'Meter is required' })
      return
    }
    if (entryType === 'reading' && reading === null) {
      res.status(400).json({ ok: false, error: 'Reading is required for a reading entry' })
      return
    }
    if (entryType === 'load') {
      if (reading === null) {
        res.status(400).json({ ok: false, error: 'Reading is required for a load entry' })
        return
      }
      if (!Number.isFinite(amount) || !Number.isFinite(units)) {
        res.status(400).json({ ok: false, error: 'Amount and units are required for a load entry' })
        return
      }
    }
    const db = await getDb()
    const result = await db.collection('meter_transactions').insertOne({
      meterId,
      createdByUserId: req.body?.userId || null,
      amount,
      units,
      date,
      reading,
      entryType,
      createdAt: Date.now(),
    })
    res.status(201).json({ ok: true, _id: String(result.insertedId) })
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' })
  }
})

app.patch('/api/meter-transactions/:id', async (req, res) => {
  try {
    const id = toId(req.params.id)
    if (!id) {
      res.status(400).json({ ok: false, error: 'Invalid id' })
      return
    }
    const db = await getDb()
    const existing = await db.collection('meter_transactions').findOne({ _id: id })
    if (!existing) {
      res.status(404).json({ ok: false, error: 'Transaction not found' })
      return
    }

    const patch = {}
    if (typeof req.body?.meterId === 'string' && req.body.meterId.trim()) {
      patch.meterId = req.body.meterId.trim()
    }
    if (typeof req.body?.amount === 'number' && !Number.isNaN(req.body.amount)) {
      patch.amount = req.body.amount
    }
    if (typeof req.body?.units === 'number' && !Number.isNaN(req.body.units)) {
      patch.units = req.body.units
    }
    if (typeof req.body?.date === 'number' && !Number.isNaN(req.body.date)) {
      patch.date = req.body.date
    }
    if (req.body?.entryType === 'reading') {
      patch.entryType = 'reading'
    } else if (req.body?.entryType === 'load') {
      patch.entryType = 'load'
    }
    if (req.body?.reading !== undefined) {
      const raw = req.body.reading
      if (raw === null || raw === '') {
        patch.reading = null
      } else {
        const n = Number(raw)
        patch.reading = Number.isFinite(n) ? n : null
      }
    }

    if (Object.keys(patch).length === 0) {
      res.status(400).json({ ok: false, error: 'Nothing to update' })
      return
    }

    const merged = { ...existing, ...patch }
    const et = merged.entryType === 'reading' ? 'reading' : 'load'
    const rd =
      merged.reading !== undefined && merged.reading !== null && merged.reading !== ''
        ? Number(merged.reading)
        : null
    const reading = Number.isFinite(rd) ? rd : null
    if (et === 'reading' && reading === null) {
      res.status(400).json({ ok: false, error: 'Reading is required for a reading entry' })
      return
    }
    if (et === 'load') {
      if (reading === null) {
        res.status(400).json({ ok: false, error: 'Reading is required for a load entry' })
        return
      }
      const am = Number(merged.amount)
      const un = Number(merged.units)
      if (!Number.isFinite(am) || !Number.isFinite(un)) {
        res.status(400).json({ ok: false, error: 'Amount and units are required for a load entry' })
        return
      }
    }

    await db.collection('meter_transactions').updateOne({ _id: id }, { $set: patch })
    res.json({ ok: true })
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' })
  }
})

app.delete('/api/meter-transactions/:id', async (req, res) => {
  try {
    const id = toId(req.params.id)
    if (!id) {
      res.status(400).json({ ok: false, error: 'Invalid id' })
      return
    }
    const db = await getDb()
    const result = await db.collection('meter_transactions').deleteOne({ _id: id })
    if (result.deletedCount === 0) {
      res.status(404).json({ ok: false, error: 'Transaction not found' })
      return
    }
    res.json({ ok: true })
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' })
  }
})

app.get('/api/shop-categories', async (_req, res) => {
  try {
    const db = await getDb()
    const categories = await db.collection('shop_categories').find({}).sort({ name: 1 }).toArray()
    res.json(categories.map(serializeId))
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' })
  }
})

app.post('/api/shop-categories', async (req, res) => {
  try {
    const db = await getDb()
    const user = await getRequestUser(db, req)
    if (!isAdmin(user)) {
      sendForbidden(res)
      return
    }

    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
    if (!name) {
      res.status(400).json({ ok: false, error: 'Category name is required' })
      return
    }
    const result = await db.collection('shop_categories').insertOne({ name, createdAt: Date.now() })
    res.status(201).json({ ok: true, _id: String(result.insertedId) })
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' })
  }
})

app.get('/api/shop-items', async (_req, res) => {
  try {
    const db = await getDb()
    const items = await db.collection('shop_items').find({}).sort({ createdAt: -1 }).toArray()
    res.json(
      items.map((item) => ({
        ...serializeId(item),
        priority: item.priority || 'yellow',
        reminderAt: item.reminderAt ?? null,
      })),
    )
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' })
  }
})

app.post('/api/shop-items', async (req, res) => {
  try {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : ''
    const categoryId = typeof req.body?.categoryId === 'string' ? req.body.categoryId : ''
    const priority = ['green', 'yellow', 'red'].includes(req.body?.priority) ? req.body.priority : 'yellow'
    const reminderAt = req.body?.reminderAt ? Number(req.body.reminderAt) : null
    if (!title || !categoryId) {
      res.status(400).json({ ok: false, error: 'Title and category are required' })
      return
    }
    const db = await getDb()
    const result = await db.collection('shop_items').insertOne({
      title,
      createdByUserId: req.body?.userId || null,
      categoryId,
      priority,
      reminderAt,
      purchased: false,
      createdAt: Date.now(),
    })
    res.status(201).json({ ok: true, _id: String(result.insertedId) })
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' })
  }
})

app.patch('/api/shop-items/:id', async (req, res) => {
  try {
    const id = toId(req.params.id)
    if (!id) {
      res.status(400).json({ ok: false, error: 'Invalid id' })
      return
    }
    const updates = {}
    if (typeof req.body?.priority === 'string' && ['green', 'yellow', 'red'].includes(req.body.priority)) {
      updates.priority = req.body.priority
    }
    if (typeof req.body?.purchased === 'boolean') updates.purchased = req.body.purchased
    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'reminderAt')) {
      updates.reminderAt = req.body.reminderAt ? Number(req.body.reminderAt) : null
    }
    const db = await getDb()
    await db.collection('shop_items').updateOne({ _id: id }, { $set: updates })
    res.json({ ok: true })
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' })
  }
})

app.get('/api/chores', async (_req, res) => {
  try {
    const db = await getDb()
    const chores = await db.collection('chores').find({}).sort({ createdAt: -1 }).toArray()
    res.json(
      chores.map((chore) => ({
        ...serializeId(chore),
        assignedDays: Array.isArray(chore.assignedDays) ? chore.assignedDays : [],
      })),
    )
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' })
  }
})

app.post('/api/chores', async (req, res) => {
  try {
    const db = await getDb()
    const user = await getRequestUser(db, req)
    if (!isAdmin(user)) {
      sendForbidden(res)
      return
    }

    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : ''
    const assignedToUserId = typeof req.body?.assignedToUserId === 'string' ? req.body.assignedToUserId : ''
    const assignedDays = Array.isArray(req.body?.assignedDays)
      ? req.body.assignedDays.filter((day) => typeof day === 'string')
      : []
    if (!title || !assignedToUserId || assignedDays.length === 0) {
      res.status(400).json({ ok: false, error: 'Title, assignee and at least one day are required' })
      return
    }
    const result = await db.collection('chores').insertOne({
      title,
      assignedToUserId,
      assignedDays,
      completed: false,
      createdAt: Date.now(),
    })
    res.status(201).json({ ok: true, _id: String(result.insertedId) })
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' })
  }
})

app.patch('/api/chores/:id', async (req, res) => {
  try {
    const id = toId(req.params.id)
    if (!id) {
      res.status(400).json({ ok: false, error: 'Invalid id' })
      return
    }
    const db = await getDb()
    const user = await getRequestUser(db, req)
    if (!user) {
      sendForbidden(res)
      return
    }

    const chore = await db.collection('chores').findOne({ _id: id })
    if (!chore) {
      res.status(404).json({ ok: false, error: 'Chore not found' })
      return
    }

    const updates = {}
    if (typeof req.body?.completed === 'boolean') updates.completed = req.body.completed
    if (Array.isArray(req.body?.assignedDays) && isAdmin(user)) {
      updates.assignedDays = req.body.assignedDays.filter((day) => typeof day === 'string')
    }
    if (!isAdmin(user) && chore.assignedToUserId !== String(user._id)) {
      sendForbidden(res)
      return
    }

    await db.collection('chores').updateOne({ _id: id }, { $set: updates })
    res.json({ ok: true })
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

app.listen(port, () => {
  console.log(`API listening on port ${port}`)
})
