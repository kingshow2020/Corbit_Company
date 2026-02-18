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

    // === Expenses (1,080,000 SAR/month) ===

    // Seconds elapsed today
    const secondsToday = (hours * 3600) + (minutes * 60) + seconds;

    // Expenses per second this month
    const expPerSecond = MONTHLY_EXPENSES / (daysInMonth * 86400);

    // Today's expenses so far
    const expensesToday = expPerSecond * secondsToday;

    // Month to date: (full days passed) + today's partial
    const secondsMonth = ((day - 1) * 86400) + secondsToday;
    const expensesMonth = expPerSecond * secondsMonth;

    // Year to date: all past months (full) + current month partial
    let expensesYear = 0;
    for (let m = 0; m < month; m++) {
      expensesYear += MONTHLY_EXPENSES; // each past month = full 1,080,000
    }
    expensesYear += expensesMonth;

    // === Revenue ===

    const currentMonthKey = year + '-' + String(month + 1).padStart(2, '0');
    const currentMonthRevenue = months[currentMonthKey] || 0;
    const dailyRevenue = currentMonthRevenue / daysInMonth;

    // Today
    const revenueToday = dailyRevenue;

    // Month to date
    const revenueMonth = dailyRevenue * day;

    // Year to date
    let revenueYear = 0;
    for (const [key, amount] of Object.entries(months)) {
      const parts = key.split('-');
      const y = parseInt(parts[0]);
      const m = parseInt(parts[1]) - 1;
      if (y === year) {
        if (m < month) {
          revenueYear += amount; // past months: full
        } else if (m === month) {
          revenueYear += dailyRevenue * day; // current month: partial
        }
      }
    }

    return res.status(200).json({
      // Server time
      serverTime: now.toISOString(),
      year: year,
      month: month + 1,
      day: day,
      daysInMonth: daysInMonth,

      // Expenses (snapshot + rate for local animation)
      expensesToday: expensesToday,
      expensesMonth: expensesMonth,
      expensesYear: expensesYear,
      expPerSecond: expPerSecond,

      // Revenue
      revenueToday: revenueToday,
      revenueMonth: revenueMonth,
      revenueYear: revenueYear,

      // Raw data for admin
      months: months
    });
  } catch (error) {
    console.error('Redis error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
};
