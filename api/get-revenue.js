const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

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
    const data = await redis.get('corbitt_data') || {};
    const revenueMonths = (data.revenue) ? data.revenue : {};
    const expenseMonths = (data.expenses) ? data.expenses : {};

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const day = now.getDate();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();

    const daysInMonth = getDaysInMonth(year, month);
    const secondsToday = (hours * 3600) + (minutes * 60) + seconds;
    const secondsInMonth = ((day - 1) * 86400) + secondsToday;

    const currentMonthKey = year + '-' + String(month + 1).padStart(2, '0');

    // === Revenue ===
    const currentMonthRevenue = revenueMonths[currentMonthKey] || 0;
    const revPerSecond = currentMonthRevenue / (daysInMonth * 86400);
    const revenueToday = revPerSecond * secondsToday;
    const revenueMonth = revPerSecond * secondsInMonth;

    let revenueYear = 0;
    for (const [key, amount] of Object.entries(revenueMonths)) {
      const parts = key.split('-');
      const y = parseInt(parts[0]);
      const m = parseInt(parts[1]) - 1;
      if (y === year) {
        if (m < month) {
          revenueYear += amount;
        } else if (m === month) {
          revenueYear += revenueMonth;
        }
      }
    }

    // === Expenses (same logic - from Redis, not fixed) ===
    const currentMonthExpenses = expenseMonths[currentMonthKey] || 0;
    const expPerSecond = currentMonthExpenses / (daysInMonth * 86400);
    const expensesToday = expPerSecond * secondsToday;
    const expensesMonth = expPerSecond * secondsInMonth;

    let expensesYear = 0;
    for (const [key, amount] of Object.entries(expenseMonths)) {
      const parts = key.split('-');
      const y = parseInt(parts[0]);
      const m = parseInt(parts[1]) - 1;
      if (y === year) {
        if (m < month) {
          expensesYear += amount;
        } else if (m === month) {
          expensesYear += expensesMonth;
        }
      }
    }

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

      // Raw data for admin
      revenue: revenueMonths,
      expenses: expenseMonths
    });
  } catch (error) {
    console.error('Redis error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
};
