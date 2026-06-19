import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueries, useQuery } from '@tanstack/react-query'
import axios from 'axios'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  Bell,
  CheckCircle2,
  CalendarDays,
  FileText,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  PawPrint,
  Plus,
  Settings,
  ShieldPlus,
  Stethoscope,
  X
} from 'lucide-react'

const API_URL = 'http://127.0.0.1:8000'

const parsePetCareDate = (value) => {
  if (!value) return null

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(String(value))) {
    const [day, month, year] = String(value).split('/')
    return new Date(Number(year), Number(month) - 1, Number(day))
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const daysBetweenToday = (value) => {
  const date = parsePetCareDate(value)
  if (!date) return null

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  date.setHours(0, 0, 0, 0)

  return Math.floor((today - date) / (1000 * 60 * 60 * 24))
}

const isMedicalRecordValid = (records, type, fallbackDays) => {
  const recordsOfType = (records || [])
    .filter((record) => record.type === type)
    .sort((a, b) => (parsePetCareDate(b.date)?.getTime() || 0) - (parsePetCareDate(a.date)?.getTime() || 0))

  if (!recordsOfType.length) return false

  const latestRecord = recordsOfType[0]
  const nextDate = parsePetCareDate(latestRecord.nextDate)

  if (nextDate) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    nextDate.setHours(0, 0, 0, 0)
    return nextDate >= today
  }

  const days = daysBetweenToday(latestRecord.date)
  return days !== null && days >= 0 && days <= fallbackDays
}

const getRecentSymptoms = (symptoms = []) => {
  return symptoms.filter((symptom) => {
    const days = daysBetweenToday(symptom.data_raportare)
    return days !== null && days >= 0 && days <= 30
  })
}

const getSymptomsScore = (symptoms = []) => {
  const recentSymptoms = getRecentSymptoms(symptoms)

  if (!recentSymptoms.length) return 25

  const severities = recentSymptoms.map((symptom) =>
    String(symptom.severitate || '').toLowerCase()
  )

  if (severities.some((severity) => ['ridicata', 'severa', 'severă'].includes(severity))) return 5
  if (severities.some((severity) => severity === 'medie')) return 15

  return 20
}

const calculatePetHealthIndex = ({
  medicalRecords = [],
  treatments = [],
  symptoms = [],
  journalRecords = []
}) => {
  const activeTreatments = (treatments || []).filter((treatment) => treatment.data_start)
  const vaccineValid = isMedicalRecordValid(medicalRecords, 'vaccin', 365)
  const parasiteValid = isMedicalRecordValid(medicalRecords, 'deparazitare', 90)

  const lastJournalDays = Math.min(
    ...((journalRecords || [])
      .map((entry) => daysBetweenToday(entry.date))
      .filter((days) => days !== null && days >= 0)
    ),
    Infinity
  )

  const journalRecent = lastJournalDays !== Infinity && lastJournalDays <= 7

  let score = 0
  score += vaccineValid ? 25 : 0
  score += parasiteValid ? 20 : 0
  score += activeTreatments.length === 0 ? 20 : 15
  score += getSymptomsScore(symptoms)
  score += journalRecent ? 10 : 5

  return Math.max(0, Math.min(100, Math.round(score)))
}


