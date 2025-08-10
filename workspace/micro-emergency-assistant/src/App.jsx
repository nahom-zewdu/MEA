import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'

const CATEGORIES = [
  { key: 'all', label: 'all', emoji: '⭐', icon: '⭐' },
  { key: 'police', label: 'police', emoji: '🛡️', icon: '🛡️' },
  { key: 'ambulance', label: 'ambulance', emoji: '🚑', icon: '➕' },
  { key: 'fire', label: 'fire', emoji: '🚒', icon: '🔥' },
  { key: 'hospital', label: 'hospital', emoji: '🏥', icon: '🏥' },
  { key: 'pharmacy', label: 'pharmacy', emoji: '💊', icon: '💊' },
]

const ADDIS_FALLBACK = { lat: 9.010793, lon: 38.761253 }

function toDivIcon(htmlClass, content) {
  return L.divIcon({
    className: '',
    html: `<div class="marker ${htmlClass}">${content}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -28],
  })
}

const userIcon = toDivIcon('user', '•')
function serviceIconFor(type) {
  const match = CATEGORIES.find(c => c.key === type)
  return toDivIcon(type, match?.icon ?? '📍')
}

function haversineKm(a, b) {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLon = ((b.lon - a.lon) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180

  const sinDLat = Math.sin(dLat / 2)
  const sinDLon = Math.sin(dLon / 2)
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
  return R * c
}

function findNearest(user, type, data) {
  const filtered = data.filter(d => d.type === type)
  if (filtered.length === 0) return null
  let best = null
  let bestDist = Number.POSITIVE_INFINITY
  for (const item of filtered) {
    const dist = haversineKm(user, { lat: item.lat, lon: item.lon })
    if (dist < bestDist) {
      best = item
      bestDist = dist
    }
  }
  if (!best) return null
  return { ...best, distanceKm: bestDist }
}

function RecenterOnUser({ center }) {
  const map = useMap()
  useEffect(() => {
    if (center) {
      map.setView([center.lat, center.lon], map.getZoom() || 13)
    }
  }, [center, map])
  return null
}

export default function App() {
  const [selected, setSelected] = useState('all')
  const [user, setUser] = useState(null)
  const [data, setData] = useState([])
  const [error, setError] = useState('')
  const [language, setLanguage] = useState('en')
  const [translations, setTranslations] = useState({})
  const [showEmergencyModal, setShowEmergencyModal] = useState(false)

  // Load translations
  useEffect(() => {
    fetch('/translations.json')
      .then(r => r.json())
      .then(setTranslations)
      .catch(() => console.error('Failed to load translations'))
  }, [])

  // Load data once
  useEffect(() => {
    fetch('/emergency_data.json')
      .then(r => r.json())
      .then(setData)
      .catch(() => setError('Failed to load emergency data'))
  }, [])

  // Geolocation with fallback
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setUser(ADDIS_FALLBACK)
      return
    }
    const onSuccess = (pos) => {
      const { latitude, longitude } = pos.coords
      setUser({ lat: latitude, lon: longitude })
    }
    const onError = () => {
      setUser(ADDIS_FALLBACK)
    }
    navigator.geolocation.getCurrentPosition(onSuccess, onError, {
      enableHighAccuracy: true,
      maximumAge: 10_000,
      timeout: 10_000,
    })
  }, [])

  const nearestByCategory = useMemo(() => {
    if (!user || data.length === 0) return {}
    const categories = ['police', 'ambulance', 'fire', 'hospital', 'pharmacy']
    const out = {}
    for (const key of categories) {
      const res = findNearest(user, key, data)
      if (res) out[key] = res
    }
    return out
  }, [user, data])

  const mapCenter = user ?? ADDIS_FALLBACK

  const visibleKeys = selected === 'all'
    ? Object.keys(nearestByCategory)
    : (nearestByCategory[selected] ? [selected] : [])

  const t = translations[language] || translations.en || {}

  const handleEmergencyCall = (category) => {
    const nearest = nearestByCategory[category]
    if (nearest) {
      window.location.href = `tel:${nearest.phone}`
    }
    setShowEmergencyModal(false)
  }

  return (
    <div className="app">
      <div className="header">
        <div className="header-left">
          <h1 className="title">{t.title || 'Micro Emergency Assistant'}</h1>
          <div className="filters">
            {CATEGORIES.map(c => (
              <button
                key={c.key}
                className={`filter-btn ${selected === c.key ? 'active' : ''}`}
                onClick={() => setSelected(c.key)}
              >
                <span>{c.emoji}</span>
                <span>{t[c.label] || c.label}</span>
              </button>
            ))}
          </div>
        </div>
        <button 
          className="language-toggle"
          onClick={() => setLanguage(lang => lang === 'en' ? 'am' : 'en')}
        >
          {language === 'en' ? 'አማርኛ' : 'English'}
        </button>
      </div>

      <div className="main">
        <div className="map-wrap">
          <MapContainer center={[mapCenter.lat, mapCenter.lon]} zoom={13} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <RecenterOnUser center={user} />

            {user && (
              <Marker position={[user.lat, user.lon]} icon={userIcon}>
                <Popup>{t.yourLocation || 'Your Location'}</Popup>
              </Marker>
            )}

            {visibleKeys.map(key => {
              const item = nearestByCategory[key]
              if (!item) return null
              return (
                <Marker key={key} position={[item.lat, item.lon]} icon={serviceIconFor(item.type)}>
                  <Popup>
                    <div>
                      <strong>{item.name}</strong>
                      <div className={`category-badge ${item.type}`}>
                        <span>{CATEGORIES.find(c => c.key === item.type)?.icon}</span>
                        <span>{t[item.type] || item.type.toUpperCase()}</span>
                      </div>
                      <div>{(item.distanceKm ?? haversineKm(mapCenter, { lat: item.lat, lon: item.lon })).toFixed(1)} {t.kmAway || 'km away'}</div>
                      <div><a href={`tel:${item.phone}`}>{t.call || 'Call'} {item.phone}</a></div>
                    </div>
                  </Popup>
                </Marker>
              )
            })}
          </MapContainer>
          
          <button 
            className="emergency-btn"
            onClick={() => setShowEmergencyModal(true)}
          >
            {t.emergency || 'EMERGENCY'}
          </button>
        </div>

        <div className="list">
          <div className="cards">
            {visibleKeys.length === 0 && (
              <div className="card"><p className="meta">{t.noServices || 'No services available.'}</p></div>
            )}
            {visibleKeys.map(key => {
              const item = nearestByCategory[key]
              if (!item) return null
              const distance = (item.distanceKm ?? haversineKm(mapCenter, { lat: item.lat, lon: item.lon })).toFixed(1)
              const category = CATEGORIES.find(c => c.key === item.type)
              return (
                <div className="card" key={`card-${key}`}>
                  <div>
                    <h3>
                      <span className={`category-badge ${item.type}`}>
                        <span>{category?.icon}</span>
                        <span>{t[item.type] || item.type.toUpperCase()}</span>
                      </span>
                      {item.name}
                    </h3>
                    <p className="meta">{distance} {t.kmAway || 'km away'} • {item.phone}</p>
                  </div>
                  <a className="call-btn" href={`tel:${item.phone}`}>{t.call || 'Call'}</a>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {showEmergencyModal && (
        <div className="modal-overlay" onClick={() => setShowEmergencyModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>{t.selectEmergency || 'Select Emergency Service'}</h2>
            <div className="emergency-options">
              {['police', 'ambulance', 'fire', 'hospital', 'pharmacy'].map(category => {
                const nearest = nearestByCategory[category]
                const categoryInfo = CATEGORIES.find(c => c.key === category)
                return (
                  <div 
                    key={category}
                    className="emergency-option"
                    onClick={() => handleEmergencyCall(category)}
                  >
                    <div className={`emergency-option-icon ${category}`}>
                      {categoryInfo?.icon}
                    </div>
                    <div className="emergency-option-text">
                      {t[category] || category}
                      {nearest && (
                        <div style={{ fontSize: '14px', color: 'var(--muted)', marginTop: '4px' }}>
                          {nearest.name} • {(nearest.distanceKm).toFixed(1)} {t.kmAway || 'km away'}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {error && <div style={{ padding: 12, color: '#b42318' }}>{error}</div>}
    </div>
  )
}
