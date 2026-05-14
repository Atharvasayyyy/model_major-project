require('dotenv').config({ path: './backend/.env' });
const mongoose = require('./backend/node_modules/mongoose');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const Child = require('./backend/src/models/Child');
  const User  = require('./backend/src/models/User');

  const user  = await User.findOne();
  const child = await Child.findOne({ parent_id: user._id });

  console.log('user_id:', String(user._id));
  console.log('email:', user.email);
  console.log('child_id:', String(child._id));
  console.log('child_name:', child.child_name);
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
