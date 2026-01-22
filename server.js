require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const fs = require('fs');
const path = require('path');

// Use global fetch when available (Node 18+). If not, fall back to node-fetch (v2) for older Node.
let fetcher = globalThis.fetch || null;
if (!fetcher) {
  try {
    // node-fetch v2 supports CommonJS require
    // eslint-disable-next-line global-require
    fetcher = require('node-fetch');
  } catch (e) {
    fetcher = null;
  }
}

const app = express();
const PORT = process.env.PORT || 8000;
const KEY = process.env.GOOGLE_API_KEY || '';

// Simple request logger to help debugging (prints method and path)
app.use((req, res, next) => {
  console.log(new Date().toISOString(), req.method, req.url);
  next();
});

if (!KEY) {
  console.warn('Warning: GOOGLE_API_KEY is not set. The server will still run but API endpoints will return errors.');
}

// Security headers (CSP allows tile providers and Leaflet)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer-when-downgrade');
  res.setHeader('Permissions-Policy', 'geolocation=(self)');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://unpkg.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://unpkg.com https://cdn.jsdelivr.net https://fonts.googleapis.com; img-src 'self' data: https:; connect-src 'self' https://maps.googleapis.com https://maps.gstatic.com https://maps.googleapis.com/maps/api; font-src https://fonts.googleapis.com https://fonts.gstatic.com; frame-src 'none';");
  next();
});


// Determine the root directory - try multiple locations for Vercel compatibility
// Serve static CSS, JS, and other files by reading them directly (works in Vercel serverless)
app.get(/\.(css|js|json)$/, (req, res, next) => {
  const filePath = path.join(__dirname, req.path);
  
  // Security: prevent directory traversal
  const normalized = path.normalize(filePath);
  if (!normalized.startsWith(path.normalize(__dirname))) {
    return res.status(403).send('Forbidden');
  }
  
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    return next();
  }
  
  // Set content type based on file extension
  if (req.path.endsWith('.css')) {
    res.setHeader('Content-Type', 'text/css; charset=utf-8');
  } else if (req.path.endsWith('.js')) {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  } else if (req.path.endsWith('.json')) {
    res.setHeader('Content-Type', 'application/json');
  }
  
  res.sendFile(filePath);
});

// Catch-all route to serve index.html for root and unmatched paths
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Helper to call Google Places Web Services
function requireKey(res) {
  if (!KEY) {
    res.status(500).json({ error: 'GOOGLE_API_KEY not configured on the server' });
    return false;
  }
  if (!fetcher) {
    res.status(500).json({ error: 'Server fetch API not available; install a polyfill (node-fetch) or run Node 18+' });
    return false;
  }
  return true;
}

// Geocode: /api/geocode?address=...
app.get('/api/geocode', async (req, res) => {
  if (!requireKey(res)) return;
  const addr = req.query.address;
  if (!addr) return res.status(400).json({ error: 'address required' });
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addr)}&key=${KEY}`;
    const r = await fetcher(url);
    const j = await r.json();
    res.json(j);
  } catch (e) {
    res.status(500).json({ error: 'geocode failed' });
  }
});

// Nearby search: /api/nearby?lat=..&lng=..&radius=10000&keyword=jewelry
app.get('/api/nearby', async (req, res) => {
  if (!requireKey(res)) return;
  const { lat, lng, radius = 10000, keyword = 'jewelry' } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });
  try {
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${encodeURIComponent(lat)},${encodeURIComponent(lng)}&radius=${encodeURIComponent(radius)}&keyword=${encodeURIComponent(keyword)}&key=${KEY}`;
    const r = await fetcher(url);
    const j = await r.json();
    res.json(j);
  } catch (e) {
    res.status(500).json({ error: 'nearby search failed' });
  }
});

// Place details: /api/details?place_id=...
app.get('/api/details', async (req, res) => {
  if (!requireKey(res)) return;
  const place_id = req.query.place_id;
  if (!place_id) return res.status(400).json({ error: 'place_id required' });
  const fields = req.query.fields || 'formatted_phone_number,website,opening_hours,formatted_address,rating,url,photos';
  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(place_id)}&fields=${encodeURIComponent(fields)}&key=${KEY}`;
    const r = await fetcher(url);
    const j = await r.json();
    res.json(j);
  } catch (e) {
    res.status(500).json({ error: 'place details failed' });
  }
});

// Photo proxy: /api/photo?photoreference=...&maxwidth=400
app.get('/api/photo', async (req, res) => {
  if (!requireKey(res)) return;
  const { photoreference, maxwidth = 400 } = req.query;
  if (!photoreference) return res.status(400).send('photoreference required');
  // Photoreference values from the Places API can sometimes include
  // newline or whitespace characters when copied or extracted. Strip
  // all whitespace to ensure the parameter is valid for the Google API.
  const sanitizedRef = String(photoreference).replace(/\s+/g, '');
  try {
    const url = `https://maps.googleapis.com/maps/api/place/photo?photoreference=${encodeURIComponent(sanitizedRef)}&maxwidth=${encodeURIComponent(maxwidth)}&key=${KEY}`;
    // fetch the image and stream it
    const r = await fetcher(url);
    if (!r.ok) {
      console.error('photo fetch failed', { status: r.status, url });
      return res.status(502).send('photo fetch failed');
    }
    const contentType = r.headers.get('content-type') || 'image/jpeg';
    try {
      const arrayBuffer = await r.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', buffer.length);
      res.end(buffer);
    } catch (e) {
      // Fallback for older fetch implementations that expose a Node stream
      if (r.body && typeof r.body.pipe === 'function') {
        res.setHeader('Content-Type', contentType);
        r.body.pipe(res);
      } else {
        res.status(500).send('photo proxy failed');
      }
    }
  } catch (e) {
    console.error('photo proxy exception', e && e.stack ? e.stack : e);
    res.status(500).send('photo proxy failed');
  }
});

let server = null;
// In Vercel's serverless runtime, export the Express app instead of listening on a port
// Locally (or non-Vercel environments), start the HTTP server as usual
if (!process.env.VERCEL) {
  server = app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });

  // Better error reporting for common server issues (eg. EADDRINUSE)
  server.on('error', (err) => {
    console.error('Server error:', err);
    if (err && err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use.`);
    }
  });
}

// Export the Express app for Vercel serverless runtime
module.exports = app;

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
});
