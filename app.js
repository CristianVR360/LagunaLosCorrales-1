require('dotenv').config();
const Server = require('./src/models/server');

const server = new Server();

// Start listener only if run directly and not in a serverless context
if (!process.env.VERCEL && require.main === module) {
  server.listen();
}

module.exports = server.app;

