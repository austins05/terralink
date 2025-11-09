require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

const customerRoutes = require('./routes/customers');
const fieldMapRoutes = require('./routes/fieldMaps');
const { router: monitorRoutes, trackRequest } = require('./routes/monitor');
const notificationRoutes = require('./routes/notifications');
const exportRoutes = require('./routes/export');
const databaseService = require('./services/databaseService');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Allow inline scripts for dashboard
}));

// CORS configuration
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));

// Rate limiting - DISABLED for client app (iOS Rotorsync)
// Allows unlimited requests from the app
// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 100, // Limit each IP to 100 requests per windowMs
//   message: 'Too many requests from this IP, please try again later.'
// });
// app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging
app.use(morgan('combined'));

// Request tracking middleware (for monitoring dashboard)
app.use(trackRequest);

// Serve static files (monitoring dashboard)
app.use(express.static(path.join(__dirname, '../public')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API routes
app.use('/api/customers', customerRoutes);
app.use('/api/field-maps', fieldMapRoutes);
app.use('/api/monitor', monitorRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/export', exportRoutes);

// Root endpoint - redirect to dashboard
app.get('/api', (req, res) => {
  res.json({
    name: 'Terralink Backend API',
    version: '1.0.0',
    description: 'Backend API for Tabula integration with Rotorsync',
    dashboard: '/index.html',
    endpoints: {
      health: '/health',
      monitor: {
        stats: 'GET /api/monitor/stats',
        sync: 'POST /api/monitor/sync'
      },
      customers: {
        search: 'GET /api/customers/search?q=searchTerm',
        getById: 'GET /api/customers/:id'
      },
      fieldMaps: {
        byCustomer: 'GET /api/field-maps/customer/:customerId',
        bulk: 'POST /api/field-maps/bulk',
        details: 'GET /api/field-maps/:fieldId',
        download: 'GET /api/field-maps/:fieldId/download?format=geojson'
      },
      notifications: {
        config: 'GET/POST /api/notifications/config',
        addAlwaysNotify: 'POST /api/notifications/always-notify',
        setContractorEmail: 'POST /api/notifications/contractor-email',
        test: 'POST /api/notifications/test',
        monitorStatus: 'GET /api/notifications/monitor/status',
        startMonitor: 'POST /api/notifications/monitor/start',
        stopMonitor: 'POST /api/notifications/monitor/stop'
      },
      export: {
        stats: 'GET /api/export/stats',
        bySeason: 'GET /api/export/season/:season',
        byDateRange: 'GET /api/export/date-range?start=&end=',
        byContractor: 'GET /api/export/contractor/:contractor',
        all: 'GET /api/export/all',
        downloadJson: 'GET /api/export/download/json?season=2025-Spring'
      }
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Start server
const server = app.listen(PORT, async () => {
  console.log(`🚀 Terralink Backend API running on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 API URL: http://localhost:${PORT}`);
  console.log(`📊 Monitoring Dashboard: http://localhost:${PORT}`);

  // Initialize database
  try {
    await databaseService.initialize();
    const stats = await databaseService.getStats();
    console.log(`💾 Database: ${stats.totalJobs} jobs stored`);
  } catch (error) {
    console.error('Database initialization error:', error.message);
  }

  // Start order monitor if enabled
  if (process.env.ENABLE_ORDER_MONITOR === 'true') {
    const orderMonitor = require('./services/orderMonitor');
    await orderMonitor.start();
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');

  // Stop order monitor
  try {
    const orderMonitor = require('./services/orderMonitor');
    orderMonitor.stop();
  } catch (error) {
    console.error('Error stopping order monitor:', error.message);
  }

  // Close database
  try {
    await databaseService.close();
  } catch (error) {
    console.error('Error closing database:', error.message);
  }

  server.close(() => {
    console.log('HTTP server closed');
  });
});
