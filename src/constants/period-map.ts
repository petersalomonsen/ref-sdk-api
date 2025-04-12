export const periodMap = [
  { period: "1Y", value: 24 * 365, interval: 12 }, // 1 point per month
  { period: "1M", value: 24 * 30, interval: 15 }, // 1 point per 2 days
  { period: "1W", value: 24 * 7, interval: 8 }, // 1 point per day
  { period: "1D", value: 24, interval: 12 }, // 1 point per 2 hours
  { period: "1H", value: 1, interval: 6 }, // 1 point per 10 minutes
  { period: "All", value: 24 * 365 * 2, interval: 20 }, // assuming 2 years of chain history
];
