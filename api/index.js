import express from 'express'
import cors from 'cors'
import { MongoClient } from 'mongodb'

const app = express()
const port = Number(process.env.PORT || 3001)

app.use(cors())
app.use(express.json())

let mongoClient = null

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

app.get('/api/items', async (_req, res) => {
  try {
    const db = await getDb()
    const items = await db.collection('items').find({}).sort({ createdAt: -1 }).limit(50).toArray()
    res.json(
      items.map((item) => ({
        _id: String(item._id),
        title: typeof item.title === 'string' ? item.title : 'Untitled',
        createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
      })),
    )
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

app.post('/api/items', async (req, res) => {
  try {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : ''
    if (!title) {
      res.status(400).json({ ok: false, error: 'Title is required' })
      return
    }

    const db = await getDb()
    const createdAt = Date.now()
    const result = await db.collection('items').insertOne({ title, createdAt })
    res.status(201).json({ ok: true, _id: String(result.insertedId), title, createdAt })
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
