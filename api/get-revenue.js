const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const DEFAULT_MONTHLY_EXPENSES = 1080000;

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
    // Read daily, monthly revenue, and monthly expenses data
    const dailyData = await redis.get('corbitt_daily') || {};
    const monthlyData = await redis.get('corbitt_revenue');
    const months = (monthlyData && monthlyData.months) ? monthlyData.months : {};
    const expensesData = await redis.get('corbitt_expenses') || {};

    // Saudi Arabia timezone (UTC+3)
    const utcNow = new Date();
    const now = new Date(utcNow.getTime() + (3 * 60 * 60 * 1000));
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth(); // 0-indexed
    const day = now.getUTCDate();
    const hours = now.getUTCHours();
    const minutes = now.getUTCMinutes();
    const seconds = now.getUTCSeconds();

    const daysInMonth = getDaysInMonth(year, month);
    const secondsToday = (hours * 3600) + (minutes * 60) + seconds;
    const secondsInMonth = ((day - 1) * 86400) + secondsToday;

    // === EXPENSES (manual per month from Redis, fallback to default) ===
    const currentMonthKey = year + '-' + String(month + 1).padStart(2, '0');
    const currentExpenses = expensesData[currentMonthKey] || DEFAULT_MONTHLY_EXPENSES;

    const expPerSecond = currentExpenses / (daysInMonth * 86400);
    const expensesToday = expPerSecond * secondsToday;
    const expensesMonth = expPerSecond * secondsInMonth;

    let expensesYear = 0;
    for (let m = 0; m < month; m++) {
      const mKey = year + '-' + String(m + 1).padStart(2, '0');
      expensesYear += (expensesData[mKey] || DEFAULT_MONTHLY_EXPENSES);
    }
    expensesYear += expensesMonth;

    // === REVENUE: Check for daily data first ===
    const currentMonthPrefix = year + '-' + String(month + 1).padStart(2, '0');

    // Count daily entries for current month
    let dailyMonthTotal = 0;
    let dailyMonthCount = 0;
    for (const [dateKey, amount] of Object.entries(dailyData)) {
      if (dateKey.startsWith(currentMonthPrefix)) {
        dailyMonthTotal += amount;
        dailyMonthCount++;
      }
    }

    let revenueToday, revenueMonth, revenueYear, revPerSecond;

    if (dailyMonthCount > 0) {
      // === DAILY MODE: use actual daily data ===

      // Yesterday's revenue = rate for estimating today
      const yesterday = new Date(Date.UTC(year, month, day - 1));
      const yesterdayKey = yesterday.getUTCFullYear() + '-' +
        String(yesterday.getUTCMonth() + 1).padStart(2, '0') + '-' +
        String(yesterday.getUTCDate()).padStart(2, '0');
      const yesterdayRevenue = dailyData[yesterdayKey] || 0;

      // Per-second rate based on yesterday (for animating today)
      revPerSecond = yesterdayRevenue / 86400;
      revenueToday = revPerSecond * secondsToday;

      // Month = sum of all entered days + today's estimate
      revenueMonth = dailyMonthTotal + revenueToday;

      // Year = previous months + current month
      revenueYear = 0;

      // Sum previous months from daily data
      for (let m = 0; m < month; m++) {
        const prevPrefix = year + '-' + String(m + 1).padStart(2, '0');
        let prevMonthTotal = 0;
        let hasDailyForMonth = false;

        for (const [dateKey, amount] of Object.entries(dailyData)) {
          if (dateKey.startsWith(prevPrefix)) {
            prevMonthTotal += amount;
            hasDailyForMonth = true;
          }
        }

        if (hasDailyForMonth) {
          revenueYear += prevMonthTotal;
        } else {
          // Fallback to monthly data for months without daily entries
          const monthKey = year + '-' + String(m + 1).padStart(2, '0');
          revenueYear += (months[monthKey] || 0);
        }
      }
      revenueYear += revenueMonth;

    } else {
      // === MONTHLY MODE: existing logic (unchanged) ===

      // The "displayed" month = last month's data shown as current
      let displayMonth = month === 0 ? 11 : month - 1;
      let displayYear = month === 0 ? year - 1 : year;
      let displayKey = displayYear + '-' + String(displayMonth + 1).padStart(2, '0');

      // Grace period: if last month has no data, keep showing the month before
      if (!months[displayKey] || months[displayKey] <= 0) {
        const fallbackMonth = displayMonth === 0 ? 11 : displayMonth - 1;
        const fallbackYear = displayMonth === 0 ? displayYear - 1 : displayYear;
        const fallbackKey = fallbackYear + '-' + String(fallbackMonth + 1).padStart(2, '0');

        if (months[fallbackKey] && months[fallbackKey] > 0) {
          displayMonth = fallbackMonth;
          displayYear = fallbackYear;
          displayKey = fallbackKey;
        }
      }

      const displayRevenue = months[displayKey] || 0;
      revPerSecond = displayRevenue / (daysInMonth * 86400);
      revenueToday = revPerSecond * secondsToday;
      revenueMonth = revPerSecond * secondsInMonth;

      revenueYear = 0;
      for (const [key, amount] of Object.entries(months)) {
        const parts = key.split('-');
        const y = parseInt(parts[0]);
        const m = parseInt(parts[1]) - 1;
        if (y === displayYear && m < displayMonth) {
          revenueYear += amount;
        }
      }
      revenueYear += revenueMonth;
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

      // For admin page (daily entries)
      days: dailyData,

      // For admin page (monthly expenses)
      expenses: expensesData,

      // For backward compatibility (monthly entries)
      months: months
    });
  } catch (error) {
    console.error('Redis error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
};
