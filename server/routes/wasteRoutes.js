// server/routes/wasteRoutes.js
const express = require('express');
const router = express.Router();

// GET /api/stats - Return dummy waste classification & valuation stats
router.get('/stats', (req, res) => {
  const dummyStats = {
    status: 'success',
    timestamp: new Date().toISOString(),
    data: {
      totalItems: 69,
      totalWeightKg: 7.11,
      estimatedValueIdr: 18045,
      categories: [
        {
          id: 'botol',
          label: 'Botol',
          count: 42,
          weightKg: 1.26,
          pricePerKgIdr: 4500,
          subtotalIdr: 5670,
        },
        {
          id: 'kardus',
          label: 'Kardus',
          count: 18,
          weightKg: 3.60,
          pricePerKgIdr: 2500,
          subtotalIdr: 9000,
        },
        {
          id: 'kaca',
          label: 'Kaca',
          count: 9,
          weightKg: 2.25,
          pricePerKgIdr: 1500,
          subtotalIdr: 3375,
        },
      ],
    },
  };

  res.status(200).json(dummyStats);
});

module.exports = router;
