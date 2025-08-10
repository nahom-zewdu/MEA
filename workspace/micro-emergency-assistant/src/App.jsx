import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import Profile from './Profile'

const MAP_TILES = {
  light: { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attrib: '&copy; OpenStreetMap contributors' },
  carto: { url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', attrib: '&copy; CARTO & OpenStreetMap contributors' },
  dark:  { url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',  attrib: '&copy; CARTO & OpenStreetMap contributors' }
}

const CATEGORIES = [
  { key: 'all', label: 'all', emoji: '⭐', icon: '⭐' },
  { key: 'police', label: 'police', emoji: '🛡️', icon: '🛡️' },
  { key: 'ambulance', label: 'ambulance', emoji: '🚑', icon: '➕' },
  { key: 'fire', label: 'fire', emoji: '🚒', icon: '🔥' },
  { key: 'hospital', label: 'hospital', emoji: '🏥', icon: '🏥' },
  { key: 'pharmacy', label: 'pharmacy', emoji: '💊', icon: '💊' },
]

const ADDIS_FALLBACK = { lat: 9.010793, lon: 38.761253 }

function toDivIcon(htmlClass, content) { return L.divIcon({ className: '', html: `<div class="marker ${htmlClass}">${content}</div>`, iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -28] }) }

const userIcon = toDivIcon('user', '•')
function serviceIconFor(type) { const match = CATEGORIES.find(c => c.key === type); return toDivIcon(type, match?.icon ?? '📍') }

function haversineKm(a, b) { const R = 6371; const dLat = ((b.lat - a.lat) * Math.PI) / 180; const dLon = ((b.lon - a.lon) * Math.PI) / 180; const lat1 = (a.lat * Math.PI) / 180; const lat2 = (b.lat * Math.PI) / 180; const h = Math.sin(dLat/2)**2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon/2)**2; return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1-h)) }

function calculateETA(distanceKm, mode = 'driving') { const speed = mode === 'walking' ? 5 : 40; return Math.round((distanceKm / speed) * 60) }

function findNearest(user, type, data, count = 1) { const filtered = data.filter(d => d.type === type); if (filtered.length === 0) return count === 1 ? null : []; const withDistance = filtered.map(item => ({ ...item, distanceKm: haversineKm(user, { lat: item.lat, lon: item.lon }) })); withDistance.sort((a, b) => a.distanceKm - b.distanceKm); return count === 1 ? withDistance[0] : withDistance.slice(0, count) }

function RecenterOnUser({ center }) { const map = useMap(); useEffect(() => { if (center) map.setView([center.lat, center.lon], map.getZoom() || 13) }, [center, map]); return null }

