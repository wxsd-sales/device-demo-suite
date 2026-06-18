require('dotenv').config();
const { connectMongo, getDb, closeMongo } = require('../../shared/mongo');

async function reset() {
  await connectMongo(
    process.env.MONGODB_URI || 'mongodb://localhost:27017',
    process.env.MONGODB_DB || 'energy-solutions-demos',
  );
  const db = await getDb();
  const [events, devices] = await Promise.all([
    db.collection('telemetry_events').deleteMany({}),
    db.collection('telemetry_devices').deleteMany({}),
  ]);
  console.log(`Deleted ${events.deletedCount} telemetry events, ${devices.deletedCount} device snapshots`);
  await closeMongo();
}

reset().catch((err) => {
  console.error(err);
  process.exit(1);
});
