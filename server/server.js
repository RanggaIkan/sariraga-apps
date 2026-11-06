// server/server.js
// Local Core API (Express). Mounts the exact same handlers that run as Vercel Functions
// in client/api/, so local and deployed behaviour is identical.
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');

const PORT = process.env.PORT || 5000;

async function start() {
  const { default: detections } = await import('../client/api/detections.js');
  const { default: stats } = await import('../client/api/stats.js');
  const { default: health } = await import('../client/api/health.js');
  const { storageMode } = await import('../client/api/_lib/waste.js');

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.all('/api/detections', detections);
  app.get('/api/stats', stats);
  app.get(['/health', '/api/health'], health);

  app.listen(PORT, () => {
    console.log(`[SariRaga Core API] http://localhost:${PORT} (storage: ${storageMode})`);
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
