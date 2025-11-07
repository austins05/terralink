const axios = require('axios');
const config = require('../config/tabula');

class TabulaService {
  constructor() {
    this.client = axios.create({
      baseURL: config.apiUrl,
      timeout: config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'token': config.apiToken  // Tabula uses 'token' header, not 'Authorization: Bearer'
      }
    });

    // Add response interceptor for debugging
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error('Tabula API Error:', {
          url: error.config?.url,
          status: error.response?.status,
          data: error.response?.data
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Get account information
   * @returns {Promise<Object>} Account details
   */
  async getAccounts() {
    try {
      const response = await this.client.get('/accounts');
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get account by ID
   * @param {string} accountId - Account ID
   * @returns {Promise<Object>} Account details
   */
  async getCustomer(accountId) {
    try {
      const response = await this.client.get(`/accounts/${accountId}`);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Search for customers by name
   * In Tabula, "customers" are actually accounts, and we search by filtering jobs
   * @param {string} searchQuery - Search term
   * @param {number} limit - Maximum number of results
   * @returns {Promise<Array>} List of matching customers
   */
  async searchCustomers(searchQuery, limit = 50) {
    try {
      // Get all jobs for the account
      const jobs = await this.getFieldMaps(config.accountId);

      // Filter by customer name or job name
      const query = searchQuery.toLowerCase();
      const filtered = jobs.filter(job =>
        (job.customer && job.customer.toLowerCase().includes(query)) ||
        (job.name && job.name.toLowerCase().includes(query))
      );

      // Extract unique customers
      const customersMap = {};
      filtered.forEach(job => {
        const customerName = job.customer || 'No Customer';
        if (!customersMap[customerName]) {
          customersMap[customerName] = {
            id: config.accountId,
            name: customerName,
            jobCount: 0,
            totalArea: 0
          };
        }
        customersMap[customerName].jobCount++;
        customersMap[customerName].totalArea += job.area || 0;
      });

      return Object.values(customersMap).slice(0, limit);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get field maps (jobs) for a customer (account)
   * In Tabula terminology: Jobs = Field Maps in our app
   * @param {string} customerId - Customer/Account ID
   * @returns {Promise<Array>} List of field maps
   */
  async getFieldMaps(customerId) {
    try {
      const accountId = customerId || config.accountId;
      const response = await this.client.get(`/accounts/${accountId}/jobs`);

      // Fetch full details for each job to get RTS field
      // RTS is only available in the detail endpoint, not the list
      const detailPromises = response.data.map(job =>
        this.client.get(`/accounts/${accountId}/jobs/${job.id}`)
          .then(detailResponse => detailResponse.data)
          .catch(error => {
            console.error(`Failed to fetch details for job ${job.id}:`, error.message);
            return null;
          })
      );

      const jobDetails = await Promise.all(detailPromises);

      // Transform Tabula jobs into our field map format
      return response.data.map((job, index) => {
        const details = jobDetails[index];

        return {
          id: job.id,
          name: job.block_name || job.order_name || `Job ${job.id}`,
          customer: job.customer || 'No Customer',
          area: job.area || job.gross_coverage_area || 0,
          status: job.status,
          orderNumber: job.order_number || '',
          requestedUrl: job.requested_url,
          workedUrl: job.worked_url,
          modifiedDate: job.modified_date,
          dueDate: job.due_date,
          productList: (details?.product_list || job.product_list) || '',
          address: (details?.address || job.address) || '',
          notes: (details?.notes || job.notes) || '',
          deleted: job.deleted || false,
          rts: details?.RTS || false  // RTS is uppercase in Tabula API
        };
      });
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get field maps for multiple customers
   * @param {Array<string>} customerIds - Array of customer/account IDs
   * @returns {Promise<Array>} Combined list of field maps
   */
  async getFieldMapsForMultipleCustomers(customerIds) {
    try {
      const promises = customerIds.map(id => this.getFieldMaps(id));
      const results = await Promise.allSettled(promises);

      const fieldMaps = [];
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          fieldMaps.push(...result.value);
        } else {
          console.error(
            `Failed to fetch field maps for customer ${customerIds[index]}:`,
            result.reason.message
          );
        }
      });

      return fieldMaps;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get detailed field map data including all job information
   * @param {string} fieldId - Field/Job ID
   * @returns {Promise<Object>} Detailed field map data
   */
  async getFieldMapDetails(fieldId) {
    try {
      const response = await this.client.get(
        `/accounts/${config.accountId}/jobs/${fieldId}`
      );

      const job = response.data;

      // Transform to our field map detail format
      return {
        id: job.id,
        name: job.block_name || job.order_name || `Job ${job.id}`,
        customer: job.customer || 'No Customer',
        customerFullName: job.customer_full_name,
        area: job.area || job.gross_coverage_area || 0,
        status: job.status,
        orderNumber: job.order_number || '',
        orderName: job.order_name || '',
        blockName: job.block_name || '',
        orderType: job.order_type || '',
        subtype: job.subtype || '',
        address: job.address || '',
        notes: job.notes || '',
        comments: job.comments || '',
        dueDate: job.due_date,
        modifiedDate: job.modified_date,
        creationDate: job.creation_date,
        productList: job.product_list || '',
        productRates: job.product_rates || [],
        requestedUrl: job.requested_url,
        workedUrl: job.worked_url,
        deleted: job.deleted || false,
        color: job.Color || '',
        urgency: job.urgency || '',
        account: job.account,
        customerAccount: job.customer_account
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Download field map geometry as GeoJSON
   * @param {string} fieldId - Field/Job ID
   * @param {string} format - Export format (only 'geojson' supported by Tabula)
   * @returns {Promise<Object>} Field map geometry in GeoJSON format
   */
  async downloadFieldMap(fieldId, format = 'geojson') {
    try {
      // Tabula API returns GeoJSON directly from the geometry/requested endpoint
      const response = await this.client.get(
        `/accounts/${config.accountId}/jobs/${fieldId}/geometry/requested`
      );

      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get worked geometry (actual field coverage)
   * @param {string} fieldId - Field/Job ID
   * @returns {Promise<Object>} Worked geometry in GeoJSON format
   */
  async getWorkedGeometry(fieldId) {
    try {
      const response = await this.client.get(
        `/accounts/${config.accountId}/jobs/${fieldId}/geometry/worked`
      );

      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Handle API errors and provide meaningful messages
   * @param {Error} error - Original error
   * @returns {Error} Formatted error
   */
  handleError(error) {
    if (error.response) {
      // Server responded with error status
      const status = error.response.status;
      const message = error.response.data?.message || error.response.statusText;

      switch (status) {
        case 400:
          return new Error(`Bad Request: ${message}`);
        case 401:
          return new Error('Unauthorized: Invalid API token');
        case 403:
          return new Error('Forbidden: Access denied to this resource');
        case 404:
          return new Error('Not Found: The requested resource does not exist');
        case 429:
          return new Error('Rate Limit Exceeded: Too many requests');
        case 500:
          return new Error('Server Error: Tabula API internal error');
        default:
          return new Error(`Tabula API Error (${status}): ${message}`);
      }
    } else if (error.request) {
      // Request was made but no response received
      return new Error('Tabula API Error: No response from server (check network connectivity)');
    } else {
      // Something else happened
      return new Error(`Tabula API Error: ${error.message}`);
    }
  }
}

module.exports = new TabulaService();
