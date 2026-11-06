// server/server.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const wasteRoutes = require('./routes/wasteRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Explicit CORS configuration for Frontend (Vite 5173 / CRA 3000)
app.use(
  cors({
    origin: [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  })
);
app.use(express.json());

// Main API Routes
app.use('/api', wasteRoutes);

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'SariRaga Backend API', port: PORT });
});

app.listen(PORT, () => {
  console.log(`[SariRaga Backend] Server running on http://localhost:${PORT}`);
});
