import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import {
  Bell,
  CalendarCheck,
  Eye,
  EyeOff,
  HelpCircle,
  LayoutDashboard,
  Lock,
  LogOut,
  Mail,
  MapPin,
  PawPrint,
  Phone,
  Save,
  Settings,
  ShieldPlus,
  Stethoscope,
  Syringe,
  Upload,
  UserRound,
  X
} from 'lucide-react'

const API_URL = 'http://127.0.0.1:8000'

const sanitizeAddress = (address) => {
  const rawAddress = String(address || '')
  const cleanedAddress = rawAddress.trim()
  if (!cleanedAddress) return ''
  if (cleanedAddress.includes('@')) return ''
  return cleanedAddress
}

const getStoredJson = (key, fallback = {}) => {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback))
  } catch {
    return fallback
  }
}

const getCurrentUserId = () => {
  const storedUser = getStoredJson('petcare_user')
  const rawId = localStorage.getItem('petcare_user_id') || storedUser.id
  const numericId = Number(rawId)
  return Number.isFinite(numericId) && numericId > 0 ? numericId : null
}

function UserSettings() {
  const navigate = useNavigate()
  const fileInputRef = useRef(null)
  const avatarDragRef = useRef(null)
  const dragStateRef = useRef(null)
  const userId = localStorage.getItem('petcare_user_id')

  const [user, setUser] = useState(null)
  const [form, setForm] = useState({ nume: '', email: '', telefon: '', adresa: '', fotografie_url: '' })
  const [passwordForm, setPasswordForm] = useState({ parola_veche: '', parola_noua: '', confirmare: '' })
  const [message, setMessage] = useState('')
  const [saveToast, setSaveToast] = useState('')
  const [passwordMessage, setPasswordMessage] = useState('')
  const [showHelpModal, setShowHelpModal] = useState(false)
  const [showVetModal, setShowVetModal] = useState(false)
  const [vetInfo, setVetInfo] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('petcare_vet_info') || '{}')
    } catch {
      return {}
    }
  })
  const [vetForm, setVetForm] = useState({
    nume: '',
    telefon: '',
    clinica: '',
    observatii: ''
  })
  const [showNotifications, setShowNotifications] = useState(false)
  const [visiblePasswords, setVisiblePasswords] = useState({ current: false, new: false, confirm: false })
  const [notifications, setNotifications] = useState({ email: true, vaccines: true, deworming: true, treatments: true })
  const [settingsSearch, setSettingsSearch] = useState('')
  const [pendingAvatar, setPendingAvatar] = useState('')
  const [showAvatarCrop, setShowAvatarCrop] = useState(false)
  const [avatarCrop, setAvatarCrop] = useState({ x: 50, y: 50, zoom: 1 })
  const [initialForm, setInitialForm] = useState({ nume: '', email: '', telefon: '', adresa: '', fotografie_url: '' })
  const [focusedField, setFocusedField] = useState('')

  useEffect(() => {
    const loadUser = async () => {
      const currentUserId = getCurrentUserId()
      if (!currentUserId) {
        setMessage('Nu am putut identifica utilizatorul autentificat.')
        return
      }

      let remoteUser = null
      let loadedFromDatabase = false

      try {
        const response = await axios.get(`${API_URL}/utilizator/${currentUserId}`)
        remoteUser = response.data || {}
        loadedFromDatabase = true
      } catch (error) {
        console.error('Nu am putut incarca utilizatorul din baza de date.', error)
        remoteUser = getStoredJson('petcare_user')
        setMessage('Nu am putut incarca datele din baza de date. Verifica backend-ul.')
      }

      let savedCrop = { x: 50, y: 50, zoom: 1 }
      try {
        savedCrop = JSON.parse(localStorage.getItem(`petcare_user_avatar_crop_${currentUserId}`) || '{"x":50,"y":50,"zoom":1}')
      } catch {
        savedCrop = { x: 50, y: 50, zoom: 1 }
      }

      const localAvatar = localStorage.getItem(`petcare_user_avatar_${currentUserId}`) || ''
      const nextForm = {
        nume: String(remoteUser.nume || '').trim(),
        email: String(remoteUser.email || '').trim(),
        telefon: String(remoteUser.telefon || '').trim(),
        adresa: String(remoteUser.adresa || '').trim(),
        fotografie_url: localAvatar || remoteUser.fotografie_url || ''
      }

      setUser({ ...remoteUser, ...nextForm })
      setForm(nextForm)
      setInitialForm(nextForm)
      setAvatarCrop(savedCrop)

      if (loadedFromDatabase) {
        localStorage.setItem('petcare_user_id', String(currentUserId))
        localStorage.setItem('petcare_user', JSON.stringify({ ...remoteUser, ...nextForm }))
        localStorage.setItem(`petcare_user_profile_${currentUserId}`, JSON.stringify(nextForm))
        localStorage.setItem('petcare-owner-profile', JSON.stringify({
          name: nextForm.nume,
          phone: nextForm.telefon,
          address: nextForm.adresa
        }))
        Object.keys(localStorage)
          .filter((key) => key.startsWith('petcare-owner-info-'))
          .forEach((key) => localStorage.setItem(key, JSON.stringify({
            name: nextForm.nume,
            phone: nextForm.telefon,
            address: nextForm.adresa
          })))
      }

      if (nextForm.fotografie_url) {
        localStorage.setItem(`petcare_user_avatar_${currentUserId}`, nextForm.fotografie_url)
      }
    }

    loadUser()
  }, [userId])

  useEffect(() => {
    setVetForm({
      nume: vetInfo.nume || '',
      telefon: vetInfo.telefon || '',
      clinica: vetInfo.clinica || '',
      observatii: vetInfo.observatii || ''
    })
  }, [vetInfo])

  const updateForm = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
    if (message && message !== 'Numele este obligatoriu.') setMessage('')
  }

  const updatePasswordForm = (field, value) => setPasswordForm((current) => ({ ...current, [field]: value }))
  const togglePasswordVisibility = (field) => setVisiblePasswords((current) => ({ ...current, [field]: !current[field] }))
  const updateNotifications = (field) => setNotifications((current) => ({ ...current, [field]: !current[field] }))


  const getPlaceholder = (field, text) => (focusedField === field ? '' : text)

  const handleFieldBlur = (field) => {
    setFocusedField('')
    if (field === 'email') return
    setForm((current) => {
      const value = String(current[field] || '').trim()
      return { ...current, [field]: field === 'adresa' ? sanitizeAddress(value) : value }
    })
  }

  const handleAvatarDragStart = (event) => {
    const pointer = event.touches?.[0] || event
    dragStateRef.current = {
      startX: pointer.clientX,
      startY: pointer.clientY,
      startCropX: avatarCrop.x,
      startCropY: avatarCrop.y
    }
  }

  const handleAvatarDragMove = (event) => {
    if (!dragStateRef.current) return
    const pointer = event.touches?.[0] || event
    const rect = avatarDragRef.current?.getBoundingClientRect()
    if (!rect) return
    const dx = ((pointer.clientX - dragStateRef.current.startX) / rect.width) * 100
    const dy = ((pointer.clientY - dragStateRef.current.startY) / rect.height) * 100
    setAvatarCrop((current) => ({
      ...current,
      x: Math.max(0, Math.min(100, dragStateRef.current.startCropX - dx)),
      y: Math.max(0, Math.min(100, dragStateRef.current.startCropY - dy))
    }))
  }

  const handleAvatarDragEnd = () => {
    dragStateRef.current = null
  }

  const adjustAvatarZoom = (direction) => {
    setAvatarCrop((current) => ({
      ...current,
      zoom: Math.max(1, Math.min(2.2, Number((current.zoom + direction * 0.1).toFixed(2))))
    }))
  }

  const avatarImageStyle = form.fotografie_url
    ? {
        objectPosition: `${avatarCrop.x}% ${avatarCrop.y}%`,
        transform: `scale(${avatarCrop.zoom})`
      }
    : undefined

  const handleProfileImageChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setMessage('Alege o imagine validă pentru profil.')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setPendingAvatar(String(reader.result || ''))
      setAvatarCrop({ x: 50, y: 50, zoom: 1 })
      setShowAvatarCrop(true)
    }
    reader.readAsDataURL(file)
  }

  const saveAvatarCrop = (event) => {
    event?.preventDefault?.()
    if (!pendingAvatar) {
      setShowAvatarCrop(false)
      return
    }
    const nextForm = { ...form, fotografie_url: pendingAvatar }
    setForm(nextForm)
    localStorage.setItem(`petcare_user_avatar_${userId}`, pendingAvatar)
    localStorage.setItem(`petcare_user_avatar_crop_${userId}`, JSON.stringify(avatarCrop))
    localStorage.setItem(`petcare_user_profile_${userId}`, JSON.stringify({ ...nextForm, adresa: sanitizeAddress(nextForm.adresa) }))
    localStorage.setItem('petcare_user', JSON.stringify({ ...(user || {}), ...nextForm, adresa: sanitizeAddress(nextForm.adresa) }))
    setInitialForm({ ...nextForm, adresa: sanitizeAddress(nextForm.adresa) })
    setPendingAvatar('')
    setShowAvatarCrop(false)
    setMessage('')
    setSaveToast('Poza de profil a fost salvată.')
    window.setTimeout(() => setSaveToast(''), 2600)
  }

  const saveProfile = async (event) => {
    event?.preventDefault?.()

    const currentUserId = getCurrentUserId()
    const cleanName = String(form.nume || '').trim()
    const cleanPhone = String(form.telefon || '').trim()
    const cleanAddress = sanitizeAddress(form.adresa)

    if (!cleanName) {
      setMessage('Numele este obligatoriu.')
      return
    }

    if (!currentUserId) {
      setMessage('Nu am putut identifica utilizatorul autentificat.')
      setSaveToast('Nu am putut salva profilul. Utilizatorul nu este identificat.')
      window.setTimeout(() => setSaveToast(''), 3000)
      return
    }

    setMessage('')

    try {
      const payload = {
        nume: cleanName,
        telefon: cleanPhone || null,
        adresa: cleanAddress || null,
        fotografie_url:
          form.fotografie_url && !String(form.fotografie_url).startsWith('data:')
            ? form.fotografie_url
            : user?.fotografie_url || null
      }

      const response = await axios.put(`${API_URL}/utilizator/${currentUserId}`, payload)
      const dbUser = response.data || {}

      const savedProfile = {
        nume: String(dbUser.nume || cleanName).trim(),
        email: String(dbUser.email || form.email || user?.email || '').trim(),
        telefon: String(dbUser.telefon || '').trim(),
        adresa: String(dbUser.adresa || '').trim(),
        fotografie_url: form.fotografie_url || dbUser.fotografie_url || ''
      }

      setForm(savedProfile)
      setInitialForm(savedProfile)
      setUser((current) => ({ ...(current || {}), ...dbUser, ...savedProfile }))

      localStorage.setItem('petcare_user_id', String(currentUserId))
      localStorage.setItem('petcare_user', JSON.stringify({ ...(user || {}), ...dbUser, ...savedProfile }))
      localStorage.setItem('petcare_user_nume', savedProfile.nume)
      localStorage.setItem(`petcare_user_profile_${currentUserId}`, JSON.stringify(savedProfile))
      if (savedProfile.fotografie_url) {
        localStorage.setItem(`petcare_user_avatar_${currentUserId}`, savedProfile.fotografie_url)
      }

      const syncedOwnerInfo = {
        name: savedProfile.nume,
        phone: savedProfile.telefon,
        address: savedProfile.adresa
      }
      localStorage.setItem('petcare-owner-profile', JSON.stringify(syncedOwnerInfo))
      Object.keys(localStorage)
        .filter((key) => key.startsWith('petcare-owner-info-'))
        .forEach((key) => localStorage.setItem(key, JSON.stringify(syncedOwnerInfo)))
      window.dispatchEvent(new CustomEvent('petcare-owner-profile-updated', { detail: syncedOwnerInfo }))

      setSaveToast('Modificările au fost salvate.')
      window.setTimeout(() => setSaveToast(''), 2800)
    } catch (error) {
      console.error('Nu am putut salva profilul in baza de date.', error)
      const errorMessage = error.response?.data?.detail || 'Nu am putut salva profilul în baza de date.'
      setMessage(errorMessage)
      setSaveToast(errorMessage)
      window.setTimeout(() => setSaveToast(''), 3200)
    }
  }

  const changePassword = async () => {
    if (!passwordForm.parola_veche || !passwordForm.parola_noua) {
      setPasswordMessage('Completează parola veche și parola nouă.')
      return
    }

    if (passwordForm.parola_noua !== passwordForm.confirmare) {
      setPasswordMessage('Parolele noi nu coincid.')
      return
    }

    try {
      await axios.put(`${API_URL}/utilizator/${userId}/parola`, {
        parola_veche: passwordForm.parola_veche,
        parola_noua: passwordForm.parola_noua
      })

      setPasswordForm({ parola_veche: '', parola_noua: '', confirmare: '' })
      setPasswordMessage('')
      setSaveToast('Parola a fost schimbată.')
      window.setTimeout(() => setSaveToast(''), 2800)
    } catch (error) {
      console.error(error)
      setPasswordMessage(error.response?.data?.detail || 'Nu am putut schimba parola.')
    }
  }


  const saveVetInfo = () => {
    const nextVetInfo = {
      nume: vetForm.nume.trim(),
      telefon: vetForm.telefon.trim(),
      clinica: vetForm.clinica.trim(),
      observatii: vetForm.observatii.trim()
    }

    setVetInfo(nextVetInfo)
    localStorage.setItem('petcare_vet_info', JSON.stringify(nextVetInfo))
    setShowVetModal(false)
    setSaveToast('Contactul veterinar a fost salvat.')
    window.setTimeout(() => setSaveToast(''), 2600)
  }

  const handleSettingsSearch = (value) => {
    setSettingsSearch(value)
    const query = value.trim().toLowerCase()

    if (!query) return

    if (query.includes('parol')) {
      document.querySelector('.security-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } else if (query.includes('adres') || query.includes('telefon') || query.includes('profil')) {
      document.querySelector('.profile-settings-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } else if (query.includes('notific') || query.includes('reminder') || query.includes('vaccin')) {
      document.querySelector('.notifications-settings-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  const logout = () => {
    localStorage.removeItem('petcare_user_id')
    localStorage.removeItem('petcare_user')
    localStorage.removeItem('petcare_user_nume')
    navigate('/login')
  }

  const userName = form.nume || user?.nume || 'Utilizator'
  useEffect(() => {
    const handleOwnerProfileUpdate = () => {
      try {
        const globalOwnerInfo = JSON.parse(localStorage.getItem('petcare-owner-profile') || '{}')
        setForm((current) => ({
          ...current,
          nume: globalOwnerInfo.name || current.nume,
          telefon: globalOwnerInfo.phone || current.telefon,
          adresa: sanitizeAddress(globalOwnerInfo.address || current.adresa)
        }))
      } catch {
        // nu schimbam formularul daca datele locale nu pot fi citite
      }
    }

    window.addEventListener('petcare-owner-profile-updated', handleOwnerProfileUpdate)
    window.addEventListener('storage', handleOwnerProfileUpdate)

    return () => {
      window.removeEventListener('petcare-owner-profile-updated', handleOwnerProfileUpdate)
      window.removeEventListener('storage', handleOwnerProfileUpdate)
    }
  }, [])

  const addressValue = form.adresa

  return (
    <main className="user-shell refined-user-area pc-fixed-user-layout pc-settings-layout">
      <style>{`
        .settings-password-field input[type="password"]::-ms-reveal,
        .settings-password-field input[type="password"]::-ms-clear {
          display: none;
        }

        .settings-password-field input[type="password"]::-webkit-credentials-auto-fill-button,
        .settings-password-field input[type="password"]::-webkit-textfield-decoration-container {
          visibility: hidden;
          pointer-events: none;
        }

        .settings-password-field {
          position: relative;
        }

        .settings-password-field input {
          padding-right: 46px;
        }

        .settings-password-toggle {
          position: absolute;
          right: 18px;
          top: 50%;
          transform: translateY(-50%);
          width: 30px;
          height: 30px;
          border: 0;
          background: transparent;
          color: #64748b;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          padding: 0;
        }

        .settings-password-toggle:hover {
          color: #4338ca;
        }

        .profile-settings-card .settings-card-footer-line {
          margin-top: 22px !important;
          padding-top: 18px !important;
        }
      `}</style>
      <aside className="user-sidebar refined-sidebar">
        <div className="user-logo">
          <span><PawPrint size={20} /></span>
          <div>
            <strong>PetCare</strong>
            <small>Premium Care</small>
          </div>
        </div>

        <nav className="user-nav">
          <button type="button" onClick={() => navigate('/')}>
            <LayoutDashboard size={18} /> Dashboard
          </button>
          <button type="button" onClick={() => navigate('/')}>
            <PawPrint size={18} /> Animalele mele
          </button>
          <button type="button" onClick={() => setShowVetModal(true)}>
            <Stethoscope size={18} /> Veterinarul meu
          </button>
          <button className="active" type="button">
            <Settings size={18} /> Setări
          </button>
        </nav>

        <div className="user-sidebar-footer">
          <button type="button" onClick={() => setShowHelpModal(true)}><HelpCircle size={17} /> Ajutor</button>
          <button type="button" onClick={logout} className="logout"><LogOut size={17} /> Deconectare</button>
        </div>
      </aside>

      <section className="user-main settings-main refined-settings-main pc-fixed-user-main">
        <header className="user-topbar refined-topbar settings-topbar-clean">
          <div className="user-top-actions">
            <div className="user-notification-wrapper">
              <button type="button" className="user-icon-button" onClick={() => setShowNotifications((current) => !current)}><Bell size={18} /></button>
              {showNotifications ? (
                <div className="notifications-panel user-notifications-panel">
                  <div className="notifications-panel-header">
                    <strong>Notificări</strong>
                    <button type="button" onClick={() => setShowNotifications(false)}><X size={16} /></button>
                  </div>
                  <div className="notification-item soft">
                    <strong>Remindere interne</strong>
                    <p>Vaccinările, deparazitările și tratamentele apar aici pe baza datelor completate în profilurile animalelor.</p>
                  </div>
                </div>
              ) : null}
            </div>
            <button type="button" className="user-profile-pill">
              <span>{form.fotografie_url ? <img src={form.fotografie_url} style={avatarImageStyle} alt={userName} /> : userName.charAt(0).toUpperCase()}</span>
              <div>
                <strong>{userName}</strong>
                <small>Membru Premium</small>
              </div>
            </button>
          </div>
        </header>

        <section className="settings-hero refined-settings-hero">
          <span>Profilul meu</span>
          <h1>Setări cont</h1>
          <p>Administrează datele personale, securitatea și reminderele interne ale contului pentru o experiență de îngrijire optimizată.</p>
        </section>

        <section className="settings-grid refined-settings-grid">
          <div className="settings-left-column">
            <article className="settings-card profile-settings-card refined-profile-card">
              <div className="settings-card-header settings-profile-header-modern refined-profile-header">
                <div className="settings-avatar settings-avatar-editable refined-avatar">
                  {form.fotografie_url ? <img src={form.fotografie_url} style={avatarImageStyle} alt={userName} /> : <UserRound size={30} />}
                </div>
                <div className="refined-profile-summary">
                  <h2>{userName}</h2>
                  <p>{form.email}</p>
                  <div className="profile-chip-row">
                    <span>Membru Premium</span>
                    <small>ID: PC-{String(userId || '0000').padStart(4, '0')}</small>
                  </div>
                </div>
                <button type="button" className="settings-photo-button refined-photo-button" onClick={() => fileInputRef.current?.click()}>
                  <Upload size={15} /> Alege poza de profil
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleProfileImageChange} />
              </div>

              <div className="settings-form-grid refined-form-grid">
                <label>
                  Nume complet
                  <div className="profile-input-shell"><UserRound size={16} /><input value={form.nume} onFocus={() => setFocusedField('nume')} onBlur={() => handleFieldBlur('nume')} onChange={(event) => updateForm('nume', event.target.value)} placeholder={getPlaceholder('nume', 'Numele tău complet')} /></div>
                </label>
                <label>
                  Email
                  <div className="profile-input-shell"><Mail size={16} /><input value={form.email} disabled title={form.email} /></div>
                </label>
                <label>
                  Telefon
                  <div className="profile-input-shell"><Phone size={16} /><input value={form.telefon} onFocus={() => setFocusedField('telefon')} onBlur={() => handleFieldBlur('telefon')} onChange={(event) => updateForm('telefon', event.target.value)} placeholder={getPlaceholder('telefon', 'De completat')} /></div>
                </label>
                <label>
                  Adresă
                  <div className="profile-input-shell"><MapPin size={16} /><input value={addressValue} onFocus={() => setFocusedField('adresa')} onBlur={() => handleFieldBlur('adresa')} onChange={(event) => updateForm('adresa', event.target.value)} placeholder={getPlaceholder('adresa', 'Ex: Str. Libertății nr. 12, Timișoara')} autoComplete="street-address" /></div>
                </label>
              </div>

              <div className="settings-card-footer-line" style={{ marginTop: 22, paddingTop: 18 }}>
                {message ? <p className="settings-message refined-message">{message}</p> : <span aria-hidden="true" />}
                <button type="button" className="settings-save-button refined-save-button" onClick={saveProfile}><Save size={16} /> Salvează profilul</button>
              </div>
            </article>

            <article className="settings-card security-card refined-security-card">
              <div className="settings-title-with-icon">
                <span><Lock size={18} /></span>
                <h2>Securitate și autentificare</h2>
              </div>

              <div className="settings-form-grid password-grid refined-password-grid">
                <label>
                  Parola actuală
                  <div className="settings-password-field">
                    <Lock size={16} />
                    <input
                      type={visiblePasswords.current ? 'text' : 'password'}
                      value={passwordForm.parola_veche}
                      onChange={(event) => updatePasswordForm('parola_veche', event.target.value)}
                    />
                    <button
                      type="button"
                      className="settings-password-toggle"
                      onClick={() => togglePasswordVisibility('current')}
                      aria-label={visiblePasswords.current ? 'Ascunde parola actuală' : 'Arată parola actuală'}
                    >
                      {visiblePasswords.current ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </label>
                <label>
                  Parola nouă
                  <div className="settings-password-field">
                    <Lock size={16} />
                    <input
                      type={visiblePasswords.new ? 'text' : 'password'}
                      value={passwordForm.parola_noua}
                      onChange={(event) => updatePasswordForm('parola_noua', event.target.value)}
                    />
                    <button
                      type="button"
                      className="settings-password-toggle"
                      onClick={() => togglePasswordVisibility('new')}
                      aria-label={visiblePasswords.new ? 'Ascunde parola nouă' : 'Arată parola nouă'}
                    >
                      {visiblePasswords.new ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </label>
                <label>
                  Confirmă parola
                  <div className="settings-password-field">
                    <Lock size={16} />
                    <input
                      type={visiblePasswords.confirm ? 'text' : 'password'}
                      value={passwordForm.confirmare}
                      onChange={(event) => updatePasswordForm('confirmare', event.target.value)}
                    />
                    <button
                      type="button"
                      className="settings-password-toggle"
                      onClick={() => togglePasswordVisibility('confirm')}
                      aria-label={visiblePasswords.confirm ? 'Ascunde confirmarea parolei' : 'Arată confirmarea parolei'}
                    >
                      {visiblePasswords.confirm ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </label>
              </div>

              {passwordMessage ? <p className="settings-message refined-message">{passwordMessage}</p> : null}
              <button type="button" className="settings-outline-button refined-outline-button" onClick={changePassword}>Schimbă parola</button>
            </article>
          </div>

          <aside className="settings-card notifications-settings-card refined-reminders-card">
            <div className="settings-title-with-icon">
              <span><Bell size={18} /></span>
              <h2>Remindere</h2>
            </div>

            <p className="settings-side-note">
              Gestionează notificările automate afișate în clopoțel pe baza datelor completate în carnetul de sănătate.
            </p>

            

            <div className="notification-settings-group">
              <span>Tipuri de alertă</span>
              {[
                ['vaccines', 'Vaccin anual'],
                ['deworming', 'Deparazitare'],
                ['treatments', 'Tratamente active']
              ].map(([key, label]) => (
                <button key={key} type="button" onClick={() => updateNotifications(key)}>
                  {label}
                  <i className={notifications[key] ? 'active' : ''} />
                </button>
              ))}
            </div>

            <div className="settings-reminder-examples refined-reminder-note">
              <div><Syringe size={16} /><span>Vaccin: alertă cu 14 zile înainte</span></div>
              <div><CalendarCheck size={16} /><span>Deparazitare: alertă recurentă</span></div>
              <div><Bell size={16} /><span>Tratament: memento pentru doză</span></div>
            </div>
          </aside>
        </section>
      </section>

      {showAvatarCrop ? (
        <div className="user-modal-overlay">
          <section className="avatar-crop-modal compact-avatar-crop-modal">
            <button className="avatar-crop-close" type="button" onClick={() => { setShowAvatarCrop(false); setPendingAvatar('') }}><X size={18} /></button>
            <div className="avatar-crop-header">
              <span>Poza profil</span>
              <h2>Încadrează poza</h2>
              <p>Ajustează poziția și zoom-ul ca poza să arate bine în avatar.</p>
            </div>
            <div className="avatar-drag-editor">
              <div
                ref={avatarDragRef}
                className="avatar-drag-stage"
                onMouseDown={handleAvatarDragStart}
                onMouseMove={handleAvatarDragMove}
                onMouseUp={handleAvatarDragEnd}
                onMouseLeave={handleAvatarDragEnd}
                onTouchStart={handleAvatarDragStart}
                onTouchMove={handleAvatarDragMove}
                onTouchEnd={handleAvatarDragEnd}
              >
                <img
                  src={pendingAvatar}
                  alt="Previzualizare profil"
                  draggable="false"
                  style={{ objectPosition: `${avatarCrop.x}% ${avatarCrop.y}%`, transform: `scale(${avatarCrop.zoom})` }}
                />
                <div className="avatar-drag-grid" />
              </div>
              <p className="avatar-drag-hint">Trage poza cu mouse-ul ca să o poziționezi. Folosește zoom doar dacă ai nevoie.</p>
              <div className="avatar-zoom-actions">
                <button type="button" onClick={() => adjustAvatarZoom(-1)}>−</button>
                <span>Zoom {Math.round(avatarCrop.zoom * 100)}%</span>
                <button type="button" onClick={() => adjustAvatarZoom(1)}>+</button>
              </div>
            </div>
            <div className="avatar-crop-actions">
              <button type="button" className="primary" onClick={saveAvatarCrop}>Salvează</button>
            </div>
          </section>
        </div>
      ) : null}

      {showHelpModal ? (
        <div className="user-modal-overlay">
          <section className="user-modal-card user-info-modal-card user-help-modal-premium refined-help-modal">
            <div className="user-modal-header">
              <div>
                <span>Ghid rapid</span>
                <h2>Cum folosești PetCare</h2>
                <p>Un ghid scurt pentru funcționalitățile principale.</p>
              </div>
              <button type="button" onClick={() => setShowHelpModal(false)}><X size={18} /></button>
            </div>
            <div className="user-help-grid compact-help-grid">
              <div className="user-help-step"><span>01</span><strong>Adaugă animalul</strong><p>Creează dosarul și completează datele principale.</p></div>
              <div className="user-help-step"><span>02</span><strong>Raportează simptome</strong><p>Folosește centrul de sănătate pentru evaluări.</p></div>
              <div className="user-help-step"><span>03</span><strong>Completează carnetul</strong><p>Notează vaccinări și deparazitări.</p></div>
              <div className="user-help-step"><span>04</span><strong>Urmărește tratamentele</strong><p>Verifică rutina zilnică și istoricul.</p></div>
            </div>
          </section>
        </div>
      ) : null}

      {showVetModal ? (
        <div className="user-modal-overlay">
          <section className="vet-contact-modal">
            <button className="vet-contact-close" type="button" onClick={() => setShowVetModal(false)}><X size={20} /></button>

            <div className="vet-contact-header">
              <span className="vet-contact-icon"><Stethoscope size={22} /></span>
              <div>
                <h2>Veterinarul meu</h2>
                <p>Salvează contactul medicului sau cabinetului la care mergi de obicei.</p>
              </div>
            </div>

            <div className="vet-contact-form">
              <label>
                <span>Nume medic</span>
                <div><Stethoscope size={16} /><input value={vetForm.nume} onChange={(event) => setVetForm((current) => ({ ...current, nume: event.target.value }))} placeholder="Dr. Popescu Andrei" /></div>
              </label>
              <label>
                <span>Telefon</span>
                <div><Bell size={16} /><input value={vetForm.telefon} onChange={(event) => setVetForm((current) => ({ ...current, telefon: event.target.value }))} placeholder="0722 000 000" /></div>
              </label>
              <label className="wide">
                <span>Clinică / locație</span>
                <div><ShieldPlus size={16} /><input value={vetForm.clinica} onChange={(event) => setVetForm((current) => ({ ...current, clinica: event.target.value }))} placeholder="VetCare Timișoara, Str. Principală 42" /></div>
              </label>
              <label className="wide">
                <span>Observații suplimentare</span>
                <textarea value={vetForm.observatii} onChange={(event) => setVetForm((current) => ({ ...current, observatii: event.target.value }))} placeholder="Program, urgențe, recomandări sau medic preferat..." />
              </label>
            </div>

            <div className="vet-contact-actions">
              <button type="button" onClick={() => setShowVetModal(false)}>Renunță</button>
              <button type="button" className="primary" onClick={saveVetInfo}>Salvează contactul</button>
            </div>
          </section>
        </div>
      ) : null}

      {saveToast ? <div className="profile-save-toast">{saveToast}</div> : null}
    </main>
  )
}

export default UserSettings