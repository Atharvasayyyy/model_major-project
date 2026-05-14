require('dotenv').config({ path: './backend/.env' });
const mongoose = require('./backend/node_modules/mongoose');

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    const SensorData = require('./backend/src/models/SensorData');

    // Count before
    const beforeCount = await SensorData.countDocuments();
    console.log(`\nTotal documents BEFORE cleanup: ${beforeCount}`);

    // Find corrupt documents first so we can log them
    const corrupt = await SensorData.find({ motion_level: { $gt: 30 } })
      .select('child_id heart_rate hrv_rmssd motion_level timestamp');
    console.log(`\nCorrupt documents (motion_level > 30): ${corrupt.length}`);
    corrupt.forEach(doc => console.log(' ', JSON.stringify(doc)));

    if (corrupt.length === 0) {
      console.log('Nothing to delete.');
      process.exit(0);
    }

    // Delete them
    const result = await SensorData.deleteMany({ motion_level: { $gt: 30 } });
    console.log(`\nDeleted: ${result.deletedCount} document(s)`);

    const afterCount = await SensorData.countDocuments();
    console.log(`Total documents AFTER cleanup: ${afterCount}`);
    process.exit(0);
  })
  .catch(err => {
    console.error('Connection error:', err.message);
    process.exit(1);
  });
