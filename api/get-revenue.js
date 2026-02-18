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

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-indexed
    const day = now.getDate();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();

    const daysInMonth = getDaysInMonth(year, month);
    const secondsToday = (hours * 3600) + (minutes * 60) + seconds;
    const secondsInMonth = ((day - 1) * 86400) + secondsToday;

    // === Expenses (1,080,000 SAR/month) ===
    const expPerSecond = MONTHLY_EXPENSES / (daysInMonth * 86400);
    const expensesToday = expPerSecond * secondsToday;
    const expensesMonth = expPerSecond * secondsInMonth;

    let expensesYear = 0;
    for (let m = 0; m < month; m++) {
      expensesYear += MONTHLY_EXPENSES;
    }
    expensesYear += expensesMonth;

    // === Revenue (same logic - distributed per second like expenses) ===
    const currentMonthKey = year + '-' + String(month + 1).padStart(2, '0');
    const currentMonthRevenue = months[currentMonthKey] || 0;

    // Revenue per second for current month
    const revPerSecond = currentMonthRevenue / (daysInMonth * 86400);

    // Today's revenue (ticks per second like expenses)
    const revenueToday = revPerSecond * secondsToday;

    // Month to date
    const revenueMonth = revPerSecond * secondsInMonth;

    // Year to date: past months full + current month partial
    let revenueYear = 0;
    for (const [key, amount] of Object.entries(months)) {
      const parts = key.split('-');
      const y = parseInt(parts[0]);
      const m = parseInt(parts[1]) - 1;
      if (y === year) {
        if (m < month) {
          revenueYear += amount; // past months: full amount
        } else if (m === month) {
          revenueYear += revenueMonth; // current month: distributed
        }
      }
    }

    return res.status(200).json({
      serverTime: now.toISOString(),
      year: year,
      month: month + 1,
      day: day,
      daysInMonth: daysInMonth,

      // Expenses
      expensesToday: expensesToday,
      expensesMonth: expensesMonth,
      expensesYear: expensesYear,
      expPerSecond: expPerSecond,

      // Revenue (now also ticks per second)
      revenueToday: revenueToday,
      revenueMonth: revenueMonth,
      revenueYear: revenueYear,
      revPerSecond: revPerSecond,

      // Raw data for admin
      months: months
    });
  } catch (error) {
    console.error('Redis error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
};
