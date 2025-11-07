const express = require('express');
const router = express.Router();
const tabulaService = require('../services/tabulaService');

/**
 * Search for customers
 * GET /api/customers/search?q=searchTerm&limit=50
 */
router.get('/search', async (req, res) => {
  try {
    const { q, limit } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        error: 'Search query must be at least 2 characters'
      });
    }

    const customers = await tabulaService.searchCustomers(q, parseInt(limit) || 50);

    res.json({
      success: true,
      count: customers.length,
      data: customers
    });
  } catch (error) {
    console.error('Customer search error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get customer by ID
 * GET /api/customers/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const customer = await tabulaService.getCustomer(id);

    res.json({
      success: true,
      data: customer
    });
  } catch (error) {
    console.error('Get customer error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
