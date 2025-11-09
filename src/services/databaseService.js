const initSqlJs = require('sql.js');
const fs = require('fs').promises;
const path = require('path');

class DatabaseService {
  constructor() {
    this.db = null;
    this.dbPath = path.join(__dirname, '../../terralink-jobs.db');
    this.SQL = null;
  }

  /**
   * Initialize database and create tables
   */
  async initialize() {
    try {
      // Initialize sql.js
      this.SQL = await initSqlJs();

      // Try to load existing database file
      try {
        const buffer = await fs.readFile(this.dbPath);
        this.db = new this.SQL.Database(buffer);
        console.log('✓ Loaded existing database:', this.dbPath);
      } catch (error) {
        // Create new database if file doesn't exist
        this.db = new this.SQL.Database();
        console.log('✓ Created new database:', this.dbPath);
      }

      await this.createTables();
      await this.saveToDisk();

      return true;
    } catch (error) {
      console.error('Database initialization error:', error);
      throw error;
    }
  }

  /**
   * Save database to disk
   */
  async saveToDisk() {
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      await fs.writeFile(this.dbPath, buffer);
    } catch (error) {
      console.error('Save to disk error:', error);
      throw error;
    }
  }

  /**
   * Create database tables
   */
  async createTables() {
    const createJobsTable = `
      CREATE TABLE IF NOT EXISTS jobs (
        id INTEGER PRIMARY KEY,
        name TEXT,
        customer TEXT,
        contractor TEXT,
        contractorId INTEGER,
        area REAL,
        status TEXT,
        orderNumber TEXT,
        orderType TEXT,
        subtype TEXT,
        address TEXT,
        notes TEXT,
        productList TEXT,
        prodDupli TEXT,
        color TEXT,
        boundaryColor TEXT,
        requestedUrl TEXT,
        workedUrl TEXT,
        modifiedDate INTEGER,
        dueDate INTEGER,
        creationDate INTEGER,
        deleted INTEGER DEFAULT 0,
        rts INTEGER DEFAULT 0,
        urgency TEXT,

        firstSeenAt INTEGER,
        lastUpdatedAt INTEGER,
        season TEXT,
        fullData TEXT,

        requestedGeometry TEXT,
        workedGeometry TEXT,
        workedDetailedGeometry TEXT
      );
    `;

    const createIndexes = `
      CREATE INDEX IF NOT EXISTS idx_contractor ON jobs(contractor);
      CREATE INDEX IF NOT EXISTS idx_season ON jobs(season);
      CREATE INDEX IF NOT EXISTS idx_creationDate ON jobs(creationDate);
      CREATE INDEX IF NOT EXISTS idx_status ON jobs(status);
      CREATE INDEX IF NOT EXISTS idx_deleted ON jobs(deleted);
    `;

    this.db.run(createJobsTable);
    this.db.run(createIndexes);

    console.log('✓ Database tables created/verified');
  }

  /**
   * Save or update a job in the database
   */
  async saveJob(job, geometry = null) {
    const now = Math.floor(Date.now() / 1000);
    const season = this.getSeason(job.creationDate || now);

    const sql = `
      INSERT OR REPLACE INTO jobs (
        id, name, customer, contractor, contractorId, area, status,
        orderNumber, orderType, subtype, address, notes, productList,
        prodDupli, color, boundaryColor, requestedUrl, workedUrl,
        modifiedDate, dueDate, creationDate, deleted, rts, urgency,
        firstSeenAt, lastUpdatedAt, season, fullData,
        requestedGeometry, workedGeometry, workedDetailedGeometry
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      job.id,
      job.name || '',
      job.customer || '',
      job.contractor || '',
      job.contractorId || null,
      job.area || 0,
      job.status || '',
      job.orderNumber || '',
      job.orderType || '',
      job.subtype || '',
      job.address || '',
      job.notes || '',
      job.productList || '',
      job.prodDupli || '',
      job.color || '',
      job.boundaryColor || '',
      job.requestedUrl || '',
      job.workedUrl || '',
      job.modifiedDate || null,
      job.dueDate || null,
      job.creationDate || null,
      job.deleted ? 1 : 0,
      job.rts ? 1 : 0,
      job.urgency || '',
      now,
      now,
      season,
      JSON.stringify(job),
      geometry?.requested ? JSON.stringify(geometry.requested) : null,
      geometry?.worked ? JSON.stringify(geometry.worked) : null,
      geometry?.workedDetailed ? JSON.stringify(geometry.workedDetailed) : null
    ];

    this.db.run(sql, params);
    await this.saveToDisk();

    return { id: job.id };
  }

  /**
   * Save multiple jobs in a transaction
   */
  async saveJobs(jobs, geometryMap = null) {
    const results = { saved: 0, updated: 0, errors: 0 };

    for (const job of jobs) {
      try {
        const geometry = geometryMap ? geometryMap[job.id] : null;
        await this.saveJob(job, geometry);
        results.saved++;
      } catch (error) {
        console.error(`Error saving job ${job.id}:`, error.message);
        results.errors++;
      }
    }

    return results;
  }

  /**
   * Get season string from timestamp
   */
  getSeason(timestamp) {
    if (!timestamp) return 'unknown';

    const date = new Date(timestamp * 1000);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;

    if (month >= 3 && month <= 5) return year + '-Spring';
    if (month >= 6 && month <= 8) return year + '-Summer';
    if (month >= 9 && month <= 11) return year + '-Fall';
    return year + '-Winter';
  }

  /**
   * Get all jobs for a season
   */
  async getJobsBySeason(season) {
    const sql = `SELECT * FROM jobs WHERE season = ? AND deleted = 0 ORDER BY creationDate DESC`;
    const results = this.db.exec(sql, [season]);

    if (!results.length) return [];

    return this.resultsToJobs(results[0]);
  }

  /**
   * Get jobs by date range
   */
  async getJobsByDateRange(startDate, endDate) {
    const sql = `SELECT * FROM jobs WHERE creationDate >= ? AND creationDate <= ? AND deleted = 0 ORDER BY creationDate DESC`;
    const results = this.db.exec(sql, [startDate, endDate]);

    if (!results.length) return [];

    return this.resultsToJobs(results[0]);
  }

  /**
   * Get all jobs for a contractor
   */
  async getJobsByContractor(contractor) {
    const sql = `SELECT * FROM jobs WHERE contractor = ? AND deleted = 0 ORDER BY creationDate DESC`;
    const results = this.db.exec(sql, [contractor]);

    if (!results.length) return [];

    return this.resultsToJobs(results[0]);
  }

  /**
   * Get all jobs (with optional limit)
   */
  async getAllJobs(limit = null) {
    const sql = limit
      ? `SELECT * FROM jobs WHERE deleted = 0 ORDER BY creationDate DESC LIMIT ?`
      : `SELECT * FROM jobs WHERE deleted = 0 ORDER BY creationDate DESC`;

    const results = limit
      ? this.db.exec(sql, [limit])
      : this.db.exec(sql);

    if (!results.length) return [];

    return this.resultsToJobs(results[0]);
  }

  /**
   * Get database statistics
   */
  async getStats() {
    const queries = [
      { key: 'totalJobs', sql: 'SELECT COUNT(*) as count FROM jobs WHERE deleted = 0' },
      { key: 'deletedJobs', sql: 'SELECT COUNT(*) as count FROM jobs WHERE deleted = 1' },
      { key: 'contractors', sql: 'SELECT COUNT(DISTINCT contractor) as count FROM jobs WHERE deleted = 0' },
      { key: 'oldestJob', sql: 'SELECT MIN(creationDate) as value FROM jobs WHERE deleted = 0' },
      { key: 'newestJob', sql: 'SELECT MAX(creationDate) as value FROM jobs WHERE deleted = 0' }
    ];

    const stats = {};

    for (const query of queries) {
      try {
        const results = this.db.exec(query.sql);
        if (results.length && results[0].values.length) {
          const value = results[0].values[0][0];
          stats[query.key] = value || 0;
        } else {
          stats[query.key] = 0;
        }
      } catch (error) {
        console.error(`Stats query error for ${query.key}:`, error);
        stats[query.key] = 0;
      }
    }

    // Get seasons breakdown
    try {
      const seasonResults = this.db.exec('SELECT season, COUNT(*) as count FROM jobs WHERE deleted = 0 GROUP BY season');
      if (seasonResults.length && seasonResults[0].values.length) {
        stats.seasons = seasonResults[0].values.map(row => ({
          season: row[0],
          count: row[1]
        }));
      } else {
        stats.seasons = [];
      }
    } catch (error) {
      stats.seasons = [];
    }

    return stats;
  }

  /**
   * Convert sql.js results to job objects
   */
  resultsToJobs(result) {
    const jobs = [];
    const columns = result.columns;
    const values = result.values;

    for (const row of values) {
      const rowObj = {};
      columns.forEach((col, idx) => {
        rowObj[col] = row[idx];
      });

      // Construct job from columns
      let jobData;

      // Try to parse fullData if available
      try {
        if (rowObj.fullData) {
          jobData = JSON.parse(rowObj.fullData);
        }
      } catch (error) {
        // Fall through to manual construction
      }

      // If no fullData, construct from columns
      if (!jobData) {
        jobData = {
        id: rowObj.id,
        name: rowObj.name,
        customer: rowObj.customer,
        contractor: rowObj.contractor,
        contractorId: rowObj.contractorId,
        area: rowObj.area,
        status: rowObj.status,
        orderNumber: rowObj.orderNumber,
        orderType: rowObj.orderType,
        subtype: rowObj.subtype,
        address: rowObj.address,
        notes: rowObj.notes,
        productList: rowObj.productList,
        prodDupli: rowObj.prodDupli,
        color: rowObj.color,
        boundaryColor: rowObj.boundaryColor,
        requestedUrl: rowObj.requestedUrl,
        workedUrl: rowObj.workedUrl,
        modifiedDate: rowObj.modifiedDate,
        dueDate: rowObj.dueDate,
        creationDate: rowObj.creationDate,
          deleted: rowObj.deleted === 1,
          rts: rowObj.rts === 1,
          urgency: rowObj.urgency
        };
      }

      // Always add geometry fields if available (regardless of fullData)
      if (rowObj.requestedGeometry) {
        try {
          jobData.requestedGeometry = JSON.parse(rowObj.requestedGeometry);
        } catch (e) {
          console.error('Error parsing requestedGeometry:', e.message);
        }
      }
      if (rowObj.workedGeometry) {
        try {
          jobData.workedGeometry = JSON.parse(rowObj.workedGeometry);
        } catch (e) {
          console.error('Error parsing workedGeometry:', e.message);
        }
      }
      if (rowObj.workedDetailedGeometry) {
        try {
          jobData.workedDetailedGeometry = JSON.parse(rowObj.workedDetailedGeometry);
        } catch (e) {
          console.error('Error parsing workedDetailedGeometry:', e.message);
        }
      }

      jobs.push(jobData);
    }

    return jobs;
  }

  /**
   * Close database connection
   */
  async close() {
    if (this.db) {
      await this.saveToDisk();
      this.db.close();
      console.log('✓ Database connection closed and saved');
    }
  }
}

module.exports = new DatabaseService();
