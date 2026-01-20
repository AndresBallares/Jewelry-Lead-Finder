# Jewelry-Lead-Finder

Simple frontend app that searches Google Places for jewelry stores and shows results + map.

Setup
1. Get a Google Maps API key with Maps JavaScript API and Places API enabled.
2. Restrict the API key to your site or local environment (use HTTP referrers).
3. Do NOT commit the API key to source control. Instead set it as an environment variable and run the included server which will inject the key into the served page.

Run (recommended - serves files with security headers and proxies Places requests so the API key is never exposed to clients)

```bash
# install deps
npm install
# set your key (macOS / Linux)
export GOOGLE_API_KEY="YOUR_KEY_HERE"
npm start
# then open http://localhost:8000
```

Run & Stop (background, logs)
```bash
# start in background (writes logs to server.log and pid to server.pid)
nohup env PORT=8001 node server.js > server.log 2>&1 & echo $! > server.pid

# check process and listening port
ps -p $(cat server.pid) -o pid,cmd
lsof -n -P -iTCP:8001 -sTCP:LISTEN

# view logs
tail -n 200 server.log

# stop the server
kill $(cat server.pid) || kill -9 $(cat server.pid)
rm server.pid
```

Quick smoke tests
```bash
# headers
curl -v --max-time 10 --noproxy '*' -I http://localhost:8001

# homepage snapshot
curl -s --max-time 10 http://localhost:8001 | sed -n '1,60p'

# geocode (replace with desired address)
curl -v --max-time 15 --noproxy '*' "http://localhost:8001/api/geocode?address=10001"
```

If you prefer a static server for development, you may still use `python3 -m http.server`, but you must insert the Maps API key into `index.html` before opening the page — this is NOT recommended for committing to source control.

Notes
- The app supports "Near me" (uses browser geolocation) or searching by ZIP / town / city.
- The app fetches place details (phone & website) via the Places Details endpoint.
- For production, always restrict your API key, and keep secrets out of the repository. This server demonstrates one pattern: keep the key in an environment variable and inject it at serve-time.

Security hardening applied in this repo:
- Removed embedded API key from `index.html`.
- Added `server.js` to host the app and provide server-side proxy endpoints for Google Places Web Services so the API key is never sent to clients.
- Added Content-Security-Policy and other security headers in `server.js`.
- Escaped HTML displayed in map popups to reduce injection risk.

Notes about the proxy approach:
- The server exposes endpoints under `/api/*` that call Google Web Services using the server-side `GOOGLE_API_KEY`.
- The client uses Leaflet for map rendering (no API key required) and requests Places data from the server.