export default function App() {
  const [selected, setSelected] = useState('all')
  const [user, setUser] = useState(null)
  const [data, setData] = useState([])
  const [error, setError] = useState('')
  const [language, setLanguage] = useState('en')
  const [translations, setTranslations] = useState({})
  const [showEmergencyModal, setShowEmergencyModal] = useState(false)
  const [smartEmergencyMode, setSmartEmergencyMode] = useState(false)
  const [isOffline, setIsOffline] = useState(false)
  const [showToast, setShowToast] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [showShareModal, setShowShareModal] = useState(false)
  const [mapTheme, setMapTheme] = useState('light')

  // Panic/Tracking state
  const [isPanic, setIsPanic] = useState(false)
  const trackingTimerRef = useRef(null)
  const [responders, setResponders] = useState([])
  const [responderPositions, setResponderPositions] = useState([])
  const [responderAccepted, setResponderAccepted] = useState(false)
  const emergencyBtnPressRef = useRef({ count: 0, last: 0, longPress: null })

  useEffect(() => { fetch('/translations.json').then(r => r.json()).then(setTranslations).catch(() => {}) }, [])
  useEffect(() => { fetch('/emergency_data.json').then(r => r.json()).then(setData).catch(() => setError('Failed to load emergency data')) }, [])
  useEffect(() => { if (!('geolocation' in navigator)) { setUser(ADDIS_FALLBACK); return } navigator.geolocation.getCurrentPosition(pos => setUser({ lat: pos.coords.latitude, lon: pos.coords.longitude }), () => setUser(ADDIS_FALLBACK), { enableHighAccuracy: true, maximumAge: 10_000, timeout: 10_000 }) }, [])
  useEffect(() => { const on = () => setIsOffline(false), off = () => setIsOffline(true); window.addEventListener('online', on); window.addEventListener('offline', off); setIsOffline(!navigator.onLine); return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) } }, [])
  useEffect(() => { if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/sw.js').catch(() => {}) } }, [])

  const nearestByCategory = useMemo(() => { if (!user || data.length === 0) return {}; const out = {}; for (const key of ['police', 'ambulance', 'fire', 'hospital', 'pharmacy']) { const res = findNearest(user, key, data, 3); if (res && res.length > 0) out[key] = res } return out }, [user, data])

  const mapCenter = user ?? ADDIS_FALLBACK
  const visibleKeys = selected === 'all' ? Object.keys(nearestByCategory) : (nearestByCategory[selected] ? [selected] : [])
  const t = translations[language] || translations.en || {}

  const showToastMsg = (msg) => { setToastMessage(msg); setShowToast(true); setTimeout(() => setShowToast(false), 3000) }

  const startPanicMode = async () => {
    if (isPanic) return
    setIsPanic(true)
    showToastMsg('Alert sent to 3 contacts & local authorities')
    // Load mock responders
    try {
      const res = await fetch('/responders.json')
      const list = await res.json()
      setResponders(list)
      // Initialize positions
      setResponderPositions(list.map(r => ({ id: r.id, lat: r.lat, lon: r.lon })))
    } catch {}
    // Simulate GPS sending and movement every 5s
    trackingTimerRef.current = setInterval(() => {
      if (!user) return
      // Mock slight jitter in user location
      setUser(prev => prev ? { lat: prev.lat + (Math.random()-0.5)*0.0005, lon: prev.lon + (Math.random()-0.5)*0.0005 } : prev)
      // Mock POST to endpoint (no-op)
      fetch('/mock-track', { method: 'POST', body: JSON.stringify({ ts: Date.now(), user }) }).catch(() => {})
      // Move responders closer to user
      setResponderPositions(prev => prev.map(p => {
        if (!user) return p
        const step = 0.0006
        const dLat = user.lat - p.lat
        const dLon = user.lon - p.lon
        const dist = Math.hypot(dLat, dLon)
        if (dist < 0.0008) return p // close enough
        return { ...p, lat: p.lat + (dLat/dist)*step, lon: p.lon + (dLon/dist)*step }
      }))
    }, 5000)
    // After 5s, show acceptance once
    setTimeout(() => setResponderAccepted(true), 5000)
  }

  const stopPanicMode = () => {
    setIsPanic(false)
    setResponderAccepted(false)
    if (trackingTimerRef.current) clearInterval(trackingTimerRef.current)
    trackingTimerRef.current = null
  }

  const handleEmergencyCall = (category) => { const nearest = nearestByCategory[category]?.[0]; if (nearest) window.location.href = `tel:${nearest.phone}`; setShowEmergencyModal(false) }
  const handleSmartEmergency = () => { if (!user || !smartEmergencyMode) { setShowEmergencyModal(true); return } const hospitalNearest = nearestByCategory.hospital?.[0]; const fireNearest = nearestByCategory.fire?.[0]; const policeNearest = nearestByCategory.police?.[0]; let targetService = null; if (hospitalNearest && hospitalNearest.distanceKm <= 1) targetService = nearestByCategory.ambulance?.[0]; else if (fireNearest && hospitalNearest && fireNearest.distanceKm < hospitalNearest.distanceKm) targetService = fireNearest; else targetService = policeNearest; if (targetService) window.location.href = `tel:${targetService.phone}`; else setShowEmergencyModal(true) }
  const shareVia = async (medium) => { if (!user) return; const mapsUrl = `https://maps.google.com/?q=${user.lat},${user.lon}`; const message = `My location: ${mapsUrl}`; const urls = { whatsapp: `https://wa.me/?text=${encodeURIComponent(message)}`, telegram: `https://t.me/share/url?url=${encodeURIComponent(mapsUrl)}&text=${encodeURIComponent('My location')}`, sms: `sms:?body=${encodeURIComponent(message)}` }; try { if (medium === 'sms') window.location.href = urls.sms; else window.open(urls[medium], '_blank') } catch { try { await navigator.clipboard.writeText(mapsUrl); showToastMsg(t.locationCopied || 'Location copied to clipboard') } catch {} } finally { setShowShareModal(false) } }

  const currentTiles = MAP_TILES[mapTheme]

  const emergencyPressStart = () => {
    const now = Date.now()
    if (now - emergencyBtnPressRef.current.last < 400) {
      emergencyBtnPressRef.current.count += 1
      if (emergencyBtnPressRef.current.count >= 2) startPanicMode()
    } else {
      emergencyBtnPressRef.current.count = 1
    }
    emergencyBtnPressRef.current.last = now
    // long press
    emergencyBtnPressRef.current.longPress = setTimeout(() => startPanicMode(), 800)
  }
  const emergencyPressEnd = () => { if (emergencyBtnPressRef.current.longPress) { clearTimeout(emergencyBtnPressRef.current.longPress); emergencyBtnPressRef.current.longPress = null } }

  return (
    <div className="app">
      <div className={`offline-indicator ${isOffline ? 'show' : ''}`} role="status" aria-live="polite">{t.offline || 'Offline Mode'}</div>

      <div className="header">
        <div className="header-left">
          <h1 className="title" aria-label={t.title || 'Micro Emergency Assistant'}>{t.title || 'Micro Emergency Assistant'}</h1>
          <div className="smart-mode-toggle">
            <span>{t.smartEmergencyMode || 'Smart Emergency Mode'}</span>
            <div className={`toggle-switch ${smartEmergencyMode ? 'active' : ''}`} onClick={() => setSmartEmergencyMode(!smartEmergencyMode)} role="switch" aria-checked={smartEmergencyMode} aria-label="Smart Emergency Mode" />
          </div>
          <div className="filters">
            {CATEGORIES.map(c => (
              <button key={c.key} className={`filter-btn ${selected === c.key ? 'active' : ''}`} onClick={() => setSelected(c.key)} aria-label={`Filter ${t[c.label] || c.label}`}>
                <span>{c.emoji}</span><span>{t[c.label] || c.label}</span>
              </button>
            ))}
          </div>
        </div>
        <button className="language-toggle" onClick={() => setLanguage(lang => lang === 'en' ? 'am' : 'en')} aria-label="Toggle language">{language === 'en' ? 'አማርኛ' : 'English'}</button>
        <button className="language-toggle" style={{ marginLeft: 8 }} onClick={() => setShowShareModal('profile')} aria-label="Profile">ID</button>
      </div>

      <div className="main">
        <div className="map-wrap">
          <MapContainer center={[mapCenter.lat, mapCenter.lon]} zoom={13} style={{ height: '100%', width: '100%' }} aria-label="Map">
            <TileLayer attribution={currentTiles.attrib} url={currentTiles.url} />
            <RecenterOnUser center={user} />
            {user && (<Marker position={[user.lat, user.lon]} icon={userIcon}><Popup>{t.yourLocation || 'Your Location'}</Popup></Marker>)}
            {visibleKeys.map(key => { const services = nearestByCategory[key]; if (!services) return null; return services.map((item, index) => (
              <Marker key={`${key}-${index}`} position={[item.lat, item.lon]} icon={serviceIconFor(item.type)}>
                <Popup>
                  <div>
                    <strong>{item.name}</strong>
                    <div className={`category-badge ${item.type}`}><span>{CATEGORIES.find(c => c.key === item.type)?.icon}</span><span>{t[item.type] || item.type.toUpperCase()}</span></div>
                    <div>{item.distanceKm.toFixed(1)} {t.kmAway || 'km away'}</div>
                    <div>~{calculateETA(item.distanceKm, 'driving')} min {t.driving || 'drive'}</div>
                    <div><a href={`tel:${item.phone}`}>{t.call || 'Call'} {item.phone}</a></div>
                  </div>
                </Popup>
              </Marker>
            )) })}
            {/* Responder moving markers */}
            {isPanic && responderPositions.map(p => (
              <Marker key={`resp-${p.id}`} position={[p.lat, p.lon]} icon={toDivIcon('police', '🚨')}>
                <Popup>Responder #{p.id}</Popup>
              </Marker>
            ))}
          </MapContainer>

          {/* Map overlay controls: theme selector */}
          <div className="map-controls" aria-label={t.mapTheme || 'Map Theme'}>
            <select value={mapTheme} onChange={(e) => setMapTheme(e.target.value)} aria-label={t.mapTheme || 'Map Theme'}>
              <option value="light">{t.themeLight || 'Light'}</option>
              <option value="carto">{t.themeCarto || 'Carto Light'}</option>
              <option value="dark">{t.themeDark || 'Dark'}</option>
            </select>
          </div>

          <button className="emergency-btn" onMouseDown={emergencyPressStart} onMouseUp={emergencyPressEnd} onTouchStart={emergencyPressStart} onTouchEnd={emergencyPressEnd} onClick={() => {/* normal emergency flow */}} aria-label={t.emergency || 'Emergency'}>{t.emergency || 'EMERGENCY'}</button>

          {/* Tracking banner */}
          {isPanic && (
            <div className="tracking-banner" onClick={stopPanicMode}>Tracking active • tap to stop</div>
          )}
        </div>

        <div className="list" aria-label="Services list">
          <div className="cards">
            {visibleKeys.length === 0 && (<div className="card"><p className="meta">{t.noServices || 'No services available.'}</p></div>)}
            {visibleKeys.map(key => { const services = nearestByCategory[key]; if (!services || services.length === 0) return null; const category = CATEGORIES.find(c => c.key === key); return (
              <div className="service-group" key={`group-${key}`}>
                <div className="service-group-header">
                  <span className={`category-badge ${key}`}><span>{category?.icon}</span><span>{t[key] || key.toUpperCase()}</span></span>
                  <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--muted)' }}>{t.top3Services || 'Top 3 Services'}</span>
                </div>
                {services.map((item, index) => { const walkingETA = calculateETA(item.distanceKm, 'walking'); const drivingETA = calculateETA(item.distanceKm, 'driving'); return (
                  <div className="service-item" key={`item-${key}-${index}`}>
                    <div>
                      <h4>{item.name}</h4>
                      <p className="meta">{item.distanceKm.toFixed(1)} {t.kmAway || 'km away'} • {item.phone}</p>
                      <p className="eta">{t.eta || 'ETA'}: ~{walkingETA} min {t.walking || 'walking'} • ~{drivingETA} min {t.driving || 'drive'}</p>
                    </div>
                    <a className="call-btn" href={`tel:${item.phone}`} aria-label={`Call ${item.name}`}>{t.call || 'Call'}</a>
                  </div>
                ) })}
              </div>
            ) })}
          </div>
        </div>
      </div>

      <button className="share-location-btn" onClick={() => setShowShareModal(true)} aria-label={t.shareLocation || 'Share My Location'}>📍 {t.shareLocation || 'Share My Location'}</button>

      {/* Responders side panel */}
      {isPanic && (
        <div className={`responders-panel show`}>
          <div className="responders-header">
            <span>Nearby Responders</span>
            <button className="language-toggle" onClick={stopPanicMode}>Stop</button>
          </div>
          <div className="responders-list">
            {responders.map(r => {
              const pos = responderPositions.find(p => p.id === r.id) || { lat: r.lat, lon: r.lon }
              const d = user ? haversineKm(user, { lat: pos.lat, lon: pos.lon }) : 0
              const eta = calculateETA(d, 'driving')
              return (
                <div key={r.id} className="responder-card">
                  <div>
                    <div className="name">{r.name}</div>
                    <div className="meta"><span className="skill-badge">{r.skill}</span> • {d.toFixed(1)} km • ~{eta} min</div>
                  </div>
                  <div>🚨</div>
                </div>
              )
            })}
          </div>
          {responderAccepted && (
            <div style={{ padding: 12, color: '#32CD32', fontWeight: 800, textAlign: 'center' }}>Responder accepted your call</div>
          )}
        </div>
      )}

      {showEmergencyModal && (
        <div className="modal-overlay" onClick={() => setShowEmergencyModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>{t.selectEmergency || 'Select Emergency Service'}</h2>
            <div className="emergency-options">
              {['police', 'ambulance', 'fire', 'hospital', 'pharmacy'].map(category => { const nearest = nearestByCategory[category]?.[0]; const categoryInfo = CATEGORIES.find(c => c.key === category); return (
                <div key={category} className="emergency-option" onClick={() => handleEmergencyCall(category)}>
                  <div className={`emergency-option-icon ${category}`}>{categoryInfo?.icon}</div>
                  <div className="emergency-option-text">
                    {t[category] || category}
                    {nearest && (<div style={{ fontSize: '14px', color: 'var(--muted)', marginTop: '4px' }}>{nearest.name} • {nearest.distanceKm.toFixed(1)} {t.kmAway || 'km away'}</div>)}
                  </div>
                </div>
              ) })}
            </div>
          </div>
        </div>
      )}

      {showShareModal && (
        <div className="modal-overlay share-modal" onClick={() => setShowShareModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>{t.shareVia || 'Share via'}</h2>
            <div className="share-options">
              <div className="share-option" onClick={() => shareVia('whatsapp')}><div className="icon whatsapp">🟢</div><div>{t.whatsapp || 'WhatsApp'}</div></div>
              <div className="share-option" onClick={() => shareVia('telegram')}><div className="icon telegram">📨</div><div>{t.telegram || 'Telegram'}</div></div>
              <div className="share-option" onClick={() => shareVia('sms')}><div className="icon sms">✉️</div><div>{t.sms || 'SMS'}</div></div>
            </div>
          </div>
        </div>
      )}

      {showShareModal === 'profile' && (
        <Profile />
      )}

      <div className={`toast ${showToast ? 'show' : ''}`}>{toastMessage}</div>
      {error && <div style={{ padding: 12, color: '#b42318' }}>{error}</div>}
    </div>
  )
}
