require('dotenv').config({ path: './backend/.env' });
const mongoose = require('./backend/node_modules/mongoose');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const db = mongoose.connection.db;
  const col = db.collection('activitysessions');

  // List current indexes
  const existing = await col.indexes();
  console.log('Current indexes:', JSON.stringify(existing.map(i => ({ name: i.name, key: i.key, unique: i.unique })), null, 2));

  // Drop the stale unique index if it exists
  const stale = existing.find(i => i.name === 'child_id_1' && i.unique);
  if (stale) {
    await col.dropIndex('child_id_1');
    console.log('Dropped stale unique index: child_id_1');
  } else {
    console.log('No stale unique index found — nothing to drop');
  }

  // Recreate correct indexes: compound (child_id + session_active) and (child_id + started_at)
  await col.createIndex({ child_id: 1, session_active: 1 }, { background: true });
  await col.createIndex({ child_id: 1, started_at: -1 }, { background: true });
  console.log('Correct compound indexes created');

  const after = await col.indexes();
  console.log('Indexes after fix:', JSON.stringify(after.map(i => ({ name: i.name, key: i.key, unique: i.unique })), null, 2));

  process.exit(0);
}).catch(err => { console.error('Error:', err.message); process.exit(1); });
