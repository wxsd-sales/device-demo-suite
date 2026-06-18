require('dotenv').config();
const express = require('express');
const path = require('path');
const { ObjectId } = require('mongodb');
const { connectMongo, getDb } = require('../../shared/mongo');

const PORT = process.env.PORT || 3001;
const app = express();

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function generateTicketId() {
  const num = Math.floor(100000 + Math.random() * 900000);
  return `INC${num}`;
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', demo: 'ticket-automation' });
});

app.post('/api/tickets', async (req, res) => {
  try {
    const db = await getDb();
    const payload = req.body || {};
    const ticket = {
      ticketId: generateTicketId(),
      status: 'open',
      priority: 'medium',
      source: 'room-device',
      category: payload.category || 'Uncategorized',
      description: payload.name || payload.category || '',
      reporterName: payload.name || null,
      device: payload.identification || {},
      bookingId: payload.bookingId || null,
      callDetails: payload.callDetails || null,
      conferenceDetails: payload.conferenceDetails || null,
      rawPayload: payload,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.collection('tickets').insertOne(ticket);
    res.status(201).json({ ticketId: ticket.ticketId, status: ticket.status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create ticket' });
  }
});

app.get('/api/tickets', async (_req, res) => {
  try {
    const db = await getDb();
    const tickets = await db.collection('tickets')
      .find({})
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();
    res.json(tickets);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list tickets' });
  }
});

app.patch('/api/tickets/:id', async (req, res) => {
  try {
    const db = await getDb();
    const { status } = req.body || {};
    const allowed = ['open', 'acknowledged', 'resolved'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const filter = ObjectId.isValid(req.params.id)
      ? { _id: new ObjectId(req.params.id) }
      : { ticketId: req.params.id };

    const result = await db.collection('tickets').findOneAndUpdate(
      filter,
      { $set: { status, updatedAt: new Date() } },
      { returnDocument: 'after' },
    );

    if (!result) return res.status(404).json({ error: 'Ticket not found' });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update ticket' });
  }
});

app.delete('/api/tickets', async (_req, res) => {
  try {
    const db = await getDb();
    const result = await db.collection('tickets').deleteMany({});
    res.json({ deleted: result.deletedCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reset tickets' });
  }
});

async function start() {
  await connectMongo(
    process.env.MONGODB_URI || 'mongodb://localhost:27017',
    process.env.MONGODB_DB || 'energy-solutions-demos',
  );

  app.listen(PORT, () => {
    console.log(`Demo 01 Ticket Automation running at http://localhost:${PORT}`);
    console.log(`Fake Helix UI: http://localhost:${PORT}/`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
