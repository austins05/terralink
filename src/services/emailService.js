const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = null;
    this.initialized = false;
  }

  /**
   * Initialize email service with SMTP configuration
   * @param {Object} config - SMTP configuration
   */
  async initialize(config) {
    try {
      this.transporter = nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpSecure, // true for 465, false for other ports
        auth: {
          user: config.smtpUser,
          pass: config.smtpPassword
        }
      });

      // Verify connection
      await this.transporter.verify();
      this.initialized = true;
      console.log('✓ Email service initialized successfully');
      return true;
    } catch (error) {
      console.error('Email service initialization failed:', error.message);
      this.initialized = false;
      return false;
    }
  }

  /**
   * Send order notification email
   * @param {Object} order - Order details
   * @param {Array} recipients - Email addresses
   * @param {string} notificationType - Type of notification
   * @param {string} customMessage - Optional custom message
   */
  async sendOrderNotification(order, recipients, notificationType = 'special_order', customMessage = '') {
    if (!this.initialized) {
      throw new Error('Email service not initialized');
    }

    if (!recipients || recipients.length === 0) {
      console.log('No recipients configured, skipping email notification');
      return null;
    }

    const subject = this.getEmailSubject(order, notificationType);
    const htmlContent = this.getEmailHtml(order, notificationType, customMessage);
    const textContent = this.getEmailText(order, notificationType, customMessage);

    try {
      const info = await this.transporter.sendMail({
        from: process.env.EMAIL_FROM || '"Terralink Notifications" <noreply@terralink.local>',
        to: recipients.join(', '),
        subject: subject,
        text: textContent,
        html: htmlContent
      });

      console.log('✓ Email sent:', info.messageId);
      return info;
    } catch (error) {
      console.error('Failed to send email:', error.message);
      throw error;
    }
  }

  /**
   * Get email subject based on notification type
   */
  getEmailSubject(order, notificationType) {
    const contractor = order.contractor || 'Unknown Contractor';
    
    switch (notificationType) {
      case 'reference_field':
        return `[Terralink] Reference Field Detected - Order #${order.id} from ${contractor}`;
      case 'exclusion_zone':
        return `[Terralink] Exclusion Zone Order - Order #${order.id} from ${contractor}`;
      case 'nogo_zone':
        return `[Terralink] No-Go Zone Order - Order #${order.id} from ${contractor}`;
      case 'special_order':
        return `[Terralink] Special Order Notification - Order #${order.id} from ${contractor}`;
      default:
        return `[Terralink] Order Notification - Order #${order.id}`;
    }
  }

  /**
   * Get email HTML content
   */
  getEmailHtml(order, notificationType, customMessage = '') {
    const createdDate = order.creationDate
      ? new Date(order.creationDate * 1000).toLocaleString('en-US', {
          weekday: 'short',
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZoneName: 'short'
        })
      : 'Unknown';
    const typeDescriptions = {
      'reference_field': {
        title: 'Reference Field Detected',
        description: 'This order contains "outlines" template type - an inactive/reference field shown for context only.',
        color: '#fbbf24'
      },
      'exclusion_zone': {
        title: 'Exclusion Zone Detected',
        description: 'This order contains exclusion zones where product must NOT be applied.',
        color: '#ef4444'
      },
      'nogo_zone': {
        title: 'No-Go Zone Detected',
        description: 'This order contains no-go zones where travel is restricted.',
        color: '#dc2626'
      },
      'special_order': {
        title: 'Special Order',
        description: 'This order has special characteristics that require attention.',
        color: '#667eea'
      }
    };

    const typeInfo = typeDescriptions[notificationType] || typeDescriptions['special_order'];

    return `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: ${typeInfo.color}; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-radius: 0 0 8px 8px; }
        .field { margin: 10px 0; }
        .label { font-weight: bold; color: #666; }
        .value { color: #333; }
        .alert { background: #fef3c7; border-left: 4px solid #fbbf24; padding: 12px; margin: 15px 0; }
        .footer { margin-top: 20px; font-size: 12px; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>${typeInfo.title}</h2>
            <p>${typeInfo.description}</p>
        </div>
        <div class="content">
            <div style="background: #667eea; color: white; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
                <h3 style="margin: 0 0 10px 0; color: white;">Created by: ${order.contractor}</h3>
                <p style="margin: 0; font-size: 14px;">Order Created: ${createdDate}</p>
            </div>

            ${customMessage ? `
            <div style="background: #dbeafe; border-left: 4px solid #3b82f6; padding: 15px; margin: 15px 0; border-radius: 4px;">
                <strong style="color: #1e40af;">Custom Message:</strong>
                <p style="margin: 8px 0 0 0; color: #1e3a8a;">${customMessage}</p>
            </div>
            ` : ''}

            <h3>Order Details</h3>

            <div class="field">
                <span class="label">Order ID:</span>
                <span class="value">${order.id}</span>
            </div>

            <div class="field">
                <span class="label">Name:</span>
                <span class="value">${order.name || 'N/A'}</span>
            </div>

            <div class="field">
                <span class="label">Customer:</span>
                <span class="value">${order.customer || order.customerFullName || 'N/A'}</span>
            </div>
            
            <div class="field">
                <span class="label">Status:</span>
                <span class="value">${order.status}</span>
            </div>
            
            <div class="field">
                <span class="label">Address:</span>
                <span class="value">${order.address || 'N/A'}</span>
            </div>
            
            <div class="field">
                <span class="label">Area:</span>
                <span class="value">${order.area} acres</span>
            </div>
            
            ${order.boundaryColor ? `
            <div class="field">
                <span class="label">Boundary Color:</span>
                <span class="value">${order.boundaryColor}</span>
            </div>
            ` : ''}
            
            ${order.notes ? `
            <div class="field">
                <span class="label">Notes:</span>
                <span class="value">${order.notes}</span>
            </div>
            ` : ''}
            
            ${notificationType === 'reference_field' ? `
            <div class="alert">
                <strong>⚠️ Important:</strong> This order contains reference/outline fields that are NOT included in the actual work order. 
                They are shown on the map for context only. No product should be applied to these areas.
            </div>
            ` : ''}
            
            <div class="field">
                <span class="label">View on Tracmap:</span>
                <span class="value"><a href="https://test-api.tracmap.com/v1/accounts/${order.account?.id}/jobs/${order.id}">View Order</a></span>
            </div>
        </div>
        
        <div class="footer">
            <p>This is an automated notification from Terralink Backend API.</p>
            <p>Timestamp: ${new Date().toISOString()}</p>
        </div>
    </div>
</body>
</html>
    `.trim();
  }

  /**
   * Get plain text email content
   */
  getEmailText(order, notificationType, customMessage = '') {
    const createdDate = order.creationDate
      ? new Date(order.creationDate * 1000).toLocaleString('en-US', {
          weekday: 'short',
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZoneName: 'short'
        })
      : 'Unknown';

    return `
Terralink Order Notification
${notificationType.toUpperCase().replace('_', ' ')}

========================================
CREATED BY: ${order.contractor}
ORDER CREATED: ${createdDate}
========================================

${customMessage ? `
CUSTOM MESSAGE:
${customMessage}

========================================
` : ''}

Order ID: ${order.id}
Name: ${order.name || 'N/A'}
Customer: ${order.customer || order.customerFullName || 'N/A'}
Status: ${order.status}
Address: ${order.address || 'N/A'}
Area: ${order.area} acres
${order.boundaryColor ? `Boundary Color: ${order.boundaryColor}` : ''}
${order.notes ? `Notes: ${order.notes}` : ''}

View on Tracmap: https://test-api.tracmap.com/v1/accounts/${order.account?.id}/jobs/${order.id}

---
This is an automated notification from Terralink Backend API.
Timestamp: ${new Date().toISOString()}
    `.trim();
  }
}

module.exports = new EmailService();
