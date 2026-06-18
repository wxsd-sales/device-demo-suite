require('dotenv').config();
const { connectMongo, getDb, closeMongo } = require('../../shared/mongo');

async function reset() {
  await connectMongo(
    process.env.MONGODB_URI || 'mongodb://localhost:27017',
    process.env.MONGODB_DB || 'energy-solutions-demos',
  );
  const db = await getDb();
  const result = await db.collection('tickets').deleteMany({});
  console.log(`Deleted ${result.deletedCount} tickets`);
  await closeMongo();
}

reset().catch((err) => {
  console.error(err);
  process.exit(1);
});
