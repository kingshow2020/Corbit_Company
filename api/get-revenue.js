const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const MONTHLY_EXPENSES = 1080000;

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const data = await redis.get('corbitt_revenue');
    const months = (data && data.months) ? data.months : {};

    // Saudi Arabia timezone (UTC+3)
    const utcNow = new Date();
    const now = new Date(utcNow.getTime() + (3 * 60 * 60 * 1000));
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth(); // 0-indexed (Feb = 1)
    const day = now.getUTCDate();
    const hours = now.getUTCHours();
    const minutes = now.getUTCMinutes();
    const seconds = now.getUTCSeconds();

    const daysInMonth = getDaysInMonth(year, month);
    const secondsToday = (hours * 3600) + (minutes * 60) + seconds;
    const secondsInMonth = ((day - 1) * 86400) + secondsToday;

    // The "displayed" month = last month's data shown as current
    const lastMonth = month === 0 ? 11 : month - 1;
    const lastMonthYear = month === 0 ? year - 1 : year;
    const lastMonthKey = lastMonthYear + '-' + String(lastMonth + 1).padStart(2, '0');

    // === EXPENSES (auto - 1,080,000/month) ===
    const expPerSecond = MONTHLY_EXPENSES / (daysInMonth * 86400);
    const expensesToday = expPerSecond * secondsToday;
    const expensesMonth = expPerSecond * secondsInMonth;

    // Year: months BEFORE the displayed month (lastMonth) + current distributed
    let expensesYear = 0;
    for (let m = 0; m < lastMonth; m++) {
      expensesYear += MONTHLY_EXPENSES;
    }
    expensesYear += expensesMonth;

    // === REVENUE (last month's data displayed as current month) ===
    const lastMonthRevenue = months[lastMonthKey] || 0;
    const revPerSecond = lastMonthRevenue / (daysInMonth * 86400);
    const revenueToday = revPerSecond * secondsToday;
    const revenueMonth = revPerSecond * secondsInMonth;

    // Year: months BEFORE the displayed month + current distributed
    let revenueYear = 0;
    for (const [key, amount] of Object.entries(months)) {
      const parts = key.split('-');
      const y = parseInt(parts[0]);
      const m = parseInt(parts[1]) - 1;
      // Only count months in same year AND before the displayed month
      if (y === lastMonthYear && m < lastMonth) {
        revenueYear += amount;
      }
    }
    revenueYear += revenueMonth;

    return res.status(200).json({
      serverTime: now.toISOString(),
      year: year,
      month: month + 1,
      day: day,
      daysInMonth: daysInMonth,

      expensesToday: expensesToday,
      expensesMonth: expensesMonth,
      expensesYear: expensesYear,
      expPerSecond: expPerSecond,

      revenueToday: revenueToday,
      revenueMonth: revenueMonth,
      revenueYear: revenueYear,
      revPerSecond: revPerSecond,

      // For admin page
      months: months
    });
  } catch (error) {
    console.error('Redis error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
};
