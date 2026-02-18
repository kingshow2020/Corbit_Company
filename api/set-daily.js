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
    const { date, amount } = req.body;

    // Validate date format YYYY-MM-DD
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    // Validate amount
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount < 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    // Make sure date is not in the future (Saudi timezone UTC+3)
    const utcNow = new Date();
    const now = new Date(utcNow.getTime() + (3 * 60 * 60 * 1000));
    const todayKey = now.getUTCFullYear() + '-' +
      String(now.getUTCMonth() + 1).padStart(2, '0') + '-' +
      String(now.getUTCDate()).padStart(2, '0');

    if (date >= todayKey) {
      return res.status(400).json({ error: 'Cannot enter data for today or future dates' });
    }

    // Read existing daily data
    const data = await redis.get('corbitt_daily') || {};

    if (numAmount === 0) {
      delete data[date];
    } else {
      data[date] = numAmount;
    }

    await redis.set('corbitt_daily', data);

    return res.status(200).json({
      success: true,
      date: date,
      days: data
    });
  } catch (error) {
    console.error('Redis error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
};
