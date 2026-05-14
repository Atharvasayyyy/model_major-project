require('dotenv').config({ path: './backend/.env' });
const mongoose = require('./backend/node_modules/mongoose');

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    // Force model registration
    const SensorData = require('./backend/src/models/SensorData');
    // syncIndexes() will create any declared indexes that are missing in Atlas
    await SensorData.syncIndexes();
    const indexes = await SensorData.collection.getIndexes();
    console.log('\nCurrent indexes on sensordatas:');
    console.log(JSON.stringify(indexes, null, 2));
    process.exit(0);
  })
  .catch(err => {
    console.error('Connection error:', err.message);
    process.exit(1);
  });
