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

function calculateETA(distanceKm, mode = 'driving') {
  const speed = mode === 'walking' ? 5 : 40 // km/h
  const timeMinutes = Math.round((distanceKm / speed) * 60)
  return timeMinutes
}

function findNearest(user, type, data, count = 1) {
  const filtered = data.filter(d => d.type === type)
  if (filtered.length === 0) return count === 1 ? null : []
  
  const withDistance = filtered.map(item => ({
    ...item,
    distanceKm: haversineKm(user, { lat: item.lat, lon: item.lon })
  }))
  
  withDistance.sort((a, b) => a.distanceKm - b.distanceKm)
  
  return count === 1 ? withDistance[0] : withDistance.slice(0, count)
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
  const [smartEmergencyMode, setSmartEmergencyMode] = useState(false)
  const [isOffline, setIsOffline] = useState(false)
  const [showToast, setShowToast] = useState(false)
  const [toastMessage, setToastMessage] = useState('')

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

  // Offline detection
  useEffect(() => {
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)
    
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    setIsOffline(!navigator.onLine)
    
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // PWA installation prompt
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(registration => console.log('SW registered'))
        .catch(err => console.log('SW registration failed'))
    }
  }, [])

  const nearestByCategory = useMemo(() => {
    if (!user || data.length === 0) return {}
    const categories = ['police', 'ambulance', 'fire', 'hospital', 'pharmacy']
    const out = {}
    for (const key of categories) {
      const res = findNearest(user, key, data, 3) // Get top 3
      if (res && res.length > 0) out[key] = res
    }
    return out
  }, [user, data])

  const mapCenter = user ?? ADDIS_FALLBACK

  const visibleKeys = selected === 'all'
    ? Object.keys(nearestByCategory)
    : (nearestByCategory[selected] ? [selected] : [])

  const t = translations[language] || translations.en || {}

  const handleEmergencyCall = (category) => {
    const nearest = nearestByCategory[category]?.[0]
    if (nearest) {
      window.location.href = `tel:${nearest.phone}`
    }
    setShowEmergencyModal(false)
  }

  const handleSmartEmergency = () => {
    if (!user || !smartEmergencyMode) {
      setShowEmergencyModal(true)
      return
    }

    // Smart logic: check proximity to different services
    const hospitalNearest = nearestByCategory.hospital?.[0]
    const fireNearest = nearestByCategory.fire?.[0]
    const policeNearest = nearestByCategory.police?.[0]

    let targetService = null

    // If within 1km of hospital, call ambulance
    if (hospitalNearest && hospitalNearest.distanceKm <= 1) {
      targetService = nearestByCategory.ambulance?.[0]
    }
    // If closer to fire station than hospital, call fire
    else if (fireNearest && hospitalNearest && fireNearest.distanceKm < hospitalNearest.distanceKm) {
      targetService = fireNearest
    }
    // Default to police
    else {
      targetService = policeNearest
    }

    if (targetService) {
      window.location.href = `tel:${targetService.phone}`
    } else {
      setShowEmergencyModal(true)
    }
  }

  const shareLocation = async () => {
    if (!user) return

    const mapsUrl = `https://maps.google.com/?q=${user.lat},${user.lon}`
    const message = `My location: ${mapsUrl}`

    // Try WhatsApp first
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`
    
    // Try Telegram
    const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(mapsUrl)}&text=${encodeURIComponent('My location')}`

    try {
      // Try to open WhatsApp
      window.open(whatsappUrl, '_blank')
    } catch (e) {
      try {
        // Try Telegram
        window.open(telegramUrl, '_blank')
      } catch (e2) {
        // Fallback to clipboard
        try {
          await navigator.clipboard.writeText(mapsUrl)
          setToastMessage(t.locationCopied || 'Location copied to clipboard')
          setShowToast(true)
          setTimeout(() => setShowToast(false), 3000)
        } catch (e3) {
          console.error('Failed to copy to clipboard')
        }
      }
    }
  }

  return (
    <div className="app">
      <div className={`offline-indicator ${isOffline ? 'show' : ''}`}>
        {t.offline || 'Offline Mode'}
      </div>

      <div className="header">
        <div className="header-left">
          <h1 className="title">{t.title || 'Micro Emergency Assistant'}</h1>
          
          <div className="smart-mode-toggle">
            <span>{t.smartEmergencyMode || 'Smart Emergency Mode'}</span>
            <div 
              className={`toggle-switch ${smartEmergencyMode ? 'active' : ''}`}
              onClick={() => setSmartEmergencyMode(!smartEmergencyMode)}
            />
          </div>

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
              const services = nearestByCategory[key]
              if (!services) return null
              
              return services.map((item, index) => (
                <Marker 
                  key={`${key}-${index}`} 
                  position={[item.lat, item.lon]} 
                  icon={serviceIconFor(item.type)}
                >
                  <Popup>
                    <div>
                      <strong>{item.name}</strong>
                      <div className={`category-badge ${item.type}`}>
                        <span>{CATEGORIES.find(c => c.key === item.type)?.icon}</span>
                        <span>{t[item.type] || item.type.toUpperCase()}</span>
                      </div>
                      <div>{item.distanceKm.toFixed(1)} {t.kmAway || 'km away'}</div>
                      <div>~{calculateETA(item.distanceKm, 'driving')} min {t.driving || 'drive'}</div>
                      <div><a href={`tel:${item.phone}`}>{t.call || 'Call'} {item.phone}</a></div>
                    </div>
                  </Popup>
                </Marker>
              ))
            })}
          </MapContainer>
          
          <button 
            className="emergency-btn"
            onClick={handleSmartEmergency}
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
              const services = nearestByCategory[key]
              if (!services || services.length === 0) return null
              
              const category = CATEGORIES.find(c => c.key === key)
              
              return (
                <div className="service-group" key={`group-${key}`}>
                  <div className="service-group-header">
                    <span className={`category-badge ${key}`}>
                      <span>{category?.icon}</span>
                      <span>{t[key] || key.toUpperCase()}</span>
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--muted)' }}>
                      {t.top3Services || 'Top 3 Services'}
                    </span>
                  </div>
                  
                  {services.map((item, index) => {
                    const walkingETA = calculateETA(item.distanceKm, 'walking')
                    const drivingETA = calculateETA(item.distanceKm, 'driving')
                    
                    return (
                      <div className="service-item" key={`item-${key}-${index}`}>
                        <div>
                          <h4>{item.name}</h4>
                          <p className="meta">{item.distanceKm.toFixed(1)} {t.kmAway || 'km away'} • {item.phone}</p>
                          <p className="eta">
                            {t.eta || 'ETA'}: ~{walkingETA} min {t.walking || 'walking'} • ~{drivingETA} min {t.driving || 'drive'}
                          </p>
                        </div>
                        <a className="call-btn" href={`tel:${item.phone}`}>{t.call || 'Call'}</a>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <button 
        className="share-location-btn"
        onClick={shareLocation}
      >
        📍 {t.shareLocation || 'Share My Location'}
      </button>

      {showEmergencyModal && (
        <div className="modal-overlay" onClick={() => setShowEmergencyModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>{t.selectEmergency || 'Select Emergency Service'}</h2>
            <div className="emergency-options">
              {['police', 'ambulance', 'fire', 'hospital', 'pharmacy'].map(category => {
                const nearest = nearestByCategory[category]?.[0]
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
                          {nearest.name} • {nearest.distanceKm.toFixed(1)} {t.kmAway || 'km away'}
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

      <div className={`toast ${showToast ? 'show' : ''}`}>
        {toastMessage}
      </div>

      {error && <div style={{ padding: 12, color: '#b42318' }}>{error}</div>}
    </div>
  )
}
