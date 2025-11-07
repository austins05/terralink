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

    // Cache for field maps data
    // Structure: { 'customerId': {
    //   timestamp: Date,
    //   lastSyncDate: Date (for from_date parameter),
    //   fullJobList: [...],
    //   jobDetailsCache: { jobId: {...} }
    // } }
    this.fieldMapsCache = {};
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    this.fromDateOverlap = 5 * 60 * 1000; // 5 minute overlap as recommended by Tabula
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
   * Uses Tabula's recommended polling pattern with from_date parameter
   * @param {string} customerId - Customer/Account ID
   * @returns {Promise<Array>} List of field maps
   */
  async getFieldMaps(customerId) {
    try {
      const accountId = customerId || config.accountId;
      const now = Date.now();
      const cached = this.fieldMapsCache[accountId];
      const cacheValid = cached && (now - cached.timestamp) < this.cacheExpiry;

      // Initialize cache if doesn't exist
      if (!cached) {
        console.log('🆕 Initializing cache for customer', accountId);
        this.fieldMapsCache[accountId] = {
          timestamp: now,
          lastSyncDate: now - (90 * 24 * 60 * 60 * 1000), // 90 days ago for first sync
          fullJobList: [],
          jobDetailsCache: {}
        };
      }

      const cache = this.fieldMapsCache[accountId];

      // Use from_date parameter to only fetch modified jobs (Tabula recommended pattern)
      // Overlap by 5 minutes to avoid missing changes due to timing
      const fromDate = new Date(cache.lastSyncDate - this.fromDateOverlap);
      const fromDateEpoch = Math.floor(fromDate.getTime() / 1000);

      console.log(`📡 Polling for changes since ${fromDate.toISOString()}`);

      const response = await this.client.get(
        `/accounts/${accountId}/jobs?include_deleted=true&from_date=${fromDateEpoch}`
      );

      const modifiedJobs = response.data;
      console.log(`📦 Got ${modifiedJobs.length} modified jobs from Tracmap`);

      // If no jobs modified and cache is valid, return cached data
      if (modifiedJobs.length === 0 && cacheValid && cache.fullJobList.length > 0) {
        console.log('✅ No changes detected, using cached data');
        return this.transformJobsToFieldMaps(cache.fullJobList, cache.jobDetailsCache);
      }

      // Fetch details for modified jobs
      const jobsNeedingDetails = [];
      for (const job of modifiedJobs) {
        const cachedDetails = cache.jobDetailsCache[job.id];
        const needsUpdate = !cachedDetails ||
                           cachedDetails.modified_date !== job.modified_date;

        if (needsUpdate) {
          jobsNeedingDetails.push(job);
        }
      }

      console.log(`🔄 Fetching details for ${jobsNeedingDetails.length} jobs (${modifiedJobs.length - jobsNeedingDetails.length} already cached)`);

      // Fetch details only for jobs that need updates
      if (jobsNeedingDetails.length > 0) {
        const detailPromises = jobsNeedingDetails.map(job =>
          this.client.get(`/accounts/${accountId}/jobs/${job.id}`)
            .then(detailResponse => {
              cache.jobDetailsCache[job.id] = detailResponse.data;
              return { jobId: job.id, success: true };
            })
            .catch(error => {
              console.error(`Failed to fetch details for job ${job.id}:`, error.message);
              return { jobId: job.id, success: false };
            })
        );

        await Promise.all(detailPromises);
      }

      // Merge modified jobs into full job list
      const jobMap = new Map(cache.fullJobList.map(job => [job.id, job]));

      for (const modifiedJob of modifiedJobs) {
        if (modifiedJob.deleted) {
          // Remove deleted jobs
          jobMap.delete(modifiedJob.id);
          delete cache.jobDetailsCache[modifiedJob.id];
        } else {
          // Update or add job
          jobMap.set(modifiedJob.id, modifiedJob);
        }
      }

      // Update cache
      cache.fullJobList = Array.from(jobMap.values());
      cache.timestamp = now;
      cache.lastSyncDate = now;

      console.log(`✅ Cache updated: ${cache.fullJobList.length} total jobs`);

      // Transform and return
      return this.transformJobsToFieldMaps(cache.fullJobList, cache.jobDetailsCache);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Transform job list with cached details into field map format
   * @param {Array} jobs - Job list
   * @param {Object} detailsCache - Cache of job details
   * @returns {Array} Transformed field maps
   */
  transformJobsToFieldMaps(jobs, detailsCache) {
    return jobs.map((job) => {
      const details = detailsCache[job.id];

      const prodDupliValue = details?.['prod dupli'] || '';
      const colorValue = details?.Color || '';

      return {
        id: job.id,
        name: job.block_name || job.order_name || `Job ${job.id}`,
        customer: job.customer || 'No Customer',
        contractor: details?.contractor || details?.Contractor || '',
        area: job.area || job.gross_coverage_area || 0,
        status: job.status,
        orderNumber: job.order_number || '',
        requestedUrl: job.requested_url,
        workedUrl: job.worked_url,
        modifiedDate: job.modified_date,
        dueDate: job.due_date,
        productList: (details?.product_list || job.product_list) || '',
        prodDupli: prodDupliValue,
        color: colorValue,
        address: (details?.address || job.address) || '',
        notes: (details?.notes || job.notes) || '',
        deleted: job.deleted || false,
        rts: details?.RTS || false
      };
    });
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
        contractor: job.contractor || job.Contractor || '',  // Contractor field from Tracmap
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
        prodDupli: job['prod dupli'] || '',  // Custom field from Tracmap
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
      console.log(`🔍 Fetching worked geometry for job ${fieldId}...`);
      const response = await this.client.get(
        `/accounts/${config.accountId}/jobs/${fieldId}/geometry/worked`
      );
      console.log(`✅ Got worked geometry for job ${fieldId}`);
      return response.data;
    } catch (error) {
      console.log(`❌ Failed to get worked geometry for job ${fieldId}: ${error.message}`);
      // Return null instead of throwing - worked geometry might not exist
      return null;
    }
  }

  /**
   * Get worked geometry detailed (actual flight path lines)
   * @param {string} fieldId - Field/Job ID
   * @returns {Promise<Object>} Detailed working lines with flight path
   */
  async getWorkedGeometryDetailed(fieldId) {
    try {
      const response = await this.client.get(
        `/accounts/${config.accountId}/jobs/${fieldId}/geometry/worked/detailed`
      );
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Clear cache for a specific customer or all customers
   * @param {string} customerId - Optional customer ID to clear specific cache
   */
  clearCache(customerId = null) {
    if (customerId) {
      delete this.fieldMapsCache[customerId];
      console.log(`🗑️ Cleared cache for customer ${customerId}`);
    } else {
      this.fieldMapsCache = {};
      console.log('🗑️ Cleared all cache');
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getCacheStats() {
    const stats = {};
    for (const [customerId, cache] of Object.entries(this.fieldMapsCache)) {
      const age = Date.now() - cache.timestamp;
      const lastSync = cache.lastSyncDate ? new Date(cache.lastSyncDate) : null;
      stats[customerId] = {
        totalJobs: cache.fullJobList?.length || 0,
        cachedDetailsCount: Object.keys(cache.jobDetailsCache || {}).length,
        cacheAgeSeconds: Math.floor(age / 1000),
        expiresInSeconds: Math.floor((this.cacheExpiry - age) / 1000),
        lastSyncDate: lastSync ? lastSync.toISOString() : null,
        lastSyncAgeSeconds: lastSync ? Math.floor((Date.now() - cache.lastSyncDate) / 1000) : null
      };
    }
    return stats;
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
