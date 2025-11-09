const express = require('express');
const router = express.Router();
const databaseService = require('../services/databaseService');

/**
 * Get database statistics
 * GET /api/export/stats
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await databaseService.getStats();

    // Format timestamps
    if (stats.oldestJob) {
      stats.oldestJobDate = new Date(stats.oldestJob * 1000).toISOString();
    }
    if (stats.newestJob) {
      stats.newestJobDate = new Date(stats.newestJob * 1000).toISOString();
    }

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Get database stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get jobs by season
 * GET /api/export/season/:season
 * Example: /api/export/season/2025-Spring
 */
router.get('/season/:season', async (req, res) => {
  try {
    const { season } = req.params;
    const jobs = await databaseService.getJobsBySeason(season);

    res.json({
      success: true,
      season: season,
      count: jobs.length,
      data: jobs
    });
  } catch (error) {
    console.error('Get jobs by season error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get jobs by date range
 * GET /api/export/date-range?start=1609459200&end=1640995200
 */
router.get('/date-range', async (req, res) => {
  try {
    const { start, end } = req.query;

    if (!start || !end) {
      return res.status(400).json({
        success: false,
        error: 'Both start and end timestamps are required'
      });
    }

    const startDate = parseInt(start);
    const endDate = parseInt(end);

    const jobs = await databaseService.getJobsByDateRange(startDate, endDate);

    res.json({
      success: true,
      dateRange: {
        start: new Date(startDate * 1000).toISOString(),
        end: new Date(endDate * 1000).toISOString()
      },
      count: jobs.length,
      data: jobs
    });
  } catch (error) {
    console.error('Get jobs by date range error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get jobs by contractor
 * GET /api/export/contractor/:contractor
 */
router.get('/contractor/:contractor', async (req, res) => {
  try {
    const { contractor } = req.params;
    const jobs = await databaseService.getJobsByContractor(contractor);

    res.json({
      success: true,
      contractor: contractor,
      count: jobs.length,
      data: jobs
    });
  } catch (error) {
    console.error('Get jobs by contractor error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get all jobs from database
 * GET /api/export/all?limit=1000
 */
router.get('/all', async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit) : null;
    const jobs = await databaseService.getAllJobs(limit);

    res.json({
      success: true,
      count: jobs.length,
      data: jobs
    });
  } catch (error) {
    console.error('Get all jobs error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Download all jobs as JSON file
 * GET /api/export/download/json?season=2025-Spring
 */
router.get('/download/json', async (req, res) => {
  try {
    const { season, contractor, start, end } = req.query;

    let jobs;
    let filename;

    if (season) {
      jobs = await databaseService.getJobsBySeason(season);
      filename = 'terralink-jobs-' + season + '.json';
    } else if (contractor) {
      jobs = await databaseService.getJobsByContractor(contractor);
      const contractorSlug = contractor.replace(/\s+/g, '-');
      filename = 'terralink-jobs-' + contractorSlug + '.json';
    } else if (start && end) {
      jobs = await databaseService.getJobsByDateRange(parseInt(start), parseInt(end));
      filename = 'terralink-jobs-' + start + '-' + end + '.json';
    } else {
      jobs = await databaseService.getAllJobs();
      filename = 'terralink-jobs-all.json';
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');

    res.json({
      exportDate: new Date().toISOString(),
      count: jobs.length,
      jobs: jobs
    });

  } catch (error) {
    console.error('Download jobs error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
