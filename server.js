require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');

// Use global fetch when available (Node 18+). If not, server will error unless node-fetch is installed.
const fetcher = globalThis.fetch || null;

const app = express();
const PORT = process.env.PORT || 8000;
const KEY = process.env.GOOGLE_API_KEY || '';

if (!KEY) {
  console.warn('Warning: GOOGLE_API_KEY is not set. The server will still run but API endpoints will return errors.');
}

// Security headers (CSP allows tile providers and Leaflet)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer-when-downgrade');
  res.setHeader('Permissions-Policy', 'geolocation=(self)');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' https://unpkg.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://unpkg.com https://cdn.jsdelivr.net https://fonts.googleapis.com; img-src 'self' data: https:; connect-src 'self' https://maps.googleapis.com https://maps.gstatic.com https://maps.googleapis.com/maps/api; frame-src 'none';");
  next();
});

// Serve static assets
app.use(express.static(path.join(__dirname)));

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
  try {
    const url = `https://maps.googleapis.com/maps/api/place/photo?photoreference=${encodeURIComponent(photoreference)}&maxwidth=${encodeURIComponent(maxwidth)}&key=${KEY}`;
    // fetch the image and stream it
    const r = await fetcher(url);
    if (!r.ok) return res.status(502).send('photo fetch failed');
    res.setHeader('Content-Type', r.headers.get('content-type') || 'image/jpeg');
    r.body.pipe(res);
  } catch (e) {
    res.status(500).send('photo proxy failed');
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
