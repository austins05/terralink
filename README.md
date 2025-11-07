# Terralink Backend API

A Node.js/Express backend server that integrates the Tabula (Tracmap) API with the Rotorsync iOS application, providing efficient field map management, contractor data, and real-time monitoring capabilities.

## 🌟 Overview

Terralink Backend acts as an intelligent middleware between the Rotorsync iOS app and the Tabula API, offering:

- **Smart Caching**: Implements Tabula's recommended polling pattern with incremental sync
- **Field Map Management**: Complete access to field maps, geometry data, and job details
- **Contractor Integration**: Automatic contractor information fetching and enrichment
- **Real-time Monitoring**: Built-in dashboard for tracking API usage and performance
- **Detailed Geometry Support**: Access to both requested and worked geometry, including detailed flight paths

## 🚀 Features

### Core Functionality
- **Customer & Field Map Management**: Search, retrieve, and manage field maps across multiple customers
- **Geometry Data Access**:
  - Requested geometry (planned field boundaries)
  - Worked geometry (actual coverage)
  - Worked detailed geometry (full flight path data)
- **Contractor Data**: Automatically fetches and includes contractor information in all responses
- **Custom Field Support**: Includes Tracmap custom fields (Color, prod dupli, RTS flag, etc.)

### Performance & Efficiency
- **Smart Caching System**:
  - 5-minute cache expiry per customer
  - Incremental sync using `from_date` parameter
  - Only fetches changed jobs (follows Tabula best practices)
  - Caches job details to avoid redundant API calls
- **Bulk Operations**: Support for fetching field maps from multiple customers in parallel
- **Error Handling**: Comprehensive error handling with meaningful error messages

### Monitoring & Observability
- **Real-time Dashboard**: Visual monitoring interface at `http://server:3000/`
- **Dual Statistics Tracking**:
  - Backend requests (from iOS app)
  - Tabula API requests (to Tabula)
- **Performance Metrics**: Response times, success rates, request counts
- **Top Endpoints**: Track most-used API endpoints
- **Auto-refresh**: 5-second auto-refresh for real-time monitoring

## 📋 Prerequisites

- **Node.js**: v16 or higher
- **npm**: v7 or higher
- **Tabula API Credentials**: API token from Tracmap/Tabula

## 🔧 Installation

### 1. Clone the Repository

```bash
git clone git@github.com:austins05/terralink.git
cd terralink
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Tabula API Configuration
TABULA_API_URL=https://test-api.tracmap.com/v1
TABULA_API_TOKEN=your_api_token_here

# Server Configuration
PORT=3000
NODE_ENV=production

# CORS Configuration
ALLOWED_ORIGINS=*
```

## 🏃 Running the Server

### Development Mode (with auto-reload)

```bash
npm run dev
```

### Production Mode

```bash
npm start
```

### Using PM2 (Recommended for Production)

```bash
# Install PM2 globally
npm install -g pm2

# Start the server
pm2 start src/index.js --name terralink-backend

# Save PM2 configuration
pm2 save

# Set PM2 to start on boot
pm2 startup
```

## 📡 API Endpoints

### Health Check

**GET** `/health`

Returns server status and uptime.

### Customer Management

#### Search Customers
**GET** `/api/customers/search?q=searchTerm&limit=50`

#### Get Customer by ID
**GET** `/api/customers/:id`

### Field Maps

#### Get Field Maps for Customer
**GET** `/api/field-maps/customer/:customerId`

#### Get Recent Field Maps
**GET** `/api/field-maps/recent?limit=20`

#### Get Field Map Details
**GET** `/api/field-maps/:fieldId`

#### Get Field Geometry
**GET** `/api/field-maps/:fieldId/geometry?type={requested|worked|worked-detailed}`

**Query Parameters:**
- `type` (string):
  - `requested`: Planned field boundaries
  - `worked`: Actual coverage polygons
  - `worked-detailed`: Detailed flight path (LineStrings with full coverage data)

#### Bulk Field Maps
**POST** `/api/field-maps/bulk`

### Cache Management

#### Get Cache Statistics
**GET** `/api/field-maps/cache/stats`

#### Clear Cache
**DELETE** `/api/field-maps/cache/clear?customerId=5429`

### Monitoring

#### Access Dashboard
**GET** `/` → Visual monitoring interface

#### Get Monitor Statistics
**GET** `/api/monitor/stats`

#### Trigger Sync
**POST** `/api/monitor/sync`

## 🗄️ Caching System

### How It Works

The backend implements Tabula's recommended polling pattern:

1. **First Request**: Fetches all jobs from the last 90 days
2. **Subsequent Requests**: Uses `from_date` parameter to fetch only modified jobs
3. **Cache Validation**: Returns cached data if no changes and cache is valid
4. **Deleted Jobs**: Automatically removed from cache

### Benefits

- Reduced API calls (only fetches changes)
- Faster response times
- Efficient detail fetching
- Automatic cleanup

## 🚢 Deployment

### Current VM Setup

**Server:** 192.168.68.226:3000

```bash
# SSH into VM
ssh user@192.168.68.226

# Pull latest changes
cd terralink-backend
git pull origin master

# Install dependencies (if needed)
npm install

# Restart with PM2
pm2 restart terralink-backend

# Check status
pm2 status
pm2 logs terralink-backend
```

## 📁 Project Structure

```
terralink-backend/
├── src/
│   ├── index.js                 # Main server
│   ├── config/tabula.js         # Tabula config
│   ├── middleware/              # Middleware
│   ├── routes/                  # API routes
│   │   ├── customers.js
│   │   ├── fieldMaps.js
│   │   └── monitor.js
│   └── services/
│       └── tabulaService.js     # Tabula API integration & caching
├── public/
│   └── index.html               # Monitoring dashboard
├── .env                          # Environment config
├── .env.example                 # Environment template
├── package.json
└── README.md
```

## 🧪 Testing

```bash
# Health check
curl http://localhost:3000/health

# Get field maps
curl http://localhost:3000/api/field-maps/customer/5429

# Get detailed geometry
curl "http://localhost:3000/api/field-maps/37469/geometry?type=worked-detailed"

# Check cache stats
curl http://localhost:3000/api/field-maps/cache/stats
```

## 🐛 Troubleshooting

### Check PM2 Logs
```bash
pm2 logs terralink-backend --err
```

### Common Issues
- **401 Unauthorized**: Check TABULA_API_TOKEN in .env
- **Port in use**: Change PORT in .env
- **Cache issues**: Clear cache via DELETE /api/field-maps/cache/clear

## 📝 Version History

### v1.0.0 (November 2025)
- Initial release
- Smart caching with incremental sync
- Contractor data integration
- Monitoring dashboard
- Worked detailed geometry support
- Cache management endpoints

## 🔗 Links

- **GitHub**: https://github.com/austins05/terralink
- **Monitoring Dashboard**: http://192.168.68.226:3000/

## 📄 License

MIT License

---

**Built for efficient field map management and Rotorsync integration**
