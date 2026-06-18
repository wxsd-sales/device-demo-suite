const { MongoClient } = require('mongodb');

let client = null;
let db = null;

async function connectMongo(uri, dbName) {
  if (db) return db;

  client = new MongoClient(uri);
  await client.connect();
  db = client.db(dbName);
  return db;
}

async function getDb() {
  if (!db) {
    throw new Error('MongoDB not connected. Call connectMongo first.');
  }
  return db;
}

async function closeMongo() {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}

module.exports = { connectMongo, getDb, closeMongo };
