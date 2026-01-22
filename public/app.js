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
      const resultsTitle = document.querySelector('.results h2');
      if (resultsTitle) {
        resultsTitle.textContent = '(0) Stores';
      }
      return;
    }
    renderPlaces(data.results);
  }).catch((err)=>{ console.error('nearby fetch error', err); document.getElementById('places-list').innerHTML = '<p>Search failed.</p>'; });
}

function renderPlaces(places){
  const list = document.getElementById('places-list');
  list.innerHTML = '';
  const bounds = L.latLngBounds();
  
  // Update the h2 to show the count
  const resultsTitle = document.querySelector('.results h2');
  if (resultsTitle) {
    resultsTitle.textContent = `(${places.length}) Stores`;
  }

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

    // Store place data for modal
    card.placeData = place;

    // Fetch details from server
    fetch(`/api/details?place_id=${encodeURIComponent(place.place_id)}`).then(r=>r.json()).then(payload=>{
      const detail = payload && payload.result ? payload.result : null;
      if(!detail) return;
      
      // Store full details on card for modal
      card.fullDetails = detail;

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

    // Click handler to open modal
    card.addEventListener('click', ()=>{ 
      openPlaceModal(card.placeData, card.fullDetails, lat, lng);
    });
  });

  map.fitBounds(bounds);
}

function openPlaceModal(place, details, lat, lng){
  const modal = document.getElementById('place-modal');
  const title = document.getElementById('modal-title');
  const rating = document.getElementById('modal-rating');
  const address = document.getElementById('modal-address');
  const phone = document.getElementById('modal-phone');
  const website = document.getElementById('modal-website');
  const hours = document.getElementById('modal-hours');
  const photos = document.getElementById('modal-photos');
  const directions = document.getElementById('modal-directions');
  const googleLink = document.getElementById('modal-google-link');

  // Set basic info
  title.textContent = place.name || 'Store Details';
  
  if(details && details.rating){
    rating.innerHTML = `<span style="color:#f59e0b;font-size:18px;">★</span> ${details.rating} ${details.user_ratings_total ? `(${details.user_ratings_total} reviews)` : ''}`;
  } else {
    rating.textContent = '';
  }

  address.textContent = (details && details.formatted_address) || place.vicinity || place.formatted_address || 'Address not available';
  
  if(details && details.formatted_phone_number){
    phone.innerHTML = `<a href="tel:${details.formatted_phone_number.replace(/\s+/g,'')}">${escapeHtml(details.formatted_phone_number)}</a>`;
  } else {
    phone.textContent = 'Phone not available';
  }

  if(details && details.website){
    website.innerHTML = `<a href="${escapeHtml(details.website)}" target="_blank" rel="noopener noreferrer">Visit Website</a>`;
  } else {
    website.textContent = 'Website not available';
  }

  // Hours
  hours.innerHTML = '';
  if(details && details.opening_hours && details.opening_hours.weekday_text){
    details.opening_hours.weekday_text.forEach(day => {
      const parts = day.split(': ');
      const div = document.createElement('div');
      div.innerHTML = `<strong>${parts[0]}</strong><span>${parts[1] || ''}</span>`;
      hours.appendChild(div);
    });
  } else {
    hours.textContent = 'Hours not available';
  }

  // Photos
  photos.innerHTML = '';
  const allPhotos = (details && details.photos) || (place.photos) || [];
  if(allPhotos.length > 0){
    allPhotos.forEach((photo, idx) => {
      const img = document.createElement('img');
      img.className = idx === 0 ? 'modal-photo main-photo' : 'modal-photo';
      img.src = `/api/photo?photoreference=${encodeURIComponent(photo.photo_reference)}&maxwidth=800`;
      img.alt = `${place.name} photo ${idx + 1}`;
      photos.appendChild(img);
    });
  } else {
    photos.innerHTML = '<p style="padding:20px;color:#888;">No photos available</p>';
  }

  // Links
  directions.href = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  googleLink.href = (details && details.url) || `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

  // Show modal
  modal.classList.add('show');
}

function closePlaceModal(){
  const modal = document.getElementById('place-modal');
  modal.classList.remove('show');
}

window.addEventListener('load', ()=>{ 
  initMap();
  
  // Close modal handlers
  document.getElementById('modal-close').addEventListener('click', closePlaceModal);
  document.getElementById('place-modal').addEventListener('click', (e) => {
    if(e.target.id === 'place-modal') closePlaceModal();
  });
  document.addEventListener('keydown', (e) => {
    if(e.key === 'Escape') closePlaceModal();
  });
});
// (Removed duplicated Google Maps code; this file uses Leaflet declared above)
