import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import jsQR from 'jsqr'

export default function Profile() {
  const [profile, setProfile] = useState(() => {
    const raw = localStorage.getItem('mea_profile')
    return raw ? JSON.parse(raw) : { name: '', blood: '', allergies: '', chronic: '', contact: '' }
  })
  const [qrDataUrl, setQrDataUrl] = useState('')
  const fileInputRef = useRef(null)

  const saveProfile = async () => {
    localStorage.setItem('mea_profile', JSON.stringify(profile))
    const json = JSON.stringify(profile)
    const url = await QRCode.toDataURL(json, { width: 256, margin: 1, color: { dark: '#f5f5f5', light: '#0b1220' } })
    setQrDataUrl(url)
  }

  const onScanUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const bitmap = await createImageBitmap(file)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(bitmap, 0, 0)
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const code = jsQR(imgData.data, imgData.width, imgData.height)
    if (code?.data) {
      try {
        const obj = JSON.parse(code.data)
        alert(`Name: ${obj.name}\nBlood: ${obj.blood}\nAllergies: ${obj.allergies}\nChronic: ${obj.chronic}\nEmergency Contact: ${obj.contact}`)
      } catch {
        alert('Invalid QR data')
      }
    } else {
      alert('No QR detected')
    }
    e.target.value = ''
  }

  return (
    <div className="modal-overlay profile-modal" onClick={(e) => e.stopPropagation()}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Emergency ID & Health Passport</h2>
        <div className="profile-form">
          <label>Name<input value={profile.name} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} /></label>
          <label>Blood Type<input value={profile.blood} onChange={e => setProfile(p => ({ ...p, blood: e.target.value }))} /></label>
          <label>Allergies<textarea value={profile.allergies} onChange={e => setProfile(p => ({ ...p, allergies: e.target.value }))} /></label>
          <label>Chronic Conditions<textarea value={profile.chronic} onChange={e => setProfile(p => ({ ...p, chronic: e.target.value }))} /></label>
          <label>Emergency Contact<input value={profile.contact} onChange={e => setProfile(p => ({ ...p, contact: e.target.value }))} /></label>
          <div className="profile-actions">
            <button className="language-toggle" onClick={saveProfile}>Save & Generate QR</button>
            <button className="language-toggle" onClick={() => fileInputRef.current?.click()}>Responder Mode: Scan</button>
            <input type="file" ref={fileInputRef} accept="image/*" style={{ display: 'none' }} onChange={onScanUpload} />
          </div>
        </div>
        {qrDataUrl && (
          <div className="qr-box" style={{ marginTop: 12 }}>
            <img src={qrDataUrl} alt="Emergency QR" />
          </div>
        )}
      </div>
    </div>
  )
}
