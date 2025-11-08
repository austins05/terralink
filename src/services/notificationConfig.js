const fs = require('fs').promises;
const path = require('path');

class NotificationConfig {
  constructor() {
    this.configPath = path.join(__dirname, '../../notification-config.json');
    this.config = {
      enabled: false,
      alwaysNotify: [],
      contractorEmails: {},
      emailConfig: {
        smtpHost: '',
        smtpPort: 587,
        smtpSecure: false,
        smtpUser: '',
        smtpPassword: ''
      },
      notificationRules: {
        outlines: true,
        exclusion: true,
        nogo: true,
        zeroArea: false
      }
    };
    this.loadConfig();
  }

  /**
   * Load configuration from file
   */
  async loadConfig() {
    try {
      const data = await fs.readFile(this.configPath, 'utf8');
      this.config = { ...this.config, ...JSON.parse(data) };
      console.log('✓ Notification config loaded');
    } catch (error) {
      if (error.code === 'ENOENT') {
        // Config file doesn't exist, create it with defaults
        await this.saveConfig();
        console.log('✓ Created default notification config');
      } else {
        console.error('Error loading notification config:', error.message);
      }
    }
  }

  /**
   * Save configuration to file
   */
  async saveConfig() {
    try {
      await fs.writeFile(
        this.configPath,
        JSON.stringify(this.config, null, 2),
        'utf8'
      );
      console.log('✓ Notification config saved');
      return true;
    } catch (error) {
      console.error('Error saving notification config:', error.message);
      throw error;
    }
  }

  /**
   * Get current configuration
   */
  getConfig() {
    return this.config;
  }

  /**
   * Update configuration
   * @param {Object} updates - Configuration updates
   */
  async updateConfig(updates) {
    this.config = { ...this.config, ...updates };
    await this.saveConfig();
    return this.config;
  }

  /**
   * Add email to always-notify list
   * @param {string} email - Email address
   */
  async addAlwaysNotify(email) {
    if (!this.config.alwaysNotify.includes(email)) {
      this.config.alwaysNotify.push(email);
      await this.saveConfig();
    }
    return this.config.alwaysNotify;
  }

  /**
   * Remove email from always-notify list
   * @param {string} email - Email address
   */
  async removeAlwaysNotify(email) {
    this.config.alwaysNotify = this.config.alwaysNotify.filter(e => e !== email);
    await this.saveConfig();
    return this.config.alwaysNotify;
  }

  /**
   * Set contractor email mapping
   * @param {string} contractorName - Contractor name
   * @param {string} email - Email address
   */
  async setContractorEmail(contractorName, email) {
    this.config.contractorEmails[contractorName] = email;
    await this.saveConfig();
    return this.config.contractorEmails;
  }

  /**
   * Remove contractor email mapping
   * @param {string} contractorName - Contractor name
   */
  async removeContractorEmail(contractorName) {
    delete this.config.contractorEmails[contractorName];
    await this.saveConfig();
    return this.config.contractorEmails;
  }

  /**
   * Get all recipients for an order
   * @param {string} contractorName - Contractor name
   */
  getRecipients(contractorName) {
    const recipients = [...this.config.alwaysNotify];
    
    if (contractorName && this.config.contractorEmails[contractorName]) {
      recipients.push(this.config.contractorEmails[contractorName]);
    }

    // Remove duplicates
    return [...new Set(recipients)];
  }

  /**
   * Check if notification should be sent for this order
   * @param {Object} order - Order details
   * @param {Array} geometryFeatures - Geometry features
   */
  shouldNotify(order, geometryFeatures) {
    if (!this.config.enabled) {
      return { notify: false, reason: 'Notifications disabled' };
    }

    const templateTypes = geometryFeatures.map(f => 
      f.properties?.template_type
    ).filter(Boolean);

    // Check for special template types
    if (this.config.notificationRules.outlines && templateTypes.includes('outlines')) {
      return { notify: true, reason: 'reference_field', type: 'outlines' };
    }

    if (this.config.notificationRules.exclusion && templateTypes.includes('exclusion')) {
      return { notify: true, reason: 'exclusion_zone', type: 'exclusion' };
    }

    if (this.config.notificationRules.nogo && templateTypes.includes('nogo')) {
      return { notify: true, reason: 'nogo_zone', type: 'nogo' };
    }

    // Check for zero area
    if (this.config.notificationRules.zeroArea && order.area === 0) {
      return { notify: true, reason: 'zero_area', type: 'zero_area' };
    }

    return { notify: false, reason: 'No triggers matched' };
  }
}

module.exports = new NotificationConfig();
