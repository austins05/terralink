const express = require('express');
const router = express.Router();
const syncScheduler = require('../services/syncScheduler');

// In-memory stats storage
const stats = {
  requests: [],
  tabulaRequests: [],
  startTime: Date.now(),
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  endpointCounts: {},
  tabulaStats: {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    endpointCounts: {}
  }
};

// Middleware to track requests
function trackRequest(req, res, next) {
  const startTime = Date.now();

  // Capture the original send function
  const originalSend = res.send;
  res.send = function(data) {
    const responseTime = Date.now() - startTime;

    // Record request
    const requestRecord = {
      timestamp: new Date().toISOString(),
      method: req.method,
      endpoint: req.path,
      status: res.statusCode,
      responseTime: responseTime,
      ip: req.ip || req.connection.remoteAddress
    };

    stats.requests.unshift(requestRecord);

    // Keep only last 100 requests
    if (stats.requests.length > 100) {
      stats.requests = stats.requests.slice(0, 100);
    }

    // Update counters
    stats.totalRequests++;
    if (res.statusCode >= 200 && res.statusCode < 400) {
      stats.successfulRequests++;
    } else {
      stats.failedRequests++;
    }

    // Track endpoint usage
    const endpoint = `${req.method} ${req.path}`;
    stats.endpointCounts[endpoint] = (stats.endpointCounts[endpoint] || 0) + 1;

    return originalSend.call(this, data);
  };

  next();
}

// Function to track Tabula API calls (called from TabulaService)
function trackTabulaRequest(method, endpoint, status, responseTime) {
  const requestRecord = {
    timestamp: new Date().toISOString(),
    method: method,
    endpoint: endpoint,
    status: status,
    responseTime: responseTime
  };

  stats.tabulaRequests.unshift(requestRecord);

  // Keep only last 100 requests
  if (stats.tabulaRequests.length > 100) {
    stats.tabulaRequests = stats.tabulaRequests.slice(0, 100);
  }

  // Update Tabula counters
  stats.tabulaStats.totalRequests++;
  if (status >= 200 && status < 400) {
    stats.tabulaStats.successfulRequests++;
  } else {
    stats.tabulaStats.failedRequests++;
  }

  // Track Tabula endpoint usage
  const endpointKey = `${method} ${endpoint}`;
  stats.tabulaStats.endpointCounts[endpointKey] = (stats.tabulaStats.endpointCounts[endpointKey] || 0) + 1;
}

// Get statistics
router.get('/stats', (req, res) => {
  const now = Date.now();
  const uptimeSeconds = Math.floor((now - stats.startTime) / 1000);
  const uptimeMinutes = Math.floor(uptimeSeconds / 60);
  const uptimeHours = Math.floor(uptimeMinutes / 60);
  const uptimeDays = Math.floor(uptimeHours / 24);

  let uptimeString;
  if (uptimeDays > 0) {
    uptimeString = `${uptimeDays}d ${uptimeHours % 24}h`;
  } else if (uptimeHours > 0) {
    uptimeString = `${uptimeHours}h ${uptimeMinutes % 60}m`;
  } else if (uptimeMinutes > 0) {
    uptimeString = `${uptimeMinutes}m`;
  } else {
    uptimeString = `${uptimeSeconds}s`;
  }

  // Calculate average response time for backend
  const avgResponseTime = stats.requests.length > 0
    ? Math.round(stats.requests.reduce((sum, req) => sum + req.responseTime, 0) / stats.requests.length)
    : 0;

  // Calculate average response time for Tabula
  const avgTabulaResponseTime = stats.tabulaRequests.length > 0
    ? Math.round(stats.tabulaRequests.reduce((sum, req) => sum + req.responseTime, 0) / stats.tabulaRequests.length)
    : 0;

  // Get today's requests
  const today = new Date().toDateString();
  const requestsToday = stats.requests.filter(req =>
    new Date(req.timestamp).toDateString() === today
  ).length;

  const errorsToday = stats.requests.filter(req =>
    new Date(req.timestamp).toDateString() === today && req.status >= 400
  ).length;

  const tabulaRequestsToday = stats.tabulaRequests.filter(req =>
    new Date(req.timestamp).toDateString() === today
  ).length;

  const tabulaErrorsToday = stats.tabulaRequests.filter(req =>
    new Date(req.timestamp).toDateString() === today && req.status >= 400
  ).length;

  // Top endpoints for backend
  const topEndpoints = Object.entries(stats.endpointCounts)
    .map(([endpoint, count]) => ({ endpoint, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Top endpoints for Tabula
  const topTabulaEndpoints = Object.entries(stats.tabulaStats.endpointCounts)
    .map(([endpoint, count]) => ({ endpoint, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const successRate = stats.totalRequests > 0
    ? Math.round((stats.successfulRequests / stats.totalRequests) * 100) + '%'
    : '0%';

  const tabulaSuccessRate = stats.tabulaStats.totalRequests > 0
    ? Math.round((stats.tabulaStats.successfulRequests / stats.tabulaStats.totalRequests) * 100) + '%'
    : '0%';

  // Get sync scheduler status
  const syncStatus = syncScheduler.getStatus();

  res.json({
    // Backend stats
    totalRequests: stats.totalRequests,
    successfulRequests: stats.successfulRequests,
    failedRequests: stats.failedRequests,
    successRate: successRate,
    avgResponseTime: avgResponseTime,
    requestsToday: requestsToday,
    errorsToday: errorsToday,
    uptime: uptimeString,
    topEndpoints: topEndpoints,
    recentRequests: stats.requests.slice(0, 50),

    // Tabula stats
    tabula: {
      totalRequests: stats.tabulaStats.totalRequests,
      successfulRequests: stats.tabulaStats.successfulRequests,
      failedRequests: stats.tabulaStats.failedRequests,
      successRate: tabulaSuccessRate,
      avgResponseTime: avgTabulaResponseTime,
      requestsToday: tabulaRequestsToday,
      errorsToday: tabulaErrorsToday,
      topEndpoints: topTabulaEndpoints,
      recentRequests: stats.tabulaRequests.slice(0, 50)
    },

    // Sync scheduler status
    syncScheduler: syncStatus
  });
});

// Get sync scheduler status
router.get('/sync/status', (req, res) => {
  const status = syncScheduler.getStatus();
  res.json(status);
});

// Sync with Tabula (manual trigger)
router.post('/sync', async (req, res) => {
  try {
    console.log('📲 Manual Tabula sync triggered at', new Date().toISOString());

    // Trigger a manual sync
    const result = await syncScheduler.sync();

    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        fieldMapCount: result.fieldMapCount,
        duration: result.duration,
        timestamp: result.timestamp
      });
    } else {
      res.status(result.skipped ? 409 : 500).json({
        success: false,
        message: result.message,
        error: result.error,
        timestamp: result.timestamp
      });
    }
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to sync with Tabula: ' + error.message
    });
  }
});

// Reset statistics (optional admin endpoint)
router.post('/reset-stats', (req, res) => {
  stats.requests = [];
  stats.tabulaRequests = [];
  stats.totalRequests = 0;
  stats.successfulRequests = 0;
  stats.failedRequests = 0;
  stats.endpointCounts = {};
  stats.tabulaStats = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    endpointCounts: {}
  };
  stats.startTime = Date.now();

  res.json({
    success: true,
    message: 'Statistics reset successfully'
  });
});

module.exports = { router, trackRequest, trackTabulaRequest };
