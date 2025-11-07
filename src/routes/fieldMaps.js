const express = require('express');
const router = express.Router();
const tabulaService = require('../services/tabulaService');

/**
 * Get field maps for a single customer
 * GET /api/field-maps/customer/:customerId
 */
router.get('/customer/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;
    const fieldMaps = await tabulaService.getFieldMaps(customerId);

    res.json({
      success: true,
      count: fieldMaps.length,
      data: fieldMaps
    });
  } catch (error) {
    console.error('Get field maps error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get field maps for multiple customers
 * POST /api/field-maps/bulk
 * Body: { customerIds: ["id1", "id2", "id3"] }
 */
router.post('/bulk', async (req, res) => {
  try {
    const { customerIds } = req.body;

    if (!Array.isArray(customerIds) || customerIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'customerIds must be a non-empty array'
      });
    }

    if (customerIds.length > 100) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 100 customers allowed per request'
      });
    }

    const fieldMaps = await tabulaService.getFieldMapsForMultipleCustomers(customerIds);

    res.json({
      success: true,
      count: fieldMaps.length,
      customersProcessed: customerIds.length,
      data: fieldMaps
    });
  } catch (error) {
    console.error('Bulk field maps error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get recent field maps (last N across all customers)
 * GET /api/field-maps/recent?limit=20
 * IMPORTANT: Must be BEFORE /:fieldId route to avoid being matched as fieldId
 */
router.get('/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;

    // Get jobs from default test customer for now
    const fieldMaps = await tabulaService.getFieldMaps('5429');

    // Sort by modified date (most recent first) and limit
    const sortedMaps = fieldMaps
      .sort((a, b) => (b.modifiedDate || 0) - (a.modifiedDate || 0))
      .slice(0, limit);

    res.json({
      success: true,
      count: sortedMaps.length,
      data: sortedMaps
    });
  } catch (error) {
    console.error('Get recent field maps error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get detailed field map data
 * GET /api/field-maps/:fieldId
 */
router.get('/:fieldId(\\d+)', async (req, res) => {
  try {
    const { fieldId } = req.params;
    const fieldMap = await tabulaService.getFieldMapDetails(fieldId);

    res.json({
      success: true,
      data: fieldMap
    });
  } catch (error) {
    console.error('Get field map details error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get field geometry (requested or worked)
 * GET /api/field-maps/:fieldId/geometry?type=worked
 * GET /api/field-maps/:fieldId/geometry?type=requested
 */
router.get('/:fieldId(\\d+)/geometry', async (req, res) => {
  try {
    const { fieldId } = req.params;
    const { type } = req.query;

    const fs = require('fs');
    fs.appendFileSync('/tmp/route_debug.log', `GET /field-maps/${fieldId}/geometry?type=${type}\n`);

    let geometry;
    if (type === 'requested') {
      fs.appendFileSync('/tmp/route_debug.log', '  → REQUESTED\n');
      geometry = await tabulaService.downloadFieldMap(fieldId);
    } else if (type === 'worked-detailed') {
      // Get detailed worked geometry (LineString spray lines)
      fs.appendFileSync('/tmp/route_debug.log', '  → WORKED-DETAILED\n');
      geometry = await tabulaService.getWorkedGeometryDetailed(fieldId);
      fs.appendFileSync('/tmp/route_debug.log', `  Got ${geometry.features.length} features, type: ${geometry.features[0]?.geometry?.type}\n`);
    } else if (type === 'worked') {
      console.log('  → Fetching WORKED geometry (coverage area)');
      geometry = await tabulaService.getWorkedGeometry(fieldId);

      // If worked geometry doesn't exist, return an empty feature collection
      if (!geometry) {
        geometry = {
          type: 'FeatureCollection',
          features: []
        };
      }
    } else {
      // Default to requested geometry
      geometry = await tabulaService.downloadFieldMap(fieldId);
    }

    res.json({
      success: true,
      type: type || 'requested',
      data: geometry
    });
  } catch (error) {
    console.error('Get field geometry error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Download field map in specific format
 * GET /api/field-maps/:fieldId/download?format=geojson
 */
router.get('/:fieldId(\\d+)/download', async (req, res) => {
  try {
    const { fieldId } = req.params;
    const { format } = req.query;

    const mapData = await tabulaService.downloadFieldMap(fieldId, format || 'geojson');

    res.json({
      success: true,
      format: format || 'geojson',
      data: mapData
    });
  } catch (error) {
    console.error('Download field map error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get cache statistics
 * GET /api/field-maps/cache/stats
 */
router.get('/cache/stats', (req, res) => {
  try {
    const stats = tabulaService.getCacheStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Get cache stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Clear cache
 * DELETE /api/field-maps/cache/clear
 * Optional query param: customerId
 */
router.delete('/cache/clear', (req, res) => {
  try {
    const { customerId } = req.query;
    tabulaService.clearCache(customerId);
    res.json({
      success: true,
      message: customerId
        ? `Cache cleared for customer ${customerId}`
        : 'All cache cleared'
    });
  } catch (error) {
    console.error('Clear cache error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