function Dashboard() {
  const navigate = useNavigate()
  const animalsSectionRef = useRef(null)
  const userId = localStorage.getItem('petcare_user_id')
  const storedUser = JSON.parse(localStorage.getItem('petcare_user') || '{}')
  const storedProfile = JSON.parse(localStorage.getItem(`petcare_user_profile_${userId}`) || '{}')
  const storedAvatar = localStorage.getItem(`petcare_user_avatar_${userId}`) || storedProfile.fotografie_url || storedUser.fotografie_url || ''
  const storedAvatarCrop = JSON.parse(localStorage.getItem(`petcare_user_avatar_crop_${userId}`) || '{"x":50,"y":50,"zoom":1}')

  const [showAnimalForm, setShowAnimalForm] = useState(false)
  const [showHelpModal, setShowHelpModal] = useState(false)
  const [showVetModal, setShowVetModal] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [activeMenu, setActiveMenu] = useState('dashboard')
  const [savingAnimal, setSavingAnimal] = useState(false)
  const [animalForm, setAnimalForm] = useState({
    nume: '',
    specie: 'pisica',
    rasa_id: '',
    varsta: '',
    greutate: '',
    sex: ''
  })
  const [vetInfo, setVetInfo] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('petcare_vet_info') || '{}')
    } catch {
      return {}
    }
  })
  const [vetForm, setVetForm] = useState({
    nume: vetInfo.nume || '',
    telefon: vetInfo.telefon || '',
    clinica: vetInfo.clinica || '',
    observatii: vetInfo.observatii || ''
  })

  const { data: user } = useQuery({
    queryKey: ['utilizator', userId],
    queryFn: async () => {
      const response = await axios.get(`${API_URL}/utilizator/${userId}`)
      return response.data
    },
    enabled: Boolean(userId),
    initialData: storedUser?.id ? storedUser : undefined
  })

  const { data: animale = [], isLoading, refetch } = useQuery({
    queryKey: ['animale', userId],
    queryFn: async () => {
      const response = await axios.get(`${API_URL}/animale`, {
        params: { user_id: userId }
      })
      return response.data
    },
    enabled: Boolean(userId)
  })

  const animalHealthQueries = useQueries({
    queries: (animale || []).flatMap((animal) => [
      {
        queryKey: ['dashboard-istoric-simptome', animal.id],
        queryFn: async () => {
          const response = await axios.get(`${API_URL}/istoric-simptome/${animal.id}`)
          return response.data
        },
        enabled: Boolean(animal.id)
      },
      {
        queryKey: ['dashboard-tratamente', animal.id],
        queryFn: async () => {
          const response = await axios.get(`${API_URL}/tratamente/${animal.id}`)
          return response.data
        },
        enabled: Boolean(animal.id)
      }
    ])
  })

  const { data: rase = [] } = useQuery({
    queryKey: ['rase'],
    queryFn: async () => {
      const response = await axios.get(`${API_URL}/rase`)
      return response.data
    }
  })

  const raseFiltrate = rase.filter((rasa) => rasa.specie === animalForm.specie)
  const globalHealthIndex = useMemo(() => {
    if (!animale.length) return 0

    const scores = animale.map((animal, index) => {
      const symptoms = animalHealthQueries[index * 2]?.data || []
      const treatments = animalHealthQueries[index * 2 + 1]?.data || []
      const medicalRecords = JSON.parse(localStorage.getItem(`petcare-medical-records-${animal.id}`) || '[]')
      const journalRecords = JSON.parse(localStorage.getItem(`petcare-daily-journal-${animal.id}`) || '[]')

      const cachedScore = Number(localStorage.getItem(`petcare-health-index-${animal.id}`))
      const hasLoadedExtraData =
        animalHealthQueries[index * 2]?.isSuccess || animalHealthQueries[index * 2 + 1]?.isSuccess

      if (!hasLoadedExtraData && Number.isFinite(cachedScore)) {
        return cachedScore
      }

      return calculatePetHealthIndex({
        medicalRecords,
        treatments,
        symptoms,
        journalRecords
      })
    })

    return Math.round(scores.reduce((total, score) => total + score, 0) / scores.length)
  }, [animale, animalHealthQueries])
  const reminders = useMemo(() => {
    if (!animale.length) return []

    return [
      {
        title: 'Vaccinări și deparazitări',
        text: 'Verifică datele din carnetul de sănătate pentru animalele adăugate.'
      },
      {
        title: 'Tratamente active',
        text: 'Dacă există tratamente în derulare, urmărește rutina zilnică din profilul animalului.'
      }
    ]
  }, [animale])

  const updateAnimalForm = (field, value) => {
    setAnimalForm((current) => ({
      ...current,
      [field]: value,
      ...(field === 'specie' ? { rasa_id: '' } : {})
    }))
  }

  const resetAnimalForm = () => {
    setAnimalForm({
      nume: '',
      specie: 'pisica',
      rasa_id: '',
      varsta: '',
      greutate: '',
      sex: ''
    })
  }

  const addAnimal = async () => {
    if (!animalForm.nume.trim()) {
      alert('Completează numele animalului.')
      return
    }

    try {
      setSavingAnimal(true)
      await axios.post(`${API_URL}/animale`, {
        user_id: Number(userId),
        nume: animalForm.nume.trim(),
        specie: animalForm.specie,
        rasa_id: animalForm.rasa_id ? Number(animalForm.rasa_id) : null,
        varsta: animalForm.varsta ? Number(animalForm.varsta) : null,
        greutate: animalForm.greutate ? Number(animalForm.greutate) : null,
        sex: animalForm.sex || null,
        fotografie_url: ''
      })

      resetAnimalForm()
      setShowAnimalForm(false)
      refetch()
    } catch (error) {
      console.error(error)
      alert('A apărut o eroare la adăugarea animalului.')
    } finally {
      setSavingAnimal(false)
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
  }

  const scrollToAnimals = () => {
    setActiveMenu('animals')
    animalsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const goDashboard = () => {
    setActiveMenu('dashboard')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }


  const stripDiacritics = (text = '') => {
    return String(text ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
  }


  const generatePdfReport = () => {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    })

    const currentDate = new Date().toLocaleDateString('ro-RO')
    const reportFileName = `Raport_PetCare_${currentDate.replace(/\./g, '-')}.pdf`

    doc.setTextColor(55, 48, 163)
    doc.setFontSize(22)
    doc.text('Raport PetCare', 14, 18)

    doc.setTextColor(71, 85, 105)
    doc.setFontSize(11)
    doc.text(`Utilizator: ${stripDiacritics(userName)}`, 14, 28)
    doc.text(`Animale monitorizate: ${animale.length}`, 14, 35)
    doc.text(`Data generarii: ${currentDate}`, 14, 42)

    autoTable(doc, {
      startY: 52,
      head: [[
        stripDiacritics('Nume'),
        stripDiacritics('Specie'),
        stripDiacritics('Rasa'),
        stripDiacritics('Varsta'),
        stripDiacritics('Greutate')
      ]],
      body: animale.length
        ? animale.map((animal) => [
            stripDiacritics(animal.nume || '-'),
            stripDiacritics(animal.specie || '-'),
            stripDiacritics(animal.rasa || 'Rasa necompletata'),
            stripDiacritics(formatAge(animal.varsta, '-')),
            animal.greutate ? `${animal.greutate} kg` : '-'
          ])
        : [[stripDiacritics('Nu exista animale inregistrate.'), '-', '-', '-', '-']],
      styles: {
        font: 'helvetica',
        fontSize: 10,
        cellPadding: 4,
        textColor: [17, 24, 39],
        lineColor: [219, 228, 240],
        lineWidth: 0.2
      },
      headStyles: {
        fillColor: [243, 240, 255],
        textColor: [55, 48, 163],
        fontStyle: 'bold'
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      margin: { left: 14, right: 14 }
    })

    const pageHeight = doc.internal.pageSize.height
    doc.setFontSize(9)
    doc.setTextColor(100, 116, 139)
    doc.text(stripDiacritics('Raport generat automat din aplicatia PetCare.'), 14, pageHeight - 10)

    doc.save(reportFileName)
  }

  const logout = () => {
    localStorage.removeItem('petcare_user_id')
    localStorage.removeItem('petcare_user')
    localStorage.removeItem('petcare_user_nume')
    navigate('/login')
  }


  const getAnimalInitial = (name) => String(name || '?').trim().charAt(0).toUpperCase() || '?'

  const getAnimalAvatarTone = (sex) => {
    const normalizedSex = String(sex || '').toLowerCase()
    return normalizedSex.includes('fem') ? 'female' : 'male'
  }

  const formatAge = (age, fallback = 'De completat') => {
    if (age === null || age === undefined || age === '') return fallback

    const numericAge = Number(age)

    if (!Number.isFinite(numericAge)) return fallback

    return numericAge === 1 ? '1 an' : `${numericAge} ani`
  }

  const userName = user?.nume || storedUser?.nume || 'utilizator'
  const firstName = userName.split(' ')[0]
  const dashboardAvatarStyle = storedAvatar
    ? { objectPosition: `${storedAvatarCrop.x || 50}% ${storedAvatarCrop.y || 50}%`, transform: `scale(${storedAvatarCrop.zoom || 1})` }
    : undefined

  return (
    <main className="user-shell pc-fixed-user-layout pc-dashboard-layout">
      <aside className="user-sidebar">
        <div className="user-logo">
          <span><PawPrint size={20} /></span>
          <div>
            <strong>PetCare</strong>
            <small>Premium Pet Care</small>
          </div>
        </div>

        <nav className="user-nav">
          <button className={activeMenu === 'dashboard' ? 'active' : ''} type="button" onClick={goDashboard}>
            <LayoutDashboard size={19} />
            Dashboard
          </button>
          <button className={activeMenu === 'animals' ? 'active' : ''} type="button" onClick={scrollToAnimals}>
            <PawPrint size={19} />
            Animalele mele
          </button>
          <button className={activeMenu === 'vet' ? 'active' : ''} type="button" onClick={() => { setActiveMenu('vet'); setShowVetModal(true) }}>
            <Stethoscope size={19} />
            Veterinarul meu
          </button>
          <button type="button" onClick={() => navigate('/settings')}>
            <Settings size={19} />
            Setări
          </button>
        </nav>

        <div className="user-sidebar-footer">
          <button type="button" onClick={() => setShowHelpModal(true)}>
            <HelpCircle size={18} />
            Ajutor
          </button>
          <button type="button" onClick={logout} className="logout">
            <LogOut size={18} />
            Deconectare
          </button>
        </div>
      </aside>

      <section className="user-main pc-fixed-user-main">
        <header className="user-topbar dashboard-topbar-clean">
          <div className="dashboard-topbar-spacer" aria-hidden="true" />

          <div className="user-top-actions">
            <div className="user-notification-wrapper">
              <button type="button" className="user-icon-button" onClick={() => setShowNotifications((current) => !current)}>
                <Bell size={19} />
              </button>
              {showNotifications ? (
                <div className="notifications-panel user-notifications-panel">
                  <div className="notifications-panel-header">
                    <strong>Notificări</strong>
                    <button type="button" onClick={() => setShowNotifications(false)}><X size={16} /></button>
                  </div>
                  {reminders.length ? (
                    reminders.map((reminder) => (
                      <div key={reminder.title} className="notification-item soft">
                        <strong>{reminder.title}</strong>
                        <p>{reminder.text}</p>
                      </div>
                    ))
                  ) : (
                    <p className="notifications-empty">Nu ai notificări momentan. Adaugă primul animal pentru a genera remindere.</p>
                  )}
                </div>
              ) : null}
            </div>
            <button type="button" className="user-profile-pill" onClick={() => navigate('/settings')}>
              <span>{storedAvatar ? <img src={storedAvatar} style={dashboardAvatarStyle} alt={userName} /> : userName.charAt(0).toUpperCase()}</span>
              <div>
                <strong>{userName}</strong>
                <small>Membru Premium</small>
              </div>
            </button>
          </div>
        </header>

        <section className="user-hero-card">
          <div>
            <span>PetCare Premium</span>
            <h1>Bună, {firstName}</h1>
            <p>
              Monitorizează profilul animalelor de companie, simptomele raportate și tratamentele importante într-un singur loc.
            </p>
          </div>
          <button type="button" onClick={() => setShowAnimalForm(true)}>
            <Plus size={18} />
            Adaugă animal
          </button>
        </section>

        <section className="user-dashboard-grid">
          <div className="user-animals-section" ref={animalsSectionRef}>
            <div className="section-title-row">
              <div>
                <span>Dosare active</span>
                <h2>Animalele mele</h2>
              </div>
            </div>

            {isLoading ? (
              <div className="user-empty-card">Se încarcă animalele...</div>
            ) : animale.length ? (
              <div className="user-animal-grid">
                {animale.map((animal) => (
                  <article
                    key={animal.id}
                    className="user-animal-card"
                    onClick={() => navigate(`/animal/${animal.id}`)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="animal-card-top">
                      {animal.fotografie_url ? (
                        <img
                          src={animal.fotografie_url}
                          alt={animal.nume}
                        />
                      ) : (
                        <span className={`animal-initial-avatar ${getAnimalAvatarTone(animal.sex)} visible`}>
                          {getAnimalInitial(animal.nume)}
                        </span>
                      )}
                      <div>
                        <h3>{animal.nume}</h3>
                        <span>{animal.rasa || 'Rasă necompletată'}</span>
                      </div>
                    </div>

                    <div className="animal-info-grid">
                      <div>
                        <small>Specie</small>
                        <span>{animal.specie || 'De completat'}</span>
                      </div>
                      <div>
                        <small>Vârstă</small>
                        <span>{formatAge(animal.varsta)}</span>
                      </div>
                      <div>
                        <small>Greutate</small>
                        <span>{animal.greutate ? `${animal.greutate} kg` : 'De completat'}</span>
                      </div>
                      <div>
                        <small>Sex</small>
                        <span>{animal.sex || 'De completat'}</span>
                      </div>
                    </div>

                    <div className="animal-breed-summary">
                      <span>Profil rasă</span>
                      <span>{animal.rasa_temperament || 'Informații de completat'}</span>
                      <p>
                        Greutate medie: {animal.rasa_greutate_medie || 'necunoscut'} · activitate {animal.rasa_nivel_activitate || 'mediu'}
                      </p>
                    </div>

                    <div className="animal-card-actions">
                      <button type="button" onClick={(event) => { event.stopPropagation(); navigate(`/animal/${animal.id}`) }}>Vezi profilul</button>
                      <button type="button" className="ghost" onClick={(event) => { event.stopPropagation(); navigate(`/animal/${animal.id}?tab=health&modal=evaluation`) }}>
                        Raportează rapid
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="user-empty-card">
                <span><PawPrint size={28} /></span>
                <h3>Nu ai animale adăugate încă</h3>
                <p>Apasă pe butonul „Adaugă animal” din cardul de sus pentru a crea primul dosar medical.</p>
              </div>
            )}
          </div>

          <aside className="user-insights-column">
            <div className="global-health-card">
              <div className="health-ring" style={{ '--value': `${globalHealthIndex}%` }}>
                <strong>{globalHealthIndex || 0}%</strong>
              </div>
              <h3>Index de sănătate global</h3>
              <p>Performanța medie a sănătății tuturor animalelor monitorizate luna aceasta.</p>
            </div>

            <div className="user-events-card">
              <div className="user-card-icon soft-blue"><CalendarDays size={22} /></div>
              <span>Evenimente viitoare</span>
              <h3>{animale.length ? 'Dosare în monitorizare' : 'Nicio programare'}</h3>
              <p>
                {animale.length
                  ? 'Urmărește vaccinările, deparazitările și controalele direct din profilul fiecărui animal.'
                  : 'După ce adaugi primul animal, aici vor apărea evenimentele importante.'}
              </p>
            </div>

            <div className="user-report-card">
              <div className="user-card-icon soft-blue"><FileText size={22} /></div>
              <span>Rapoarte detaliate</span>
              <h3>Exportă istoricul medical</h3>
              <p>Generează un raport printabil cu animalele și datele principale.</p>
              <button type="button" onClick={generatePdfReport}>Descarcă PDF</button>
            </div>
          </aside>
        </section>
      </section>

      {showAnimalForm ? (
        <div className="user-modal-overlay">
          <section className="user-modal-card">
            <div className="user-modal-header">
              <div>
                <span>Animal nou</span>
                <h2>Adaugă animal</h2>
              </div>
              <button type="button" onClick={() => setShowAnimalForm(false)}>×</button>
            </div>

            <div className="user-modal-form">
              <label>
                Nume
                <input value={animalForm.nume} onChange={(event) => updateAnimalForm('nume', event.target.value)} placeholder="Ex: Luna" />
              </label>

              <label>
                Specie
                <select value={animalForm.specie} onChange={(event) => updateAnimalForm('specie', event.target.value)}>
                  <option value="pisica">Pisică</option>
                  <option value="caine">Câine</option>
                </select>
              </label>

              <label>
                Rasă
                <select value={animalForm.rasa_id} onChange={(event) => updateAnimalForm('rasa_id', event.target.value)}>
                  <option value="">Alege rasa</option>
                  {raseFiltrate.map((rasa) => (
                    <option key={rasa.id} value={rasa.id}>{rasa.nume}</option>
                  ))}
                </select>
              </label>

              <label>
                Vârstă
                <input type="number" value={animalForm.varsta} onChange={(event) => updateAnimalForm('varsta', event.target.value)} placeholder="Ex: 2" />
              </label>

              <label>
                Greutate
                <input type="number" step="0.1" value={animalForm.greutate} onChange={(event) => updateAnimalForm('greutate', event.target.value)} placeholder="Ex: 4.5" />
              </label>

              <label>
                Sex
                <select value={animalForm.sex} onChange={(event) => updateAnimalForm('sex', event.target.value)}>
                  <option value="">De completat</option>
                  <option value="mascul">Mascul</option>
                  <option value="femela">Femelă</option>
                </select>
              </label>
            </div>

            <div className="user-modal-actions">
              <button type="button" onClick={() => setShowAnimalForm(false)}>Renunță</button>
              <button type="button" className="primary" onClick={addAnimal} disabled={savingAnimal}>
                {savingAnimal ? 'Se salvează...' : 'Salvează animal'}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {showHelpModal ? (
        <div className="user-modal-overlay">
          <section className="user-modal-card user-info-modal-card user-help-modal-premium">
            <div className="user-modal-header">
              <div>
                <span>Ghid rapid</span>
                <h2>Cum folosești PetCare</h2>
                <p>Pașii principali ca să gestionezi corect profilurile animalelor.</p>
              </div>
              <button type="button" onClick={() => setShowHelpModal(false)}><X size={20} /></button>
            </div>
            <div className="user-help-grid">
              <div className="user-help-step"><span>01</span><strong>Adaugă animalul</strong><p>Creează dosarul medical și completează rasa, greutatea și vârsta.</p></div>
              <div className="user-help-step"><span>02</span><strong>Monitorizează sănătatea</strong><p>Raportează simptome și urmărește recomandările generate de aplicație.</p></div>
              <div className="user-help-step"><span>03</span><strong>Completează carnetul</strong><p>Adaugă vaccinări, deparazitări, microcip și informații importante.</p></div>
              <div className="user-help-step"><span>04</span><strong>Urmărește tratamentele</strong><p>Notează tratamentele active și verifică rutina zilnică.</p></div>
            </div>
          </section>
        </div>
      ) : null}

      {showVetModal ? (
        <div className="user-modal-overlay">
          <section className="vet-contact-modal">
            <div className="vet-contact-top-actions">
              <button
                className="modal-icon-save"
                type="button"
                aria-label="Salveaza contactul"
                title="Salveaza"
                onClick={saveVetInfo}
              >
                <CheckCircle2 size={20} />
              </button>
              <button className="vet-contact-close" type="button" onClick={() => setShowVetModal(false)} aria-label="Inchide"><X size={20} /></button>
            </div>

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

          </section>
        </div>
      ) : null}
    </main>
  )
}

export default Dashboard