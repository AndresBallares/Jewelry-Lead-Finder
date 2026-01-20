// Client using Leaflet for map and server-side Google Places proxy
let map;
let markers = [];

function escapeHtml(str){
  if(!str) return '';
  return String(str).replace(/[&<>"'`]/g, (s) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',"`":'&#96;'
  })[s]);
}

function initMap(){
  console.log('initMap called');
  const defaultCenter = [39.8283, -98.5795];
  map = L.map('map').setView(defaultCenter, 4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  document.getElementById('search-btn').addEventListener('click', doSearch);
  document.getElementById('query-input').addEventListener('keydown', (e)=>{ if(e.key==='Enter') doSearch(); });
}

function clearMarkers(){
  markers.forEach(m=>map.removeLayer(m));
  markers = [];
}

function doSearch(){
  console.log('doSearch invoked');
  const mode = document.getElementById('search-mode').value;
  const query = document.getElementById('query-input').value.trim();
  if(mode === 'near'){
    if(!navigator.geolocation){ alert('Geolocation not supported by your browser'); return; }
    navigator.geolocation.getCurrentPosition(pos=>{
      console.log('geolocation success', pos.coords);
      const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      map.setView([loc.lat, loc.lng], 14);
      searchNearby(loc);
    }, ()=>alert('Unable to retrieve your location'));
  } else {
    if(!query){ alert('Please enter a ZIP, town or city'); return; }
    fetch(`/api/geocode?address=${encodeURIComponent(query)}`).then(r=>r.json()).then(data=>{
      console.log('geocode response', data);
      if(data.status === 'OK' && data.results && data.results[0]){
        const loc = data.results[0].geometry.location;
        map.setView([loc.lat, loc.lng], 13);
        searchNearby({ lat: loc.lat, lng: loc.lng });
      } else {
        alert('Location not found');
      }
    }).catch(()=>alert('Location lookup failed'));
  }
}

function searchNearby(location){
  console.log('searchNearby', location);
  clearMarkers();
  document.getElementById('places-list').innerHTML = '<p>Searching for jewelry stores…</p>';
  fetch(`/api/nearby?lat=${encodeURIComponent(location.lat)}&lng=${encodeURIComponent(location.lng)}&radius=10000&keyword=jewelry`).then(r=>r.json()).then(data=>{
    console.log('nearby response', data);
    if(data.status !== 'OK' || !data.results || data.results.length===0){
      document.getElementById('places-list').innerHTML = '<p>No jewelry stores found.</p>';
      return;
    }
    renderPlaces(data.results);
  }).catch((err)=>{ console.error('nearby fetch error', err); document.getElementById('places-list').innerHTML = '<p>Search failed.</p>'; });
}

function renderPlaces(places){
  const list = document.getElementById('places-list');
  list.innerHTML = '';
  const bounds = L.latLngBounds();

  places.forEach(place => {
    const card = document.createElement('div'); card.className = 'place-card';
    const img = document.createElement('img'); img.className = 'place-photo'; img.alt = place.name; img.src = 'https://via.placeholder.com/200x160?text=Loading';
    const info = document.createElement('div'); info.className = 'place-info';
    const title = document.createElement('h3'); title.textContent = place.name;
    const addr = document.createElement('p'); addr.textContent = place.vicinity || place.formatted_address || '';
    const meta = document.createElement('p'); meta.style.fontSize='13px'; meta.style.color='#666';
    const actions = document.createElement('div'); actions.className='place-actions';

    info.appendChild(title); info.appendChild(addr); info.appendChild(meta); info.appendChild(actions);
    card.appendChild(img); card.appendChild(info); list.appendChild(card);

    if(!place.geometry || !place.geometry.location) return;
    const lat = place.geometry.location.lat; const lng = place.geometry.location.lng;
    const marker = L.marker([lat,lng]).addTo(map); markers.push(marker); bounds.extend([lat,lng]);
    marker.bindPopup(`<strong>${escapeHtml(place.name)}</strong><br/>${escapeHtml(place.vicinity||place.formatted_address||'')}`);

    card.addEventListener('click', ()=>{ map.setView([lat,lng],15); marker.openPopup(); });

    // Fetch details from server
    fetch(`/api/details?place_id=${encodeURIComponent(place.place_id)}`).then(r=>r.json()).then(payload=>{
      const detail = payload && payload.result ? payload.result : null;
      if(!detail) return;
      if(detail.photos && detail.photos.length){
        const ref = detail.photos[0].photo_reference;
        img.src = `/api/photo?photoreference=${encodeURIComponent(ref)}&maxwidth=400`;
      } else if(place.photos && place.photos.length && place.photos[0].photo_reference){
        const ref = place.photos[0].photo_reference;
        img.src = `/api/photo?photoreference=${encodeURIComponent(ref)}&maxwidth=400`;
      } else { img.src = 'https://via.placeholder.com/200x160?text=No+photo'; }

      if(detail.formatted_address) addr.textContent = detail.formatted_address;
      const rating = detail.rating ? `⭐ ${detail.rating}` : '';
      let hours = '';
      if(detail.opening_hours && detail.opening_hours.weekday_text) hours = detail.opening_hours.weekday_text.slice(0,3).join(' | ');
      meta.textContent = [rating, hours].filter(Boolean).join(' • ');

      actions.innerHTML = '';
      if(detail.formatted_phone_number){ const a = document.createElement('a'); a.href=`tel:${detail.formatted_phone_number.replace(/\s+/g,'')}`; a.textContent = detail.formatted_phone_number; actions.appendChild(a); }
      if(detail.website){ const w = document.createElement('a'); w.href=detail.website; w.target='_blank'; w.rel='noopener noreferrer'; w.textContent='Website'; actions.appendChild(w); }
      if(detail.url){ const g = document.createElement('a'); g.href=detail.url; g.target='_blank'; g.rel='noopener noreferrer'; g.textContent='Open in Google Maps'; actions.appendChild(g); }
    }).catch(()=>{});
  });

  map.fitBounds(bounds);
}

window.addEventListener('load', ()=>{ initMap(); });
// (Removed duplicated Google Maps code; this file uses Leaflet declared above)
