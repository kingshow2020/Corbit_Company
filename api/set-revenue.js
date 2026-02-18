const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { type, monthKey, amount } = req.body;

    // Validate type: "revenue" or "expenses"
    if (type !== 'revenue' && type !== 'expenses') {
      return res.status(400).json({ error: 'Invalid type. Use "revenue" or "expenses"' });
    }

    // Validate monthKey format: "YYYY-MM"
    if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) {
      return res.status(400).json({ error: 'Invalid monthKey format. Use YYYY-MM' });
    }

    // Validate amount
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount < 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    // Get existing data
    const data = await redis.get('corbitt_data') || {};
    if (!data.revenue) data.revenue = {};
    if (!data.expenses) data.expenses = {};

    // Set or delete
    if (numAmount === 0) {
      delete data[type][monthKey];
    } else {
      data[type][monthKey] = numAmount;
    }

    // Save
    await redis.set('corbitt_data', data);

    return res.status(200).json({
      success: true,
      revenue: data.revenue,
      expenses: data.expenses
    });
  } catch (error) {
    console.error('Redis error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
};
