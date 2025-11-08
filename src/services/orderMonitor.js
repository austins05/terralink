const tabulaService = require('./tabulaService');
const emailService = require('./emailService');
const notificationConfig = require('./notificationConfig');

class OrderMonitor {
  constructor() {
    this.monitoredOrders = new Set();
    this.isRunning = false;
    this.checkInterval = null;
    this.pollIntervalMs = 60 * 1000; // Check every 60 seconds
  }

  /**
   * Start monitoring for new orders
   */
  async start() {
    if (this.isRunning) {
      console.log('Order monitor already running');
      return;
    }

    console.log('🔔 Starting order monitor...');
    this.isRunning = true;

    // Initialize email service
    const config = notificationConfig.getConfig();
    if (config.enabled && config.emailConfig.smtpHost) {
      await emailService.initialize(config.emailConfig);
    }

    // Do initial check
    await this.checkForNewOrders();

    // Set up interval
    this.checkInterval = setInterval(async () => {
      await this.checkForNewOrders();
    }, this.pollIntervalMs);

    const intervalSeconds = this.pollIntervalMs / 1000;
    console.log('✓ Order monitor started (checking every ' + intervalSeconds + 's)');
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    console.log('✓ Order monitor stopped');
  }

  /**
   * Check for new or modified orders
   */
  async checkForNewOrders() {
    try {
      const config = notificationConfig.getConfig();

      if (!config.enabled) {
        return;
      }

      // Get field maps (this uses smart caching, so will only fetch modified orders)
      const fieldMaps = await tabulaService.getFieldMaps('5429');

      for (const order of fieldMaps) {
        const orderId = order.id.toString();

        // Skip if already processed
        if (this.monitoredOrders.has(orderId)) {
          continue;
        }

        // Mark as monitored
        this.monitoredOrders.add(orderId);

        // Get detailed order info
        const orderDetails = await tabulaService.getFieldMapDetails(order.id);

        // Get geometry to check template types
        let geometry;
        try {
          geometry = await tabulaService.downloadFieldMap(order.id);
        } catch (error) {
          console.log('Could not fetch geometry for order ' + order.id + ': ' + error.message);
          continue;
        }

        const features = geometry.features || [];

        // Check if should notify
        const decision = notificationConfig.shouldNotify(orderDetails, features);

        if (decision.notify) {
          console.log('🔔 Special order detected: ' + order.id + ' (' + decision.reason + ')');

          // Get recipients
          const recipients = notificationConfig.getRecipients(orderDetails.contractor);

          if (recipients.length > 0) {
            try {
              // Get custom message for this notification type
              const customMessage = notificationConfig.getCustomMessage(decision.reason);

              await emailService.sendOrderNotification(
                orderDetails,
                recipients,
                decision.reason,
                customMessage
              );
              console.log('✓ Notification sent for order ' + order.id + ' to ' + recipients.length + ' recipient(s)');
            } catch (error) {
              console.error('Failed to send notification for order ' + order.id + ': ' + error.message);
            }
          } else {
            console.log('⚠ No recipients configured for contractor ' + orderDetails.contractor);
          }
        }
      }
    } catch (error) {
      console.error('Order monitoring error:', error.message);
    }
  }

  /**
   * Get monitor status
   */
  getStatus() {
    return {
      running: this.isRunning,
      monitoredOrdersCount: this.monitoredOrders.size,
      pollIntervalMs: this.pollIntervalMs,
      lastCheckTime: new Date().toISOString()
    };
  }

  /**
   * Reset monitored orders (for testing)
   */
  reset() {
    this.monitoredOrders.clear();
    console.log('✓ Monitored orders reset');
  }
}

module.exports = new OrderMonitor();
