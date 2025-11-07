# Terralink Backend API

Backend API for integrating Tabula API with Rotorsync iOS app.

## Features

- Customer search functionality
- Field map retrieval and management
- Bulk field map downloads for multiple customers
- RESTful API design
- Rate limiting and security middleware
- Error handling

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn

## Installation

```bash
npm install
```

## Configuration

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Update the `.env` file with your Tabula API credentials:
```env
TABULA_API_URL=https://test-api.tracmap.com
TABULA_API_KEY=your_api_key_here
TABULA_API_SECRET=your_api_secret_here
PORT=3000
NODE_ENV=production
```

## Running the Server

### Development mode (with auto-reload):
```bash
npm run dev
```

### Production mode:
```bash
npm start
```

## API Endpoints

### Health Check
- `GET /health` - Check server status

### Customers
- `GET /api/customers/search?q=searchTerm&limit=50` - Search for customers
- `GET /api/customers/:id` - Get customer by ID

### Field Maps
- `GET /api/field-maps/customer/:customerId` - Get field maps for a customer
- `POST /api/field-maps/bulk` - Get field maps for multiple customers
  ```json
  {
    "customerIds": ["id1", "id2", "id3"]
  }
  ```
- `GET /api/field-maps/:fieldId` - Get detailed field map data
- `GET /api/field-maps/:fieldId/download?format=geojson` - Download field map

## Deployment

### Deploy to VM (192.168.68.226)

1. SSH into the server:
```bash
sshpass -p 'ncat2406zik!' ssh user@192.168.68.226
```

2. Clone or copy the project to the server

3. Install dependencies:
```bash
cd terralink-backend
npm install
```

4. Set up environment variables in `.env`

5. Install PM2 for process management:
```bash
npm install -g pm2
```

6. Start the server:
```bash
pm2 start src/index.js --name terralink-backend
pm2 save
pm2 startup
```

## Testing

Test the API using curl:

```bash
# Health check
curl http://localhost:3000/health

# Search customers
curl "http://localhost:3000/api/customers/search?q=john"

# Get field maps for multiple customers
curl -X POST http://localhost:3000/api/field-maps/bulk \
  -H "Content-Type: application/json" \
  -d '{"customerIds": ["id1", "id2"]}'
```

## Notes

- The Tabula API endpoints and authentication mechanism will need to be updated once the actual API documentation is available
- Current implementation includes placeholder endpoints that will be finalized with real Tabula API specs
