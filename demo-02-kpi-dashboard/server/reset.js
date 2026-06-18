require('dotenv').config();
const { connectMongo, getDb, closeMongo } = require('../../shared/mongo');

async function reset() {
  await connectMongo(
    process.env.MONGODB_URI || 'mongodb://localhost:27017',
    process.env.MONGODB_DB || 'energy-solutions-demos',
  );
  const db = await getDb();
  const events = await db.collection('workspace_events').deleteMany({});
  const state = await db.collection('workspace_state').deleteMany({});
  const catalog = await db.collection('workspace_catalog').deleteMany({});
  const legacy = await db.collection('metric_snapshots').deleteMany({});
  console.log(`Deleted ${events.deletedCount} events, ${state.deletedCount} states, ${catalog.deletedCount} catalog entries, ${legacy.deletedCount} legacy snapshots`);
  await closeMongo();
}

reset().catch((err) => {
  console.error(err);
  process.exit(1);
});
