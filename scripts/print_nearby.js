#!/usr/bin/env node
const fetch = require('node-fetch');

function arg(name, def) {
  const p = process.argv.find(a => a.startsWith(`--${name}=`));
  if (!p) return def;
  return p.split('=')[1];
}

const lat = arg('lat');
const lng = arg('lng');
const radius = arg('radius', '5000');
const keyword = arg('keyword', 'jewelry');
const host = arg('host', 'http://localhost:8001');
const jsonOut = process.argv.includes('--json') || process.argv.includes('--json=true');

if (!lat || !lng) {
  console.error('Usage: node scripts/print_nearby.js --lat=... --lng=... [--radius=5000] [--keyword=jewelry] [--host=http://localhost:8001]');
  process.exit(1);
}

const url = `${host.replace(/\/$/, '')}/api/nearby?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&radius=${encodeURIComponent(radius)}&keyword=${encodeURIComponent(keyword)}`;

(async () => {
  try {
    const res = await fetch(url);
    const j = await res.json();
    if (!j.results || j.results.length === 0) {
      console.log('No results');
      return;
    }
    if (jsonOut) {
      console.log(JSON.stringify(j, null, 2));
      return;
    }
    console.log('Name | Rating | Phone | Vicinity');
    console.log('-------------------------------------');
    j.results.forEach(r => {
      const name = r.name || '';
      const rating = r.rating !== undefined ? r.rating : '';
      const phone = r.international_phone_number || r.formatted_phone_number || '';
      const vicinity = r.vicinity || r.formatted_address || '';
      console.log(`${name} | ${rating} | ${phone} | ${vicinity}`);
    });
  } catch (e) {
    console.error('Error calling nearby:', e.message || e);
    process.exit(2);
  }
})();
