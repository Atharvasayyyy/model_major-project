require('dotenv').config();
const mongoose = require('mongoose');

async function test() {
  console.log('MONGO_URI from env:', process.env.MONGO_URI ? '✅ loaded' : '❌ MISSING');
  console.log('Connecting to:', process.env.MONGO_URI?.replace(/:[^:@]+@/, ':****@'));

  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
    console.log('✅ Connected to MongoDB Atlas');

    const TestSchema = new mongoose.Schema({ name: String, ts: Date });
    const Test = mongoose.model('AtlasTest', TestSchema);

    const doc = await Test.create({ name: 'hello-from-test-script', ts: new Date() });
    console.log('✅ Inserted document with _id:', doc._id);

    const count = await Test.countDocuments();
    console.log('✅ Total AtlasTest documents in DB:', count);

    await mongoose.disconnect();
    console.log('✅ Disconnected cleanly');
    process.exit(0);
  } catch (err) {
    console.error('❌ Connection/write failed:', err.message);
    process.exit(1);
  }
}

test();
