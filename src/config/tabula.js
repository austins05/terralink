require('dotenv').config();

module.exports = {
  apiUrl: process.env.TABULA_API_URL || 'https://test-api.tracmap.com/v1',
  apiToken: process.env.TABULA_API_TOKEN,
  accountId: process.env.TABULA_ACCOUNT_ID || '5429',
  timeout: 30000, // 30 seconds
  retryAttempts: 3
};
