
require('dotenv').config({ path: './backend/.env' });
const mongoose = require('./backend/node_modules/mongoose');
mongoose.connect(process.env.MONGO_URI).then(async () => {
  const ActivitySession = require('./backend/src/models/ActivitySession');
  const count = await ActivitySession.countDocuments({ child_id: '6a05ccb8f25fda65bf935a5d' });
  const docs  = await ActivitySession.find({ child_id: '6a05ccb8f25fda65bf935a5d' }).select('activity session_active').lean();
  console.log('Total sessions for child:', count);
  docs.forEach(d => console.log(' -', d.activity, '| active:', d.session_active));
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
