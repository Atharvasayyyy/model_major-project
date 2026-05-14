require('dotenv').config({ path: './backend/.env' });
const mongoose = require('./backend/node_modules/mongoose');

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    const result = await mongoose.connection.db.collection('activitysessions').deleteMany({});
    console.log(`Deleted ${result.deletedCount} activitysession document(s).`);
    const remaining = await mongoose.connection.db.collection('activitysessions').countDocuments();
    console.log(`Remaining documents: ${remaining}`);
    process.exit(0);
  })
  .catch(err => { console.error('Error:', err.message); process.exit(1); });
