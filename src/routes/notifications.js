const express = require('express');
const router = express.Router();
const notificationConfig = require('../services/notificationConfig');
const emailService = require('../services/emailService');
const tabulaService = require('../services/tabulaService');

/**
 * Get notification configuration
 * GET /api/notifications/config
 */
router.get('/config', async (req, res) => {
  try {
    const config = notificationConfig.getConfig();
    
    // Don't expose password in response
    const safeConfig = {
      ...config,
      emailConfig: {
        ...config.emailConfig,
        smtpPassword: config.emailConfig.smtpPassword ? '***hidden***' : ''
      }
    };

    res.json({
      success: true,
      data: safeConfig
    });
  } catch (error) {
    console.error('Get notification config error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Update notification configuration
 * POST /api/notifications/config
 */
router.post('/config', async (req, res) => {
  try {
    const updates = req.body;
    
    const updatedConfig = await notificationConfig.updateConfig(updates);
    
    // Re-initialize email service if email config changed
    if (updates.emailConfig) {
      await emailService.initialize(updatedConfig.emailConfig);
    }

    res.json({
      success: true,
      message: 'Configuration updated successfully',
      data: updatedConfig
    });
  } catch (error) {
    console.error('Update notification config error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Add email to always-notify list
 * POST /api/notifications/always-notify
 * Body: { email: "user@example.com" }
 */
router.post('/always-notify', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email address is required'
      });
    }

    const list = await notificationConfig.addAlwaysNotify(email);

    res.json({
      success: true,
      message: `Added ${email} to always-notify list`,
      data: list
    });
  } catch (error) {
    console.error('Add always-notify error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Remove email from always-notify list
 * DELETE /api/notifications/always-notify/:email
 */
router.delete('/always-notify/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const list = await notificationConfig.removeAlwaysNotify(email);

    res.json({
      success: true,
      message: `Removed ${email} from always-notify list`,
      data: list
    });
  } catch (error) {
    console.error('Remove always-notify error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Set contractor email mapping
 * POST /api/notifications/contractor-email
 * Body: { contractor: "AASC", email: "aasc@example.com" }
 */
router.post('/contractor-email', async (req, res) => {
  try {
    const { contractor, email } = req.body;
    
    if (!contractor || !email) {
      return res.status(400).json({
        success: false,
        error: 'Both contractor and email are required'
      });
    }

    const mappings = await notificationConfig.setContractorEmail(contractor, email);

    res.json({
      success: true,
      message: `Set email for ${contractor} to ${email}`,
      data: mappings
    });
  } catch (error) {
    console.error('Set contractor email error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Remove contractor email mapping
 * DELETE /api/notifications/contractor-email/:contractor
 */
router.delete('/contractor-email/:contractor', async (req, res) => {
  try {
    const { contractor } = req.params;
    const mappings = await notificationConfig.removeContractorEmail(contractor);

    res.json({
      success: true,
      message: `Removed email mapping for ${contractor}`,
      data: mappings
    });
  } catch (error) {
    console.error('Remove contractor email error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Test notification system
 * POST /api/notifications/test
 * Body: { orderId: "37663" }
 */
router.post('/test', async (req, res) => {
  try {
    const { orderId } = req.body;
    
    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: 'orderId is required'
      });
    }

    // Get order details
    const order = await tabulaService.getFieldMapDetails(orderId);
    
    // Get geometry
    const geometry = await tabulaService.downloadFieldMap(orderId);
    const features = geometry.features || [];

    // Check if should notify
    const decision = notificationConfig.shouldNotify(order, features);

    if (!decision.notify) {
      return res.json({
        success: true,
        sent: false,
        message: `No notification sent: ${decision.reason}`,
        decision: decision
      });
    }

    // Get recipients
    const recipients = notificationConfig.getRecipients(order.contractor);

    if (recipients.length === 0) {
      return res.json({
        success: true,
        sent: false,
        message: 'No recipients configured',
        decision: decision
      });
    }

    // Initialize email service if needed
    const config = notificationConfig.getConfig();
    if (!emailService.initialized && config.emailConfig.smtpHost) {
      await emailService.initialize(config.emailConfig);
    }

    // Get custom message
    const customMessage = notificationConfig.getCustomMessage(decision.reason);

    // Send notification
    const emailInfo = await emailService.sendOrderNotification(
      order,
      recipients,
      decision.reason,
      customMessage
    );

    res.json({
      success: true,
      sent: true,
      message: 'Test notification sent successfully',
      recipients: recipients,
      decision: decision,
      emailId: emailInfo?.messageId
    });

  } catch (error) {
    console.error('Test notification error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Check if an order would trigger notification (without sending)
 * GET /api/notifications/check/:orderId
 */
router.get('/check/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;

    // Get order details
    const order = await tabulaService.getFieldMapDetails(orderId);
    
    // Get geometry
    const geometry = await tabulaService.downloadFieldMap(orderId);
    const features = geometry.features || [];

    // Check if should notify
    const decision = notificationConfig.shouldNotify(order, features);
    
    // Get recipients
    const recipients = notificationConfig.getRecipients(order.contractor);

    res.json({
      success: true,
      orderId: orderId,
      orderName: order.name,
      contractor: order.contractor,
      wouldNotify: decision.notify,
      reason: decision.reason,
      type: decision.type,
      recipients: recipients,
      templateTypes: features.map(f => f.properties?.template_type).filter(Boolean)
    });

  } catch (error) {
    console.error('Check notification error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});


/**
 * Get monitor status
 * GET /api/notifications/monitor/status
 */
router.get('/monitor/status', (req, res) => {
  try {
    const orderMonitor = require('../services/orderMonitor');
    const status = orderMonitor.getStatus();

    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('Get monitor status error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Start order monitor
 * POST /api/notifications/monitor/start
 */
router.post('/monitor/start', async (req, res) => {
  try {
    const orderMonitor = require('../services/orderMonitor');
    await orderMonitor.start();

    res.json({
      success: true,
      message: 'Order monitor started',
      status: orderMonitor.getStatus()
    });
  } catch (error) {
    console.error('Start monitor error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Stop order monitor
 * POST /api/notifications/monitor/stop
 */
router.post('/monitor/stop', (req, res) => {
  try {
    const orderMonitor = require('../services/orderMonitor');
    orderMonitor.stop();

    res.json({
      success: true,
      message: 'Order monitor stopped',
      status: orderMonitor.getStatus()
    });
  } catch (error) {
    console.error('Stop monitor error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Reset monitored orders
 * POST /api/notifications/monitor/reset
 */
router.post('/monitor/reset', (req, res) => {
  try {
    const orderMonitor = require('../services/orderMonitor');
    orderMonitor.reset();

    res.json({
      success: true,
      message: 'Monitored orders reset'
    });
  } catch (error) {
    console.error('Reset monitor error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;

/**
 * Set custom message for notification type
 * POST /api/notifications/custom-message
 * Body: { type: "reference_field", message: "Your custom message here" }
 */
router.post('/custom-message', async (req, res) => {
  try {
    const { type, message } = req.body;

    if (!type) {
      return res.status(400).json({
        success: false,
        error: 'Notification type is required'
      });
    }

    const validTypes = ['reference_field', 'exclusion_zone', 'nogo_zone', 'zero_area'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid notification type. Must be one of: ' + validTypes.join(', ')
      });
    }

    const messages = await notificationConfig.setCustomMessage(type, message || '');

    res.json({
      success: true,
      message: 'Custom message updated for ' + type,
      data: messages
    });
  } catch (error) {
    console.error('Set custom message error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get all custom messages
 * GET /api/notifications/custom-messages
 */
router.get('/custom-messages', (req, res) => {
  try {
    const config = notificationConfig.getConfig();
    
    res.json({
      success: true,
      data: config.customMessages || {}
    });
  } catch (error) {
    console.error('Get custom messages error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Delete custom message for notification type
 * DELETE /api/notifications/custom-message/:type
 */
router.delete('/custom-message/:type', async (req, res) => {
  try {
    const { type } = req.params;
    
    const messages = await notificationConfig.setCustomMessage(type, '');

    res.json({
      success: true,
      message: 'Custom message cleared for ' + type,
      data: messages
    });
  } catch (error) {
    console.error('Delete custom message error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
