import express from 'express'
import cors from 'cors'
import { MongoClient, ObjectId } from 'mongodb'

const app = express()
const port = Number(process.env.PORT || 3001)

app.use(cors())
app.use(express.json())

let mongoClient = null

const seededAccounts = [
  { username: 'u1', name: 'Pottie', password: 'Poison6', role: 'admin' },
  { username: 'u2', name: 'Lizele', password: 'LizPot996', role: 'admin' },
  { username: 'u3', name: 'Danelle', password: '@143', role: 'member' },
  { username: 'u4', name: 'Suzelle', password: '5192', role: 'member' },
]

async function getDb() {
  const uri = process.env.MONGODB_URI || process.env.RIDGEWAY_MONGODB_URI
  const dbName = process.env.MONGODB_DB || process.env.RIDGEWAY_MONGODB_DB || 'ridgeway-mansion'

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

async function ensureUsersSeeded(db) {
  const usersCollection = db.collection('users')
  for (const account of seededAccounts) {
    await usersCollection.updateOne(
      { username: account.username },
      { $setOnInsert: { ...account, createdAt: Date.now() } },
      { upsert: true },
    )
  }
}

app.get('/health', async (_req, res) => {
  try {
    const db = await getDb()
    await db.command({ ping: 1 })
    res.json({ ok: true, service: 'ridgeway-mansion-api', db: 'connected' })
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
      res.status(400).json({ ok: false, error: 'Username and password are required' })
      return
    }

    const user = await db.collection('users').findOne({ username, password })
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
      })),
    )
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' })
  }
})

app.post('/api/pawn-tickets', async (req, res) => {
  try {
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

    const db = await getDb()
    const result = await db.collection('pawn_tickets').insertOne({
      shopName,
      pawnedDate,
      returnDate: returnDate || null,
      totalRepayAmount,
      items,
      createdAt: Date.now(),
    })
    res.status(201).json({ ok: true, _id: String(result.insertedId) })
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' })
  }
})

app.get('/api/meters', async (_req, res) => {
  try {
    const db = await getDb()
    const meters = await db.collection('meters').find({}).sort({ createdAt: -1 }).toArray()
    res.json(meters.map(serializeId))
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' })
  }
})

app.post('/api/meters', async (req, res) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
    const meterNumber = typeof req.body?.meterNumber === 'string' ? req.body.meterNumber.trim() : ''
    if (!name) {
      res.status(400).json({ ok: false, error: 'Meter name is required' })
      return
    }
    const db = await getDb()
    const result = await db.collection('meters').insertOne({ name, meterNumber, createdAt: Date.now() })
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
    res.json(transactions.map(serializeId))
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
    if (!meterId) {
      res.status(400).json({ ok: false, error: 'Meter is required' })
      return
    }
    const db = await getDb()
    const result = await db.collection('meter_transactions').insertOne({
      meterId,
      amount,
      units,
      date,
      createdAt: Date.now(),
    })
    res.status(201).json({ ok: true, _id: String(result.insertedId) })
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
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
    if (!name) {
      res.status(400).json({ ok: false, error: 'Category name is required' })
      return
    }
    const db = await getDb()
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
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : ''
    const assignedToUserId = typeof req.body?.assignedToUserId === 'string' ? req.body.assignedToUserId : ''
    const assignedDays = Array.isArray(req.body?.assignedDays)
      ? req.body.assignedDays.filter((day) => typeof day === 'string')
      : []
    if (!title || !assignedToUserId || assignedDays.length === 0) {
      res.status(400).json({ ok: false, error: 'Title, assignee and at least one day are required' })
      return
    }
    const db = await getDb()
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
    const updates = {}
    if (typeof req.body?.completed === 'boolean') updates.completed = req.body.completed
    if (Array.isArray(req.body?.assignedDays)) {
      updates.assignedDays = req.body.assignedDays.filter((day) => typeof day === 'string')
    }
    const db = await getDb()
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
