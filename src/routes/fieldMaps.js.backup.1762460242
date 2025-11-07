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
 * Get detailed field map data
 * GET /api/field-maps/:fieldId
 */
router.get('/:fieldId', async (req, res) => {
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
 * Download field map in specific format
 * GET /api/field-maps/:fieldId/download?format=geojson
 */
router.get('/:fieldId/download', async (req, res) => {
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

module.exports = router;
