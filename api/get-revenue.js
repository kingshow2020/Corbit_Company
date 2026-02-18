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

    // === EXPENSES (auto - 1,080,000/month) ===
    const expPerSecond = MONTHLY_EXPENSES / (daysInMonth * 86400);
    const expensesToday = expPerSecond * secondsToday;
    const expensesMonth = expPerSecond * secondsInMonth;

    let expensesYear = 0;
    for (let m = 0; m < month; m++) {
      expensesYear += MONTHLY_EXPENSES;
    }
    expensesYear += expensesMonth;

    // === REVENUE (last month's data displayed as current month) ===
    // Employee enters January → Dashboard shows it as February (current)
    const lastMonth = month === 0 ? 11 : month - 1;
    const lastMonthYear = month === 0 ? year - 1 : year;
    const lastMonthKey = lastMonthYear + '-' + String(lastMonth + 1).padStart(2, '0');

    const lastMonthRevenue = months[lastMonthKey] || 0;

    // Distribute last month's revenue across current month's seconds
    const revPerSecond = lastMonthRevenue / (daysInMonth * 86400);
    const revenueToday = revPerSecond * secondsToday;
    const revenueMonth = revPerSecond * secondsInMonth;

    // Year to date: all months before lastMonth (full) + current displayed month
    let revenueYear = 0;
    for (const [key, amount] of Object.entries(months)) {
      const parts = key.split('-');
      const y = parseInt(parts[0]);
      const m = parseInt(parts[1]) - 1; // 0-indexed

      if (y === year && m < lastMonth) {
        // Months before the one being displayed = full amount
        revenueYear += amount;
      } else if (y === lastMonthYear && m === lastMonth) {
        // The month being displayed = distributed as current
        revenueYear += revenueMonth;
      }
      // Handle previous year months if lastMonth is January
      if (y < year) {
        // Don't double count - already handled above
      }
    }

    // If last month is in previous year (e.g., Dec 2025 displayed in Jan 2026)
    // Add all months from previous year except December
    if (month === 0) {
      revenueYear = revenueMonth; // Only current displayed month for new year
      for (const [key, amount] of Object.entries(months)) {
        const parts = key.split('-');
        const y = parseInt(parts[0]);
        const m = parseInt(parts[1]) - 1;
        if (y === year && m < month) {
          revenueYear += amount;
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

      // For admin page
      months: months
    });
  } catch (error) {
    console.error('Redis error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
};
