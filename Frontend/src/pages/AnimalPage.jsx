import { useEffect, useRef, useState } from 'react'
import BodyMap from '../components/BodyMap'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQueries, useQuery } from '@tanstack/react-query'
import axios from 'axios'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  ArrowLeft,
  ArrowRight,
  Settings,
  Stethoscope,
  PawPrint,
  Home,
  HeartPulse,
  Pill,
  Activity,
  BookOpen,
  Search,
  Map,
  ClipboardList,
  FileText,
  Download,
  Syringe,
  Shield,
  Clock,
  CheckCircle,
  AlertCircle,
  Plus,
  Footprints,
  PackageCheck,
  CalendarCheck,
  Edit3,
  Bell,
  CheckCircle2,
  Archive,
  X
} from 'lucide-react'

const splitDetailText = (value) => {
  if (!value) return []
  if (Array.isArray(value)) return value.filter(Boolean)

  return String(value)
    .split(/;|\n/)
    .map((item) => item.trim())
    .filter(Boolean)
}

const normalizeBreedDetails = (details) => {
  if (!details) return null

  return {
    predispozitii: splitDetailText(details.predispozitii),
    de_urmarit: splitDetailText(details.de_urmarit),
    recomandari: splitDetailText(details.recomandari),
    fun_fact: details.fun_fact || ''
  }
}



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

const normalizeMedicalTextGlobal = (value = '') =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

const isMedicalRecordValid = (records, type, fallbackDays, categoryMatch = '') => {
  const normalizedCategory = normalizeMedicalTextGlobal(categoryMatch)
  const recordsOfType = (records || [])
    .filter((record) => {
      if (record.type !== type) return false
      if (!normalizedCategory) return true

      return normalizeMedicalTextGlobal(`${record.category || ''} ${record.product || ''}`).includes(normalizedCategory)
    })
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

const getDewormingStatus = (records = []) => {
  const internalValid = isMedicalRecordValid(records, 'deparazitare', 90, 'interna')
  const externalValid = isMedicalRecordValid(records, 'deparazitare', 90, 'externa')

  if (internalValid && externalValid) {
    return { isComplete: true, score: 20, label: 'La zi' }
  }

  if (internalValid && !externalValid) {
    return { isComplete: false, score: 10, label: 'De completat deparazitarea externă' }
  }

  if (!internalValid && externalValid) {
    return { isComplete: false, score: 10, label: 'De completat deparazitarea internă' }
  }

  return { isComplete: false, score: 0, label: 'De completat deparazitări' }
}

const addMonthsToPetCareDate = (value, months) => {
  const date = parsePetCareDate(value)
  if (!date) return ''

  const next = new Date(date)
  next.setMonth(next.getMonth() + months)
  return formatDateForRomanianInput(next)
}

const addYearsToPetCareDate = (value, years) => {
  const date = parsePetCareDate(value)
  if (!date) return ''

  const next = new Date(date)
  next.setFullYear(next.getFullYear() + years)
  return formatDateForRomanianInput(next)
}

const getRecommendedNextMedicalDate = (form = {}) => {
  const dateText = String(form.date || '')

  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(dateText)) return ''

  if (form.type === 'vaccin') return addYearsToPetCareDate(dateText, 1)
  if (form.type === 'control') return addYearsToPetCareDate(dateText, 1)

  if (form.type === 'deparazitare') {
    const category = normalizeMedicalTextGlobal(form.category)

    if (category.includes('interna') || category.includes('externa')) {
      return addYearsToPetCareDate(dateText, 1)
    }

    return ''
  }

  return ''
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
  treatmentsAdministeredToday = 0,
  symptoms = [],
  journalRecords = []
}) => {
  const activeTreatments = (treatments || []).filter((treatment) => treatment.data_start)
  const vaccineValid = isMedicalRecordValid(medicalRecords, 'vaccin', 365)
  const dewormingStatus = getDewormingStatus(medicalRecords)

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
  score += dewormingStatus.score
  score += activeTreatments.length === 0
    ? 20
    : Math.round((treatmentsAdministeredToday / activeTreatments.length) * 20)
  score += getSymptomsScore(symptoms)
  score += journalRecent ? 10 : 5

  return Math.max(0, Math.min(100, Math.round(score)))
}

const getHealthIndexLabel = (score) => {
  if (score >= 90) return 'Foarte bine'
  if (score >= 75) return 'Bun'
  if (score >= 60) return 'Necesită atenție'
  if (score >= 40) return 'Risc moderat'

  return 'Necesită evaluare'
}

const bodyZoneLabels = {
  head: 'Cap',
  eyes: 'Ochi',
  ears: 'Urechi',
  mouth: 'Gură / dinți',
  skin: 'Piele / blană',
  abdomen: 'Abdomen',
  joints: 'Articulații',
  paws: 'Lăbuțe',
  tail: 'Coadă'
}

const bodyZoneDescriptions = {
  head: 'Monitorizează înclinarea capului, dezorientarea, sensibilitatea la atingere și modificările bruște de comportament.',
  eyes: 'Urmărește roșeața, secrețiile, lăcrimarea excesivă, clipitul frecvent sau dificultățile de vedere.',
  ears: 'Verifică scărpinatul frecvent, mirosurile neobișnuite, secrețiile, capul ținut într-o parte sau sensibilitatea la atingere.',
  mouth: 'Observă respirația urât mirositoare, gingiile inflamate, tartrul, salivarea excesivă sau dificultățile la mestecat.',
  skin: 'Monitorizează căderea excesivă a părului, iritațiile, mătreața, rănile, mâncărimea sau apariția nodulilor.',
  abdomen: 'Urmărește schimbările de apetit, vărsăturile, balonarea, sensibilitatea abdominală sau modificările tranzitului digestiv.',
  joints: 'Observă rigiditatea, șchiopătatul, ezitarea la sărit, dificultățile la ridicare sau scăderea mobilității.',
  paws: 'Verifică rănile, fisurile, inflamațiile, sensibilitatea la mers sau schimbările de sprijin pe lăbuțe.',
  tail: 'Monitorizează mobilitatea cozii, sensibilitatea la atingere, poziția neobișnuită sau eventualele leziuni.'
}

const getGenericBreedDetails = (breedName) => ({
  predispozitii: [
    'Sensibilitățile pot varia în funcție de vârstă, greutate și stilul de viață.',
    'Mobilitatea, apetitul și energia merită urmărite periodic.'
  ],
  de_urmarit: [
    'Schimbări de apetit, sete, energie sau comportament.',
    'Reacții după tratamente, vaccinări sau schimbări de rutină.'
  ],
  recomandari: [
    'Notează simptomele imediat ce apar pentru comparații mai clare.',
    'Păstrează carnetul medical actualizat cu vaccinări și deparazitări.'
  ],
  fun_fact: `${breedName || 'Rasa selectată'} are un profil unic, iar monitorizarea constantă ajută la observarea schimbărilor mici.`
})


const formatAge = (age, fallback = 'De completat') => {
  if (age === null || age === undefined || age === '') return fallback

  const numericAge = Number(age)

  if (!Number.isFinite(numericAge)) return fallback

  return numericAge === 1 ? '1 an' : `${numericAge} ani`
}

const formatDateForRomanianInput = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) return ''

  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()

  return `${day}/${month}/${year}`
}


function AnimalPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const animalId = Number(id)
  const userId = localStorage.getItem('petcare_user_id')

  const getEffectiveUserId = () => {
    try {
      const storedUser = JSON.parse(localStorage.getItem('petcare_user') || '{}')
      const rawId = userId || storedUser.id
      const numericId = Number(rawId)
      return Number.isFinite(numericId) && numericId > 0 ? numericId : null
    } catch {
      const numericId = Number(userId)
      return Number.isFinite(numericId) && numericId > 0 ? numericId : null
    }
  }

  const [activeTab, setActiveTab] = useState('profile')
  const [profileSearch, setProfileSearch] = useState('')
  const [showProfileSearch, setShowProfileSearch] = useState(false)
  const [showEvaluationForm, setShowEvaluationForm] = useState(false)
  const [selectedSimptome, setSelectedSimptome] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [severitate, setSeveritate] = useState('medie')
  const [frecventa, setFrecventa] = useState('ocazional')
  const [observatii, setObservatii] = useState('')
  const [analiza, setAnaliza] = useState(null)
  const [evaluareContext, setEvaluareContext] = useState(null)
  const [selectedBodyZone, setSelectedBodyZone] = useState('abdomen')
  const [loadingAnaliza, setLoadingAnaliza] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [todayTaskPage, setTodayTaskPage] = useState(0)
  const [selectedTreatmentCalendarId, setSelectedTreatmentCalendarId] = useState(null)
  const [treatmentCalendarMonth, setTreatmentCalendarMonth] = useState(() => new Date())

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [animalId])

  useEffect(() => {
    const storedTab = sessionStorage.getItem(`petcare-open-tab-${animalId}`)
    const storedModal = sessionStorage.getItem(`petcare-open-modal-${animalId}`)
    const params = new URLSearchParams(location.search)
    const queryTab = params.get('tab')
    const queryModal = params.get('modal')
    const nextTab = storedTab || queryTab
    const nextModal = storedModal || queryModal

    if (nextTab && ['profile', 'health', 'treatments', 'history', 'medical'].includes(nextTab)) {
      setActiveTab(nextTab)
      sessionStorage.removeItem(`petcare-open-tab-${animalId}`)
    }

    if (nextModal === 'settings') {
      setShowSettings(true)
      sessionStorage.removeItem(`petcare-open-modal-${animalId}`)
    }

    if (nextModal === 'vet') {
      setShowVetSupport(true)
      sessionStorage.removeItem(`petcare-open-modal-${animalId}`)
    }

    if (nextModal === 'medical') {
      resetMedicalForm('vaccin')
      setShowMedicalForm(true)
      sessionStorage.removeItem(`petcare-open-modal-${animalId}`)
    }
  }, [animalId, location.search])

  const analysisResultRef = useRef(null)

  const [showTratamentForm, setShowTratamentForm] = useState(false)
  const [numeTratament, setNumeTratament] = useState('')
  const [durataAdministrare, setDurataAdministrare] = useState('')
  const [durataPauza, setDurataPauza] = useState('')
  const [dataStart, setDataStart] = useState('')
  const [observatiiTratament, setObservatiiTratament] = useState('')
  const [savingAdministrareId, setSavingAdministrareId] = useState(null)
  const [showArchivedTreatments, setShowArchivedTreatments] = useState(false)
  const treatmentArchiveKey = `petcare-archived-treatments-${animalId}`
  const [manualArchivedTreatmentIds, setManualArchivedTreatmentIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(treatmentArchiveKey) || '[]')
    } catch {
      return []
    }
  })
  const [showMedicalForm, setShowMedicalForm] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showVetSupport, setShowVetSupport] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [vetPhone, setVetPhone] = useState('')
  const [preferences, setPreferences] = useState({
    treatmentReminders: true,
    vaccineReminders: true,
    parasiteReminders: true
  })
  const [medicalRecords, setMedicalRecords] = useState([])
  const [medicalForm, setMedicalForm] = useState({
    type: 'vaccin',
    date: '',
    nextDate: '',
    product: '',
    category: '',
    diagnosis: '',
    details: ''
  })

  const [showDailyJournal, setShowDailyJournal] = useState(false)
  const [dailyJournalRecords, setDailyJournalRecords] = useState([])
  const [dailyJournalForm, setDailyJournalForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    appetite: 5,
    mobility: 5,
    notes: ''
  })
  const [showWeightTracker, setShowWeightTracker] = useState(false)
  const [weightForm, setWeightForm] = useState({
    date: formatDateForRomanianInput(),
    weight: '',
    notes: ''
  })
  const [showOwnerForm, setShowOwnerForm] = useState(false)
  const [ownerInfo, setOwnerInfo] = useState({
    name: '',
    phone: '',
    address: ''
  })
  const [ownerForm, setOwnerForm] = useState({
    name: '',
    phone: '',
    address: ''
  })

  const normalizeOwnerInfo = (value = {}) => ({
    name: String(value.name || value.nume || '').trim(),
    phone: String(value.phone || value.telefon || '').trim(),
    address: String(value.address || value.adresa || '').trim()
  })

  const mergeOwnerInfo = (...sources) => {
    const normalized = sources.map(normalizeOwnerInfo)
    return {
      name: normalized.map((item) => item.name).find(Boolean) || '',
      phone: normalized.map((item) => item.phone).find(Boolean) || '',
      address: normalized.map((item) => item.address).find(Boolean) || ''
    }
  }

  const persistOwnerInfoEverywhere = (nextOwnerInfo, notify = true) => {
    const owner = normalizeOwnerInfo(nextOwnerInfo)
    setOwnerInfo(owner)
    setOwnerForm(owner)
    localStorage.setItem('petcare-owner-profile', JSON.stringify(owner))
    localStorage.setItem(`petcare-owner-info-${animalId}`, JSON.stringify(owner))

    try {
      const storedUser = JSON.parse(localStorage.getItem('petcare_user') || '{}')
      const storedProfile = JSON.parse(localStorage.getItem(`petcare_user_profile_${userId}`) || '{}')
      const updatedUser = {
        ...storedUser,
        nume: owner.name || storedUser.nume || '',
        telefon: owner.phone,
        adresa: owner.address
      }
      const updatedProfile = {
        ...storedProfile,
        nume: owner.name || storedProfile.nume || '',
        telefon: owner.phone,
        adresa: owner.address
      }

      localStorage.setItem('petcare_user', JSON.stringify(updatedUser))
      localStorage.setItem(`petcare_user_profile_${userId}`, JSON.stringify(updatedProfile))
      Object.keys(localStorage)
        .filter((key) => key.startsWith('petcare-owner-info-'))
        .forEach((key) => localStorage.setItem(key, JSON.stringify(owner)))
      if (notify) {
        window.dispatchEvent(new CustomEvent('petcare-owner-profile-updated', { detail: owner }))
      }
    } catch {
      // ignoram erorile locale; datele curente raman in stare
    }

    return owner
  }

  const [showNotifications, setShowNotifications] = useState(false)

  const { data: animale, isLoading, error, refetch: refetchAnimale } = useQuery({
    queryKey: ['animale'],
    queryFn: async () => {
      const response = await axios.get('http://127.0.0.1:8000/animale')
      return response.data
    }
  })

  const { data: simptome } = useQuery({
    queryKey: ['simptome'],
    queryFn: async () => {
      const response = await axios.get('http://127.0.0.1:8000/simptome')
      return response.data
    }
  })

  const { data: rase = [] } = useQuery({
    queryKey: ['rase'],
    queryFn: async () => {
      const response = await axios.get('http://127.0.0.1:8000/rase')
      return response.data
    }
  })

  const animalPentruDetaliiRasa = (animale || []).find((item) => item.id === animalId)
  const rasaPentruDetalii = (rase || []).find(
    (rasa) =>
      String(rasa.specie || '').toLowerCase() === String(animalPentruDetaliiRasa?.specie || '').toLowerCase() &&
      String(rasa.nume || '').toLowerCase() === String(animalPentruDetaliiRasa?.rasa || '').toLowerCase()
  )

  const { data: breedDetailsFromApi } = useQuery({
    queryKey: ['rase-detalii', rasaPentruDetalii?.id],
    enabled: Boolean(rasaPentruDetalii?.id),
    queryFn: async () => {
      const response = await axios.get(`http://127.0.0.1:8000/rase-detalii/${rasaPentruDetalii.id}`)
      return response.data
    },
    retry: false
  })

  const { data: istoricSimptome, refetch: refetchIstoric } = useQuery({
    queryKey: ['istoric-simptome', animalId],
    queryFn: async () => {
      const response = await axios.get(
        `http://127.0.0.1:8000/istoric-simptome/${animalId}`
      )
      return response.data
    }
  })

  const { data: tratamente, refetch: refetchTratamente } = useQuery({
    queryKey: ['tratamente', animalId],
    queryFn: async () => {
      const response = await axios.get(
        `http://127.0.0.1:8000/tratamente/${animalId}`
      )
      return response.data
    }
  })

  const { data: weightHistory = [], refetch: refetchWeightHistory } = useQuery({
    queryKey: ['istoric-greutate', animalId],
    queryFn: async () => {
      const response = await axios.get(
        `http://127.0.0.1:8000/istoric-greutate/${animalId}`
      )
      return response.data
    }
  })

  const administrariQueries = useQueries({
    queries: (tratamente || []).map((tratament) => ({
      queryKey: ['administrari-tratamente', tratament.id],
      queryFn: async () => {
        const response = await axios.get(
          `http://127.0.0.1:8000/administrari-tratamente/${tratament.id}`
        )
        return response.data
      },
      enabled: Boolean(tratament.id)
    }))
  })

  const administrariPeTratament = (tratamente || []).reduce((acc, tratament, index) => {
    acc[tratament.id] = administrariQueries[index]?.data || []
    return acc
  }, {})

  const stripDiacritics = (text = '') => {
    return String(text ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
  }

  const normalizeText = (text = '') => {
    return stripDiacritics(text).toLowerCase()
  }

  const displayText = (text, fallback = 'De completat') => {
    const value = text === null || text === undefined || text === '' ? fallback : text

    return stripDiacritics(value)
  }

  const simptomeFiltrate = (simptome || [])
    .filter((simptom) =>
      normalizeText(simptom.nume_afisare).includes(normalizeText(searchTerm))
    )
    .sort((a, b) => {
      const search = normalizeText(searchTerm)
      const aName = normalizeText(a.nume_afisare)
      const bName = normalizeText(b.nume_afisare)

      const aStarts = aName.startsWith(search)
      const bStarts = bName.startsWith(search)

      if (aStarts && !bStarts) return -1
      if (!aStarts && bStarts) return 1

      return aName.localeCompare(bName)
    })

  const toggleSimptom = (simptomId) => {
    if (selectedSimptome.includes(simptomId)) {
      setSelectedSimptome(selectedSimptome.filter((item) => item !== simptomId))
    } else {
      setSelectedSimptome([...selectedSimptome, simptomId])
    }
  }

  const genereazaEvaluare = async () => {
    if (selectedSimptome.length === 0) {
      alert('Selecteaza cel putin un simptom.')
      return
    }

    const episodId = `episod-${animalId}-${Date.now()}`
    const contextEvaluare = {
      simptome: getSimptomeSelectateNume(),
      severitate,
      frecventa,
      observatii
    }

    try {
      setLoadingAnaliza(true)

      for (const simptomId of selectedSimptome) {
        await axios.post('http://127.0.0.1:8000/simptome-animale', {
          animal_id: animalId,
          simptom_id: simptomId,
          severitate,
          frecventa,
          observatii,
          episod_id: episodId
        })
      }

      const response = await axios.get(
        `http://127.0.0.1:8000/analiza-episod/${episodId}`
      )

      const rezultateEvaluare =
        response.data.length > 0
          ? response.data
          : [buildFallbackEvaluare(contextEvaluare)]

      setAnaliza(rezultateEvaluare)
      setEvaluareContext(contextEvaluare)
      setShowEvaluationForm(false)
      setSuccessMessage('Evaluarea este gata. Am pastrat simptomele in istoric.')
      refetchIstoric()

      setSelectedSimptome([])
      setSearchTerm('')
      setSeveritate('medie')
      setFrecventa('ocazional')
      setObservatii('')

      setTimeout(() => {
        setSuccessMessage('')
      }, 3000)

      setTimeout(() => {
        analysisResultRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        })
      }, 120)
    } catch (error) {
      console.error('Eroare la generarea evaluarii:', error)
      alert('A aparut o eroare la generarea evaluarii.')
    } finally {
      setLoadingAnaliza(false)
    }
  }

  const adaugaTratament = async () => {
    if (!numeTratament) {
      alert('Completeaza numele tratamentului.')
      return
    }

    try {
      await axios.post('http://127.0.0.1:8000/tratamente', {
        animal_id: animalId,
        nume: numeTratament,
        tip: 'ciclic',
        durata_administrare: Number(durataAdministrare),
        durata_pauza: Number(durataPauza),
        data_start: dateInputToIso(dataStart),
        observatii: observatiiTratament
      })

      refetchTratamente()

      resetTreatmentForm()
      setShowTratamentForm(false)
    } catch (error) {
      console.error('Eroare la salvarea tratamentului:', error)
      alert('Eroare la salvarea tratamentului.')
    }
  }

  const deschideFormTratament = () => {
    setShowArchivedTreatments(false)
    resetTreatmentForm()
    setShowTratamentForm(true)
  }

  useEffect(() => {
    if (activeTab !== 'health') {
      setShowEvaluationForm(false)
      setAnaliza(null)
      setEvaluareContext(null)
      setSuccessMessage('')
    }

    if (activeTab !== 'treatments') {
      resetTreatmentForm()
      setShowTratamentForm(false)
      setShowArchivedTreatments(false)
    }
  }, [activeTab])

  useEffect(() => {
    if (!showEvaluationForm && !showTratamentForm && !showMedicalForm && !showOwnerForm && !showSettings && !showVetSupport && !showDailyJournal && !showWeightTracker) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [showEvaluationForm, showTratamentForm, showMedicalForm, showOwnerForm, showSettings, showVetSupport, showDailyJournal, showWeightTracker])

  useEffect(() => {
    const savedRecords = localStorage.getItem(`petcare-medical-records-${animalId}`)
    setMedicalRecords(savedRecords ? JSON.parse(savedRecords) : [])
  }, [animalId])


  useEffect(() => {
    const savedDailyJournal = localStorage.getItem(`petcare-daily-journal-${animalId}`)
    setDailyJournalRecords(savedDailyJournal ? JSON.parse(savedDailyJournal) : [])

    const today = new Date().toISOString().slice(0, 10)
    setDailyJournalForm((current) => ({ ...current, date: today }))
  }, [animalId])

  useEffect(() => {
    setWeightForm((current) => ({
      ...current,
      date: formatDateForRomanianInput(),
      weight: '',
      notes: ''
    }))
  }, [animalId])

  useEffect(() => {
    const cleanText = (value) => String(value || '').trim()
    const firstFilled = (...values) => values.map(cleanText).find(Boolean) || ''

    let userProfile = {}
    let storedUser = {}
    let savedOwnerInfo = {}
    let globalOwnerInfo = {}
    let ownerInfoFromAllPets = {}

    try {
      userProfile = JSON.parse(localStorage.getItem(`petcare_user_profile_${userId}`) || '{}')
      storedUser = JSON.parse(localStorage.getItem('petcare_user') || '{}')
      savedOwnerInfo = JSON.parse(localStorage.getItem(`petcare-owner-info-${animalId}`) || '{}')
      globalOwnerInfo = JSON.parse(localStorage.getItem('petcare-owner-profile') || '{}')

      Object.keys(localStorage)
        .filter((key) => key.startsWith('petcare-owner-info-'))
        .forEach((key) => {
          try {
            const value = JSON.parse(localStorage.getItem(key) || '{}')
            ownerInfoFromAllPets = {
              name: ownerInfoFromAllPets.name || value.name || '',
              phone: ownerInfoFromAllPets.phone || value.phone || '',
              address: ownerInfoFromAllPets.address || value.address || ''
            }
          } catch {
            // ignoram intrarile locale corupte
          }
        })
    } catch {
      userProfile = {}
      storedUser = {}
      savedOwnerInfo = {}
      globalOwnerInfo = {}
      ownerInfoFromAllPets = {}
    }

    const nextOwnerInfo = {
      name: firstFilled(userProfile.nume, storedUser.nume, globalOwnerInfo.name, savedOwnerInfo.name, ownerInfoFromAllPets.name),
      phone: firstFilled(userProfile.telefon, storedUser.telefon, globalOwnerInfo.phone, savedOwnerInfo.phone, ownerInfoFromAllPets.phone),
      address: firstFilled(userProfile.adresa, storedUser.adresa, globalOwnerInfo.address, savedOwnerInfo.address, ownerInfoFromAllPets.address)
    }

    setOwnerInfo(nextOwnerInfo)
    setOwnerForm(nextOwnerInfo)
    localStorage.setItem('petcare-owner-profile', JSON.stringify(nextOwnerInfo))
    localStorage.setItem(`petcare-owner-info-${animalId}`, JSON.stringify(nextOwnerInfo))
    localStorage.setItem(`petcare_user_profile_${userId}`, JSON.stringify({
      ...userProfile,
      nume: nextOwnerInfo.name,
      telefon: nextOwnerInfo.phone,
      adresa: nextOwnerInfo.address
    }))
    localStorage.setItem('petcare_user', JSON.stringify({
      ...storedUser,
      nume: nextOwnerInfo.name || storedUser.nume,
      telefon: nextOwnerInfo.phone,
      adresa: nextOwnerInfo.address
    }))
  }, [animalId, userId])

  useEffect(() => {
    let cancelled = false

    const readJson = (key) => {
      try {
        return JSON.parse(localStorage.getItem(key) || '{}')
      } catch {
        return {}
      }
    }

    const firstFilled = (...values) =>
      values.map((value) => String(value || '').trim()).find(Boolean) || ''

    const collectOwnerInfo = async () => {
      const effectiveUserId = getEffectiveUserId()
      const localProfile = readJson(`petcare_user_profile_${effectiveUserId || userId}`)
      const storedUser = readJson('petcare_user')
      const globalOwner = readJson('petcare-owner-profile')
      const petOwner = readJson(`petcare-owner-info-${animalId}`)
      let remoteUser = {}
      let loadedFromDatabase = false

      if (effectiveUserId) {
        try {
          const response = await axios.get(`http://127.0.0.1:8000/utilizator/${effectiveUserId}`)
          remoteUser = response.data || {}
          loadedFromDatabase = true
        } catch (error) {
          console.error('Nu am putut incarca proprietarul din baza de date.', error)
          remoteUser = {}
        }
      }

      if (cancelled) return

      const merged = loadedFromDatabase
        ? {
            name: firstFilled(remoteUser.nume),
            phone: firstFilled(remoteUser.telefon),
            address: firstFilled(remoteUser.adresa)
          }
        : {
            name: firstFilled(localProfile.nume, storedUser.nume, globalOwner.name, petOwner.name),
            phone: firstFilled(localProfile.telefon, storedUser.telefon, globalOwner.phone, petOwner.phone),
            address: firstFilled(localProfile.adresa, storedUser.adresa, globalOwner.address, petOwner.address)
          }

      persistOwnerInfoEverywhere(merged)
    }

    const handleOwnerUpdate = (event) => {
      const detail = normalizeOwnerInfo(event.detail || {})
      persistOwnerInfoEverywhere(detail, false)
    }

    collectOwnerInfo()
    window.addEventListener('petcare-owner-profile-updated', handleOwnerUpdate)

    return () => {
      cancelled = true
      window.removeEventListener('petcare-owner-profile-updated', handleOwnerUpdate)
    }
  }, [animalId, userId])

  useEffect(() => {
    const savedPreferences = localStorage.getItem(`petcare-preferences-${animalId}`)
    let globalVetInfo = {}

    try {
      globalVetInfo = JSON.parse(localStorage.getItem('petcare_vet_info') || '{}')
    } catch {
      globalVetInfo = {}
    }

    if (savedPreferences) {
      setPreferences(JSON.parse(savedPreferences))
    }

    setVetPhone(globalVetInfo.telefon || localStorage.getItem(`petcare-vet-phone-${animalId}`) || '')
  }, [animalId])

  const savePreferences = () => {
    const cleanVetPhone = vetPhone.trim()
    localStorage.setItem(`petcare-preferences-${animalId}`, JSON.stringify(preferences))
    localStorage.setItem(`petcare-vet-phone-${animalId}`, cleanVetPhone)

    try {
      const currentVetInfo = JSON.parse(localStorage.getItem('petcare_vet_info') || '{}')
      localStorage.setItem('petcare_vet_info', JSON.stringify({
        ...currentVetInfo,
        telefon: cleanVetPhone
      }))
    } catch {
      localStorage.setItem('petcare_vet_info', JSON.stringify({ telefon: cleanVetPhone }))
    }

    setShowSettings(false)
    showToast('Setarile profilului au fost salvate.')
  }

  const showToast = (message) => {
    setToastMessage(message)
    setTimeout(() => setToastMessage(''), 2800)
  }

  const closeModalAndReturnIfNeeded = () => {
    const returnPath = sessionStorage.getItem(`petcare-return-after-modal-${animalId}`)
    if (returnPath) {
      sessionStorage.removeItem(`petcare-return-after-modal-${animalId}`)
      navigate(returnPath)
    }
  }

  const openVetVisitForm = () => {
    setShowVetSupport(false)
    setActiveTab('medical')
    openMedicalRecordForm('control')
  }

  const updateMedicalForm = (field, value) => {
    setMedicalForm((current) => {
      const next = { ...current, [field]: value }

      if (field === 'type') {
        next.category = ''
        next.product = ''
        next.diagnosis = ''
        next.details = ''
      }

      if (['type', 'date', 'category'].includes(field)) {
        next.nextDate = getRecommendedNextMedicalDate(next)
      }

      return next
    })
  }

  const resetMedicalForm = (type = 'vaccin') => {
    setMedicalForm({
      type,
      date: '',
      nextDate: '',
      product: '',
      category: '',
      diagnosis: '',
      details: ''
    })
  }

  const openMedicalRecordForm = (type = 'vaccin') => {
    resetMedicalForm(type)
    setShowMedicalForm(true)
  }

  const closeMedicalRecordForm = () => {
    resetMedicalForm(medicalForm.type || 'vaccin')
    setShowMedicalForm(false)
    closeModalAndReturnIfNeeded()
  }

  const formatMedicalDateInput = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 8)
    const day = digits.slice(0, 2)
    const month = digits.slice(2, 4)
    const year = digits.slice(4, 8)

    return [day, month, year].filter(Boolean).join('/')
  }

  const dateInputToIso = (value) => {
    if (!value) return ''

    if (/^\d{2}[\/.]\d{2}[\/.]\d{4}$/.test(String(value))) {
      const [day, month, year] = String(value).replace(/\./g, '/').split('/')
      return `${year}-${month}-${day}`
    }

    return value
  }

  const resetTreatmentForm = () => {
    setNumeTratament('')
    setDurataAdministrare('')
    setDurataPauza('')
    setDataStart('')
    setObservatiiTratament('')
  }

  const closeTreatmentForm = () => {
    resetTreatmentForm()
    setShowTratamentForm(false)
  }

  const escapeHtml = (value) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')

  const generateHistoryPdfReport = (event) => {
    event?.preventDefault?.()
    event?.stopPropagation?.()

    const severityText = (value) => {
      const normalized = String(value || '').toLowerCase()
      if (normalized === 'usoara' || normalized === 'ușoară') return 'Usoara'
      if (normalized === 'medie') return 'Medie'
      if (normalized === 'ridicata' || normalized === 'ridicată') return 'Ridicata'
      if (normalized === 'severa' || normalized === 'severă') return 'Severa'
      return value || '-'
    }

    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    })

    const animalName = animal?.nume || 'Animal'
    const pdfAnimalName = stripDiacritics(animalName)
    const currentDate = new Date().toLocaleDateString('ro-RO')
    const safeAnimalName = String(animalName)
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^\w\-ăâîșțĂÂÎȘȚ]/g, '')
    const reportFileName = `Istoric_simptome_${safeAnimalName || 'animal'}_${currentDate.replace(/\./g, '-')}.pdf`

    doc.setTextColor(55, 48, 163)
    doc.setFontSize(22)
    doc.text(stripDiacritics('Istoric simptome PetCare'), 14, 18)

    doc.setTextColor(71, 85, 105)
    doc.setFontSize(11)
    doc.text(`Animal: ${pdfAnimalName}`, 14, 28)
    doc.text(`Total raportari: ${(istoricSimptome || []).length}`, 14, 35)
    doc.text(`Data generarii: ${currentDate}`, 14, 42)

    autoTable(doc, {
      startY: 52,
      head: [[
        stripDiacritics('Simptom'),
        stripDiacritics('Severitate'),
        stripDiacritics('Frecventa'),
        stripDiacritics('Observatii'),
        stripDiacritics('Data')
      ]],
      body: (istoricSimptome || []).length
        ? (istoricSimptome || []).map((item) => [
            stripDiacritics(item.simptom || '-'),
            stripDiacritics(severityText(item.severitate)),
            stripDiacritics(item.frecventa || '-'),
            stripDiacritics(item.observatii || '-'),
            formatDate(item.data_raportare)
          ])
        : [[stripDiacritics('Nu exista simptome raportate.'), '-', '-', '-', '-']],
      styles: {
        font: 'helvetica',
        fontSize: 9.5,
        cellPadding: 4,
        textColor: [17, 24, 39],
        lineColor: [219, 228, 240],
        lineWidth: 0.2,
        overflow: 'linebreak',
        valign: 'top'
      },
      headStyles: {
        fillColor: [243, 240, 255],
        textColor: [55, 48, 163],
        fontStyle: 'bold'
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      columnStyles: {
        0: { cellWidth: 52 },
        1: { cellWidth: 32 },
        2: { cellWidth: 32 },
        3: { cellWidth: 98 },
        4: { cellWidth: 30 }
      },
      margin: { left: 14, right: 14 }
    })

    const pageHeight = doc.internal.pageSize.height
    doc.setFontSize(9)
    doc.setTextColor(100, 116, 139)
    doc.text(stripDiacritics('Raport generat automat din aplicatia PetCare.'), 14, pageHeight - 10)

    doc.save(reportFileName)
  }

  const saveMedicalRecord = () => {
    const formToSave = {
      ...medicalForm,
      nextDate: getRecommendedNextMedicalDate(medicalForm) || medicalForm.nextDate
    }

    const hasContent = Object.entries(formToSave).some(
      ([field, value]) => field !== 'type' && String(value).trim()
    )

    if (!hasContent) {
      alert('Completeaza cel putin o informatie utila pentru inregistrare.')
      return
    }

    if (formToSave.type === 'deparazitare' && !formToSave.category) {
      alert('Alege tipul deparazitarii: interna sau externa.')
      return
    }

    const nextRecords = [
      ...medicalRecords,
      {
        id: `${formToSave.type}-${Date.now()}`,
        ...formToSave
      }
    ]

    setMedicalRecords(nextRecords)
    localStorage.setItem(`petcare-medical-records-${animalId}`, JSON.stringify(nextRecords))
    resetMedicalForm(medicalForm.type)
    setShowMedicalForm(false)
    closeModalAndReturnIfNeeded()
    showToast('Inregistrarea a fost adaugata in carnetul de sanatate.')
  }


  const saveDailyJournal = () => {
    const nextEntry = {
      id: `journal-${animalId}-${dailyJournalForm.date}`,
      animal_id: animalId,
      date: dailyJournalForm.date,
      appetite: Number(dailyJournalForm.appetite),
      mobility: Number(dailyJournalForm.mobility),
      notes: dailyJournalForm.notes.trim()
    }

    const nextRecords = [
      ...dailyJournalRecords.filter((entry) => entry.date !== nextEntry.date),
      nextEntry
    ].sort((a, b) => new Date(b.date) - new Date(a.date))

    setDailyJournalRecords(nextRecords)
    localStorage.setItem(`petcare-daily-journal-${animalId}`, JSON.stringify(nextRecords))
    setShowDailyJournal(false)
    showToast('Jurnalul zilnic a fost salvat.')
  }

  const saveWeightEntry = async () => {
    const numericWeight = Number(String(weightForm.weight).replace(',', '.'))

    if (!Number.isFinite(numericWeight) || numericWeight <= 0) {
      showToast('Completeaza o greutate valida.')
      return
    }

    try {
      await axios.post('http://127.0.0.1:8000/istoric-greutate', {
        animal_id: animalId,
        greutate: numericWeight,
        data_inregistrare: dateInputToIso(weightForm.date) || new Date().toISOString().slice(0, 10),
        observatii: weightForm.notes.trim() || null
      })

      await refetchWeightHistory()
      await refetchAnimale()
      setWeightForm({
        date: formatDateForRomanianInput(),
        weight: '',
        notes: ''
      })
      setShowWeightTracker(false)
      showToast('Greutatea a fost salvata.')
    } catch (error) {
      console.error(error)
      showToast('Nu am putut salva greutatea.')
    }
  }

  const saveOwnerInfo = async () => {
    const effectiveUserId = getEffectiveUserId()
    const cleanOwner = {
      name: ownerForm.name.trim() || ownerInfo.name || 'Utilizator',
      phone: ownerForm.phone.trim(),
      address: ownerForm.address.trim()
    }

    if (!effectiveUserId) {
      showToast('Nu am putut identifica utilizatorul autentificat.')
      return
    }

    try {
      let storedUser = {}
      try {
        storedUser = JSON.parse(localStorage.getItem('petcare_user') || '{}')
      } catch {
        storedUser = {}
      }

      const response = await axios.put(`http://127.0.0.1:8000/utilizator/${effectiveUserId}`, {
        nume: cleanOwner.name,
        telefon: cleanOwner.phone || null,
        adresa: cleanOwner.address || null,
        fotografie_url: storedUser.fotografie_url || null
      })

      const updatedUser = response.data || {}
      const nextOwnerInfo = {
        name: updatedUser.nume || cleanOwner.name,
        phone: updatedUser.telefon || '',
        address: updatedUser.adresa || ''
      }

      persistOwnerInfoEverywhere(nextOwnerInfo)
      localStorage.setItem('petcare_user_id', String(effectiveUserId))
      localStorage.setItem('petcare_user', JSON.stringify({ ...storedUser, ...updatedUser }))
      setShowOwnerForm(false)
      showToast('Datele proprietarului au fost salvate.')
    } catch (error) {
      console.error('Nu am putut salva datele proprietarului in baza de date.', error)
      showToast(error.response?.data?.detail || 'Nu am putut salva datele proprietarului.')
    }
  }

  const getDailyJournalToday = () => {
    const today = new Date().toISOString().slice(0, 10)
    return dailyJournalRecords.find((entry) => entry.date === today)
  }

  const getDailyJournalChart = () => {
    const today = new Date()

    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today)
      date.setDate(today.getDate() - (6 - index))
      const dateKey = date.toISOString().slice(0, 10)
      const entry = dailyJournalRecords.find((item) => item.date === dateKey)

      return {
        date: dateKey,
        label: date.toLocaleDateString('ro-RO', { weekday: 'short' }),
        appetite: entry?.appetite || 0,
        mobility: entry?.mobility || 0,
        hasEntry: Boolean(entry)
      }
    })
  }


  const formatJournalDisplayDate = (dateValue) => {
    const date = dateValue ? new Date(`${dateValue}T12:00:00`) : new Date()

    return date.toLocaleDateString('ro-RO', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    })
  }

  const formatCompactDate = (dateValue) => {
    const date = dateValue ? new Date(`${dateValue}T12:00:00`) : null

    if (!date || Number.isNaN(date.getTime())) return 'De completat'

    return date.toLocaleDateString('ro-RO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  }

  const formatWeightValue = (value) => {
    if (value === null || value === undefined || value === '') return 'De completat'

    const numericValue = Number(value)

    if (!Number.isFinite(numericValue)) return 'De completat'

    return `${numericValue.toLocaleString('ro-RO', { maximumFractionDigits: 2 })} kg`
  }

  const getWeightChartData = () => {
    const source = [...(weightHistory || [])]
      .sort((a, b) => new Date(a.data_inregistrare) - new Date(b.data_inregistrare))
      .slice(-6)

    return source.map((entry) => ({
      ...entry,
      value: Number(entry.greutate) || 0,
      label: formatCompactDate(entry.data_inregistrare)
    }))
  }

  const getWeightReminderText = () => {
    if (!weightHistory?.length) {
      return 'Adauga prima greutate pentru a urmari evolutia in timp.'
    }

    const latest = [...weightHistory].sort(
      (a, b) => new Date(b.data_inregistrare) - new Date(a.data_inregistrare)
    )[0]

    const days = daysBetweenToday(latest.data_inregistrare)

    if (days !== null && days >= 365) {
      return 'A trecut peste un an de la ultima actualizare.'
    }

    return `Ultima actualizare: ${formatCompactDate(latest.data_inregistrare)}.`
  }

  const updateDailyJournalScore = (field, value) => {
    setDailyJournalForm((current) => ({
      ...current,
      [field]: Number(value)
    }))
  }

  const getSimptomeSelectateNume = () => {
    return selectedSimptome
      .map((simptomId) => (simptome || []).find((simptom) => simptom.id === simptomId))
      .filter(Boolean)
      .map((simptom) => simptom.nume_afisare)
  }

  const getNivelPotrivire = (scor) => {
    const scorNumeric = Number(scor) || 0

    if (scorNumeric >= 8) return 'ridicata'
    if (scorNumeric >= 4) return 'medie'

    return 'scazuta'
  }

  const getNormalizedSimptomeText = (context = evaluareContext) => {
    return (context.simptome || [])
      .join(', ')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
  }

  const buildFallbackEvaluare = (contextEvaluare) => {
    const simptomeText = getNormalizedSimptomeText(contextEvaluare)
    const primulSimptom = contextEvaluare.simptome?.[0] || 'Simptom raportat'

    if (simptomeText.includes('constipatie')) {
      return {
        afectiune_id: `fallback-constipatie-${Date.now()}`,
        afectiune: 'Disconfort digestiv',
        descriere:
          'Constipatia poate aparea dupa schimbari de alimentatie, hidratare insuficienta, miscare redusa sau stres.',
        recomandare:
          'Urmareste scaunul, apetitul si consumul de apa. Cere sfatul medicului veterinar daca problema persista sau apar dureri.',
        nivel_risc: 'mediu',
        scor_total: 5,
        isFallback: true
      }
    }

    if (simptomeText.includes('apetit excesiv')) {
      return {
        afectiune_id: `fallback-apetit-${Date.now()}`,
        afectiune: 'Schimbare de apetit',
        descriere:
          'Apetitul crescut poate fi un episod izolat, dar merita urmarit impreuna cu greutatea, setea si nivelul de energie.',
        recomandare:
          'Noteaza daca cere mancare mai des, daca bea mai multa apa sau daca apar schimbari de greutate ori comportament.',
        nivel_risc: 'mediu',
        scor_total: 5,
        isFallback: true
      }
    }

    return {
      afectiune_id: `fallback-general-${Date.now()}`,
      afectiune: `Monitorizare pentru ${primulSimptom}`,
      descriere:
        'Simptomul raportat merita urmarit in contextul rutinei zilnice, al apetitului, energiei si comportamentului general.',
      recomandare:
        'Noteaza daca se repeta in urmatoarele 24-48h si daca apar simptome asociate.',
      nivel_risc: 'scazut',
      scor_total: 3,
      isFallback: true
    }
  }

  const getExplicatieEvaluare = (rezultat) => {
    const simptomeText = getNormalizedSimptomeText()

    if (simptomeText.includes('apetit excesiv')) {
      return 'Apetitul crescut poate aparea dupa schimbari alimentare, portii nepotrivite, stres sau dezechilibre care merita urmarite in timp. Monitorizeaza apetitul impreuna cu greutatea, setea si nivelul de energie.'
    }

    if (simptomeText.includes('constipatie')) {
      return 'Constipatia poate avea legatura cu o schimbare de hrana, hidratare insuficienta, miscare redusa sau disconfort digestiv. Este util sa urmaresti daca episodul este izolat sau se repeta.'
    }

    if (rezultat.isFallback) {
      return rezultat.descriere
    }

    return `Aceasta interpretare apare deoarece simptomele raportate se regasesc in tiparul asociat cu ${rezultat.afectiune}. Priveste rezultatul ca pe un indiciu de monitorizare, nu ca pe un diagnostic.`
  }

  const getRecomandareEvaluare = (rezultat) => {
    const simptomeText = getNormalizedSimptomeText()

    if (simptomeText.includes('apetit excesiv')) {
      return 'Noteaza daca apetitul crescut continua, daca apare sete excesiva, modificare de greutate, apatie sau schimbari de comportament. Daca persista, discuta cu medicul veterinar.'
    }

    if (simptomeText.includes('constipatie')) {
      return 'Urmareste scaunul, consumul de apa, apetitul si nivelul de energie. Daca problema persista sau apar dureri, abdomen umflat ori refuzul hranei, cere sfatul medicului veterinar.'
    }

    return rezultat.recomandare
  }

  const getEvaluareSectiuni = (rezultat) => {
    const simptomeText = getNormalizedSimptomeText()

    if (simptomeText.includes('apetit excesiv')) {
      return {
        meaning:
          'Apetitul crescut poate fi un episod izolat, dar poate avea legatura si cu o schimbare de hrana, portii nepotrivite, stres, activitate crescuta sau un dezechilibru care merita urmarit.',
        home:
          'Urmareste daca cere mancare neobisnuit de des, daca bea mai multa apa, daca greutatea se schimba si daca este mai agitata sau mai apatica decat de obicei.',
        warning:
          'Devine mai important de discutat cu medicul veterinar daca apetitul crescut persista mai multe zile sau apare impreuna cu sete excesiva, scadere/crestere in greutate, varsaturi, diaree sau apatie.',
        recommendation:
          'Noteaza evolutia pentru urmatoarele 24-48h si verifica daca a existat o schimbare recenta de hrana, recompense sau rutina.'
      }
    }

    if (simptomeText.includes('constipatie')) {
      return {
        meaning:
          'Poate indica o schimbare de alimentatie, hidratare insuficienta, lipsa de miscare, stres sau un disconfort digestiv usor care merita urmarit.',
        home:
          'Urmareste frecventa scaunului, efortul la litiera sau la plimbare, apetitul, consumul de apa, energia si daca abdomenul pare sensibil.',
        warning:
          'Devine ingrijorator daca persista, daca animalul refuza mancarea, pare dureros, are abdomen umflat, vomita sau este vizibil apatic.',
        recommendation:
          'Noteaza evolutia pentru urmatoarele 24-48h, verifica schimbarile recente de hrana si cere sfatul medicului veterinar daca nu se amelioreaza.'
      }
    }

    return {
      meaning: getExplicatieEvaluare(rezultat),
      home:
        'Urmareste daca simptomul se repeta, daca se intensifica sau daca apare in anumite momente ale zilei.',
      warning:
        'Daca simptomele persista, devin severe sau apar impreuna cu apatie, lipsa apetitului ori dificultati de respiratie, este recomandat consult veterinar.',
      recommendation: getRecomandareEvaluare(rezultat)
    }
  }

  const incepeEvaluareNoua = () => {
    setAnaliza(null)
    setEvaluareContext(null)
    setSuccessMessage('')
    setShowEvaluationForm(true)
  }


  const salveazaAdministrareTratament = async (tratamentId, dataAdministrare) => {
    const tratament = (tratamente || []).find((item) => item.id === tratamentId)
    const effectiveDate = dataAdministrare || getDateKey(new Date())
    const administrari = administrariPeTratament[tratamentId] || []

    if (!tratament || manualArchivedTreatmentIds.includes(tratamentId)) {
      return
    }

    const dayStatus = getTreatmentDayStatus(tratament, effectiveDate, administrari)

    if (dayStatus?.className !== 'scheduled' || effectiveDate > todayKey) {
      return
    }

    if (administrari.some((administrare) => getDateKey(administrare.data_administrare) === effectiveDate)) {
      return
    }

    try {
      setSavingAdministrareId(tratamentId)

      await axios.post(
        'http://127.0.0.1:8000/administrari-tratamente',
        {
          tratament_id: tratamentId,
          data_administrare: effectiveDate
        }
      )

      const queryIndex = (tratamente || []).findIndex(
        (tratament) => tratament.id === tratamentId
      )

      await administrariQueries[queryIndex]?.refetch()
      showToast('Administrarea a fost marcata.')
    } catch (error) {
      console.error('Eroare la salvarea administrarii:', error)
      alert('Eroare la salvarea administrarii tratamentului.')
    } finally {
      setSavingAdministrareId(null)
    }
  }

  const normalizeDate = (value) => {
    if (!value) return null

    if (value instanceof Date) {
      return new Date(value.getFullYear(), value.getMonth(), value.getDate())
    }

    const stringValue = String(value)

    if (/^\d{4}-\d{2}-\d{2}/.test(stringValue)) {
      const [year, month, day] = stringValue.slice(0, 10).split('-').map(Number)
      return new Date(year, month - 1, day)
    }

    if (/^\d{2}\/\d{2}\/\d{4}$/.test(stringValue)) {
      const [day, month, year] = stringValue.split('/').map(Number)
      return new Date(year, month - 1, day)
    }

    const dateValue = new Date(value)
    if (Number.isNaN(dateValue.getTime())) return null

    return new Date(dateValue.getFullYear(), dateValue.getMonth(), dateValue.getDate())
  }

  const esteAzi = (value) => {
    const dateValue = normalizeDate(value)
    const today = normalizeDate(new Date())

    return Boolean(dateValue && today && dateValue.getTime() === today.getTime())
  }

  const formatDate = (value) => {
    if (!value) return 'Nu exista inca'

    if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return value

    return new Date(value).toLocaleDateString('ro-RO')
  }

  const getMedicalRecordDate = (value) => {
    if (!value) return new Date(0)

    if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
      const [day, month, year] = value.split('/')
      return new Date(`${year}-${month}-${day}`)
    }

    return new Date(value)
  }

  const getMedicalRecords = (type) => {
    return medicalRecords
      .filter((record) => record.type === type)
      .sort((a, b) => getMedicalRecordDate(b.date) - getMedicalRecordDate(a.date))
  }

  const normalizeMedicalText = (value = '') =>
    String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')

  const addOneYearToMedicalDate = (value) => {
    const date = parsePetCareDate(value)
    if (!date) return ''
    const next = new Date(date)
    next.setFullYear(next.getFullYear() + 1)
    return next.toLocaleDateString('ro-RO')
  }

  const getLatestMedicalRecord = (type, categoryMatch = '') => {
    const normalizedCategory = normalizeMedicalText(categoryMatch)

    return getMedicalRecords(type).find((record) => {
      if (!normalizedCategory) return true
      return normalizeMedicalText(`${record.category || ''} ${record.product || ''}`).includes(normalizedCategory)
    })
  }

  const getNextMedicalDate = (record) => {
    if (!record) return ''
    if (record.nextDate) return formatDate(record.nextDate)

    const recommendedDate = getRecommendedNextMedicalDate(record)
    if (recommendedDate) return recommendedDate

    return addOneYearToMedicalDate(record.date)
  }

  const getMedicalRecordSummary = (record) => {
    if (record.type === 'vaccin') {
      return [
        `Ultimul vaccin: ${record.date ? formatDate(record.date) : 'Data nespecificata'}`,
        record.product ? `Tip: ${record.product}` : null,
        record.nextDate ? `Urmatorul vaccin: ${formatDate(record.nextDate)}` : 'Urmatoarea data: de completat'
      ].filter(Boolean).join(' · ')
    }

    if (record.type === 'deparazitare') {
      return [
        `Ultima deparazitare: ${record.date ? formatDate(record.date) : 'Data nespecificata'}`,
        record.category,
        record.product,
        record.nextDate ? `Urmatoarea deparazitare: ${formatDate(record.nextDate)}` : 'Urmatoarea data: de completat'
      ].filter(Boolean).join(' · ')
    }

    return [
      record.date ? formatDate(record.date) : 'Data nespecificata',
      record.category,
      record.product,
      record.diagnosis,
      record.details,
      record.nextDate ? `Urmatoarea data: ${formatDate(record.nextDate)}` : null
    ]
      .filter(Boolean)
      .join(' · ')
  }

  const getMedicalRecordRows = (records) =>
    records.map((record) => (
      <div key={record.id} className="medical-detail-row">
        <strong>{record.date ? formatDate(record.date) : 'Data nespecificata'}</strong>
        <span>{[record.category, record.product, record.diagnosis, record.details].filter(Boolean).join(' · ') || 'Fara detalii suplimentare'}</span>
        {record.nextDate ? <em>Urmatoarea data: {formatDate(record.nextDate)}</em> : null}
      </div>
    ))

  const getDateKey = (value) => {
    const dateValue = normalizeDate(value)
    if (!dateValue) return ''

    const year = dateValue.getFullYear()
    const month = String(dateValue.getMonth() + 1).padStart(2, '0')
    const day = String(dateValue.getDate()).padStart(2, '0')

    return `${year}-${month}-${day}`
  }

  const getCalendarDays = () => {
    const today = new Date()
    const weekDayLabels = ['DUM', 'LUN', 'MAR', 'MIE', 'JOI', 'VIN', 'SAM']

    return Array.from({ length: 7 }, (_, index) => {
      const dateValue = new Date(today)
      dateValue.setDate(today.getDate() + index - 3)

      return {
        key: getDateKey(dateValue),
        label: weekDayLabels[dateValue.getDay()],
        day: dateValue.getDate()
      }
    })
  }

  const calculeazaZileRamaseAfisate = (info, administratAzi) => {
    if (!info) return null

    if (info.status === 'Administrare' && administratAzi) {
      return Math.max(info.zileRamase - 1, 0)
    }

    return info.zileRamase
  }

  const esteReluareTratament = (tratament, info) => {
    if (!info || info.status !== 'Administrare' || info.ziCurenta !== 1) {
      return false
    }

    const start = normalizeDate(tratament.data_start)
    const today = normalizeDate(new Date())
    const durataOn = Number(tratament.durata_administrare) || 0
    const durataOff = Number(tratament.durata_pauza) || 0
    const ciclu = durataOn + durataOff

    if (!start || ciclu === 0 || durataOff === 0) return false

    const diffDays = Math.floor((today - start) / (1000 * 60 * 60 * 24))

    return diffDays >= ciclu
  }

  const getTratamentAlerts = (tratament, info, administratAzi) => {
    const alerts = []

    if (!info) {
      return alerts
    }

    if (info.status === 'Administrare' && !administratAzi) {
      alerts.push({
        type: 'warning',
        title: 'Administrare de verificat',
        text: `${tratament.nume} nu este marcat ca administrat astazi. Daca i-ai dat deja doza, o poti bifa in calendar.`
      })
    }

    if (esteReluareTratament(tratament, info)) {
      alerts.push({
        type: 'urgent',
        title: 'Tratamentul trebuie reluat',
        text: `Pauza pentru ${tratament.nume} s-a incheiat. Verifica daca trebuie reluata administrarea.`
      })
    }

    return alerts
  }

  const esteTratamentFinalizat = (tratament) => {
    if (!tratament.data_start) return false

    const start = normalizeDate(tratament.data_start)
    const today = normalizeDate(new Date())
    const durataOn = Number(tratament.durata_administrare) || 0
    const durataOff = Number(tratament.durata_pauza) || 0

    if (!start || durataOn === 0 || durataOff > 0) return false

    const diffDays = Math.floor((today - start) / (1000 * 60 * 60 * 24))

    return diffDays >= durataOn
  }

  const getTratamentStare = (tratament, info) => {
    if (esteTratamentArhivat(tratament)) {
      return {
        label: 'Finalizat',
        className: 'finished'
      }
    }

    if (esteTratamentFinalizat(tratament)) {
      return {
        label: 'De completat',
        className: 'pending'
      }
    }

    if (!info) {
      return {
        label: 'In pregatire',
        className: 'archived'
      }
    }

    if (info.status === 'Pauza') {
      return {
        label: 'In pauza',
        className: 'paused'
      }
    }

    if (info.status === 'Administrare') {
      return {
        label: 'Activ',
        className: 'active'
      }
    }

    return {
      label: 'Arhivat',
      className: 'archived'
    }
  }

  const calculeazaStatusTratament = (tratament) => {
    if (!tratament.data_start) return null

    const start = normalizeDate(tratament.data_start)
    const today = normalizeDate(new Date())

    if (!start || !today) return null

    const diffDays = Math.floor((today - start) / (1000 * 60 * 60 * 24))

    const durataOn = Number(tratament.durata_administrare) || 0
    const durataOff = Number(tratament.durata_pauza) || 0
    const ciclu = durataOn + durataOff

    if (ciclu === 0 || diffDays < 0) return null

    if (durataOff === 0 && diffDays >= durataOn) {
      return {
        status: 'Finalizat',
        zileRamase: 0,
        ziCurenta: durataOn,
        durataEtapa: durataOn
      }
    }

    const ziCurenta = diffDays % ciclu

    if (ziCurenta < durataOn) {
      return {
        status: 'Administrare',
        zileRamase: durataOn - ziCurenta,
        ziCurenta: ziCurenta + 1,
        durataEtapa: durataOn
      }
    }

    return {
      status: 'Pauza',
      zileRamase: ciclu - ziCurenta,
      ziCurenta: ziCurenta - durataOn + 1,
      durataEtapa: durataOff
    }
  }

  const openTreatmentMonthCalendar = (tratament) => {
    const start = normalizeDate(tratament?.data_start)
    setSelectedTreatmentCalendarId(tratament.id)
    setTreatmentCalendarMonth(start || new Date())
  }

  const closeTreatmentMonthCalendar = () => {
    setSelectedTreatmentCalendarId(null)
  }

  const changeTreatmentCalendarMonth = (direction) => {
    setTreatmentCalendarMonth((current) => {
      const next = new Date(current)
      next.setMonth(next.getMonth() + direction)
      return next
    })
  }

  const getTreatmentCalendarMonthDays = (monthDate) => {
    const visibleMonth = normalizeDate(monthDate) || normalizeDate(new Date())
    const year = visibleMonth.getFullYear()
    const month = visibleMonth.getMonth()
    const firstDay = new Date(year, month, 1)
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const leadingEmptyDays = firstDay.getDay()

    return [
      ...Array.from({ length: leadingEmptyDays }, (_, index) => ({
        key: `empty-${year}-${month}-${index}`,
        day: '',
        isCurrentMonth: false,
        isEmpty: true
      })),
      ...Array.from({ length: daysInMonth }, (_, index) => {
        const dateValue = new Date(year, month, index + 1)

        return {
          date: dateValue,
          key: getDateKey(dateValue),
          day: dateValue.getDate(),
          isCurrentMonth: true,
          isEmpty: false
        }
      })
    ]
  }

  const getTreatmentDayStatus = (tratament, dayKey, administrari = []) => {
    const start = normalizeDate(tratament?.data_start)
    const dayDate = normalizeDate(dayKey)
    const durataOn = Number(tratament?.durata_administrare) || 0
    const durataOff = Number(tratament?.durata_pauza) || 0
    const ciclu = durataOn + durataOff
    const wasAdministered = administrari.some((administrare) => getDateKey(administrare.data_administrare) === dayKey)

    if (wasAdministered) {
      return {
        className: 'administered',
        label: 'Administrat',
        tooltip: 'Doza a fost administrata in aceasta zi.'
      }
    }

    if (!start || !dayDate || ciclu === 0) {
      return {
        className: 'muted',
        label: '',
        tooltip: 'Nu exista administrare programata pentru aceasta zi.'
      }
    }

    if (dayDate < start) {
      return {
        className: 'muted',
        label: '',
        tooltip: 'Inainte de inceperea tratamentului.'
      }
    }

    const diffDays = Math.floor((dayDate - start) / (1000 * 60 * 60 * 24))

    if (durataOff === 0 && diffDays >= durataOn) {
      return {
        className: 'finished',
        label: 'Finalizat',
        tooltip: 'Tratamentul este incheiat dupa perioada setata.'
      }
    }

    const cycleDay = diffDays % ciclu

    if (cycleDay < durataOn) {
      return {
        className: 'scheduled',
        label: 'Programat',
        tooltip: 'Zi de administrare programata.'
      }
    }

    return {
      className: 'pause',
      label: 'Pauza',
      tooltip: 'Zi de pauza in ciclul tratamentului.'
    }
  }


  const getScheduledTreatmentDays = (tratament) => {
    const start = normalizeDate(tratament?.data_start)
    const durataOn = Number(tratament?.durata_administrare) || 0
    const durataOff = Number(tratament?.durata_pauza) || 0

    if (!start || durataOn <= 0 || durataOff > 0) return []

    return Array.from({ length: durataOn }, (_, index) => {
      const date = new Date(start)
      date.setDate(start.getDate() + index)
      return getDateKey(date)
    })
  }

  const esteTratamentCompletAdministrat = (tratament) => {
    if (!tratament?.id) return false

    const scheduledDays = getScheduledTreatmentDays(tratament)
    if (!scheduledDays.length) return false

    const today = todayKey
    const lastScheduledDay = scheduledDays[scheduledDays.length - 1]
    if (today < lastScheduledDay) return false

    const administrari = administrariPeTratament[tratament.id] || []
    const administeredDays = new Set(
      administrari.map((administrare) => getDateKey(administrare.data_administrare))
    )

    return scheduledDays.every((dayKey) => administeredDays.has(dayKey))
  }

  const esteTratamentArhivat = (tratament) =>
    manualArchivedTreatmentIds.includes(tratament.id) || esteTratamentCompletAdministrat(tratament)

  const finalizeazaTratament = (tratamentId) => {
    const nextArchivedIds = [...new Set([...manualArchivedTreatmentIds, tratamentId])]
    setManualArchivedTreatmentIds(nextArchivedIds)
    localStorage.setItem(treatmentArchiveKey, JSON.stringify(nextArchivedIds))
    setShowArchivedTreatments(true)
    showToast('Tratamentul a fost mutat in arhiva.')
  }

  if (isLoading) {
    return <h1 className="loading-text">Se incarca profilul animalului...</h1>
  }

  if (error) {
    return <h1 className="error-text">A aparut o eroare la incarcarea profilului.</h1>
  }

  const animal = (animale || []).find((item) => item.id === animalId)

  if (!animal) {
    return (
      <div className="page">
        <h1>Animalul nu a fost gasit.</h1>
        <button className="primary-button" onClick={() => navigate('/')}>
          Inapoi la dashboard
        </button>
      </div>
    )
  }

  const microcipText =
    animal.microcip === 'fara_microcip'
      ? 'Nu are microcip'
      : animal.microcip === 'necunoscut'
        ? 'Nu este cunoscut'
        : animal.microcip || 'De completat'
  const sterilizatText =
    animal.sterilizat === 1 || animal.sterilizat === true
      ? 'Da'
      : animal.sterilizat === 0 || animal.sterilizat === false
        ? 'Nu'
        : 'De completat'

  const breedName = animal.rasa || 'Rasă necompletată'
  const breedDetails = normalizeBreedDetails(breedDetailsFromApi) || getGenericBreedDetails(breedName)

  const calendarDays = getCalendarDays()
  const todayKey = getDateKey(new Date())
  const ultimulSimptom = istoricSimptome?.[0]
  const tratamenteActive = (tratamente || []).filter((tratament) => {
    const info = calculeazaStatusTratament(tratament)

    return info?.status === 'Administrare'
  })
  const tratamenteAdministrateAzi = (tratamente || []).filter((tratament) => {
    const administrari = administrariPeTratament[tratament.id] || []

    return administrari.some((administrare) =>
      esteAzi(administrare.data_administrare)
    )
  })
  const tratamenteFinalizate = (tratamente || []).filter((tratament) =>
    esteTratamentArhivat(tratament)
  )
  const tratamentePrincipale = (tratamente || []).filter(
    (tratament) => !esteTratamentArhivat(tratament)
  )
  const tratamenteAfisate = showArchivedTreatments
    ? tratamenteFinalizate
    : tratamentePrincipale
  const tratamenteNeadministrateAzi = tratamentePrincipale.filter((tratament) => {
    const info = calculeazaStatusTratament(tratament)
    const administrari = administrariPeTratament[tratament.id] || []
    const administratAzi = administrari.some((administrare) =>
      esteAzi(administrare.data_administrare)
    )

    return info?.status === 'Administrare' && !administratAzi
  })
  const tratamenteActiveAdministrateAzi = tratamenteActive.filter((tratament) => {
    const administrari = administrariPeTratament[tratament.id] || []

    return administrari.some((administrare) =>
      esteAzi(administrare.data_administrare)
    )
  })
  const rutinaZilnicaScor =
    tratamenteActive.length > 0
      ? Math.round((tratamenteActiveAdministrateAzi.length / tratamenteActive.length) * 100)
      : 0

  const healthIndex = calculatePetHealthIndex({
    medicalRecords,
    treatments: tratamenteActive,
    treatmentsAdministeredToday: tratamenteActiveAdministrateAzi.length,
    symptoms: istoricSimptome || [],
    journalRecords: dailyJournalRecords
  })
  const healthIndexLabel = getHealthIndexLabel(healthIndex)
  const dewormingStatus = getDewormingStatus(medicalRecords)
  const vaccineStatusLabel = isMedicalRecordValid(medicalRecords, 'vaccin', 365) ? 'La zi' : 'De completat'
  const tratamentAlerts = [
    ...(preferences.treatmentReminders && tratamenteNeadministrateAzi.length > 0
      ? [
          {
            type: 'warning',
            title: 'Administrare de verificat',
            text: `${tratamenteNeadministrateAzi
              .map((tratament) => tratament.nume)
              .join(', ')} ${
              tratamenteNeadministrateAzi.length === 1 ? 'nu este marcat' : 'nu sunt marcate'
            } ca administrat astazi.`
          }
        ]
      : []),
    ...tratamentePrincipale.flatMap((tratament) => {
      const info = calculeazaStatusTratament(tratament)
      const administrari = administrariPeTratament[tratament.id] || []
      const administratAzi = administrari.some((administrare) =>
        esteAzi(administrare.data_administrare)
      )

      return getTratamentAlerts(tratament, info, administratAzi).filter(
        (alert) => alert.type !== 'warning'
      )
    })
  ]
  const areInsightSimptomeTratament =
    (istoricSimptome || []).length > 0 && tratamentePrincipale.length > 0
  const administrariRecente = (tratamente || [])
    .flatMap((tratament) =>
      (administrariPeTratament[tratament.id] || []).map((administrare) => ({
        id: `${tratament.id}-${administrare.id}`,
        nume: tratament.nume,
        data: administrare.data_administrare
      }))
    )
    .sort((a, b) => new Date(b.data) - new Date(a.data))
    .slice(0, 4)

  const dailyJournalToday = getDailyJournalToday()
  const dailyJournalChart = getDailyJournalChart()
  const latestWeightEntry = [...(weightHistory || [])].sort(
    (a, b) => new Date(b.data_inregistrare) - new Date(a.data_inregistrare)
  )[0]
  const weightChartData = getWeightChartData()
  const weightValues = weightChartData.map((entry) => entry.value).filter((value) => value > 0)
  const minWeightValue = weightValues.length ? Math.min(...weightValues) : 0
  const maxWeightValue = weightValues.length ? Math.max(...weightValues) : 0
  const weightRange = maxWeightValue - minWeightValue || 1
  const weightReminderDue = !latestWeightEntry || (daysBetweenToday(latestWeightEntry.data_inregistrare) ?? 0) >= 365
  const latestAnnualVaccine = getLatestMedicalRecord('vaccin')
  const latestInternalDeworming = getLatestMedicalRecord('deparazitare', 'interna')
  const latestExternalDeworming = getLatestMedicalRecord('deparazitare', 'externa')
  const nextAnnualVaccineDate = getNextMedicalDate(latestAnnualVaccine)
  const nextInternalDewormingDate = getNextMedicalDate(latestInternalDeworming)
  const nextExternalDewormingDate = getNextMedicalDate(latestExternalDeworming)

  const notifications = [
    ...(preferences.treatmentReminders && tratamenteNeadministrateAzi.length > 0
      ? tratamenteNeadministrateAzi.map((tratament) => ({
          id: `treatment-${tratament.id}`,
          title: 'Tratament de verificat',
          text: `${tratament.nume} nu este bifat ca administrat azi.`,
          type: 'warning'
        }))
      : []),
    ...(preferences.vaccineReminders
      ? [{
          id: 'vaccine-reminder',
          title: 'Vaccin anual',
          text: latestAnnualVaccine
            ? `Următorul vaccin anual: ${nextAnnualVaccineDate || 'de completat'}.`
            : 'Completează data vaccinului anual în carnetul de sănătate pentru reminder.',
          type: latestAnnualVaccine ? 'info' : 'soft'
        }]
      : []),
    ...(preferences.parasiteReminders
      ? [
          {
            id: 'parasite-internal-reminder',
            title: 'Deparazitare internă',
            text: latestInternalDeworming
              ? `Următoarea deparazitare internă: ${nextInternalDewormingDate || 'de completat'}.`
              : 'Completează ultima deparazitare internă în carnet.',
            type: latestInternalDeworming ? 'info' : 'soft'
          },
          {
            id: 'parasite-external-reminder',
            title: 'Deparazitare externă',
            text: latestExternalDeworming
              ? `Următoarea deparazitare externă: ${nextExternalDewormingDate || 'de completat'}.`
              : 'Completează ultima deparazitare externă în carnet.',
            type: latestExternalDeworming ? 'info' : 'soft'
          }
        ]
      : []),
    ...(weightReminderDue
      ? [{
          id: 'weight-reminder',
          title: 'Greutate de actualizat',
          text: latestWeightEntry
            ? 'A trecut peste un an de la ultima greutate introdusa.'
            : 'Adauga prima greutate pentru a urmari evolutia in timp.',
          type: 'info'
        }]
      : []),
    ...(ultimulSimptom
      ? [{
          id: 'last-symptom',
          title: 'Simptom recent',
          text: `${displayText(ultimulSimptom?.simptom, 'Simptom')} raportat pe ${formatDate(ultimulSimptom?.data_raportare)}.`,
          type: 'info'
        }]
      : [])
  ]
  localStorage.setItem(`petcare-health-index-${animalId}`, String(healthIndex))

  const healthTimelineEvents = [
    ...(istoricSimptome || []).slice(0, 8).map((item) => ({
      date: item?.data_raportare,
      title: `${displayText(item?.simptom, 'Simptom')} raportat`,
      text: `Severitate: ${displayText(
        item?.severitate,
        'nespecificata'
      )} - Frecventa: ${displayText(item?.frecventa, 'nespecificata')}`
    })),
    ...tratamentePrincipale.slice(0, 3).map((tratament) => ({
      date: tratament.data_start,
      title: `${tratament.nume} inceput`,
      text: `${tratament.durata_administrare || 0} zile administrare`
    }))
  ].sort((a, b) => new Date(b.date) - new Date(a.date))
  const previewTimelineEvents = healthTimelineEvents.slice(0, 4)
  const hiddenTimelineEvents = Math.max(
    healthTimelineEvents.length - previewTimelineEvents.length,
    0
  )
  const stareGenerala =
    tratamenteNeadministrateAzi.length > 0 || ultimulSimptom
      ? 'Necesita atentie'
      : 'Stabila'
  const ultimaActualizare = ultimulSimptom
    ? formatDate(ultimulSimptom.data_raportare)
    : 'Nu exista inca'
  const profileTabs = [
    { id: 'profile', label: 'Profil' },
    { id: 'health', label: 'Sanatate' },
    { id: 'treatments', label: 'Tratamente' },
    { id: 'history', label: 'Istoric' },
    { id: 'medical', label: 'Carnet de sanatate' }
  ]
  const todayTasks = [
    ...(preferences.treatmentReminders
      ? tratamenteNeadministrateAzi.length > 0
        ? [
            {
              type: 'urgent',
              title:
                tratamenteNeadministrateAzi.length === 1
                  ? '1 tratament nu este bifat azi'
                  : `${tratamenteNeadministrateAzi.length} tratamente nu sunt bifate azi`,
              text: tratamenteNeadministrateAzi.map((tratament) => tratament.nume).join(', ')
            }
          ]
        : [
            {
              type: 'good',
              title: 'Tratamentele sunt verificate',
              text:
                tratamentePrincipale.length > 0
                  ? 'Nu exista administrari restante marcate pentru astazi.'
                  : 'Nu exista tratamente active in acest moment.'
            }
          ]
      : []),
    {
      type: 'info',
      title: `${tratamentePrincipale.length} tratamente active`,
      text: 'Lista completa este in Tratamente.'
    },
    ...(preferences.vaccineReminders
      ? [
          {
            type: latestAnnualVaccine ? 'note' : 'soft',
            title: latestAnnualVaccine ? 'Vaccin anual programat' : 'Vaccin anual de completat',
            text: latestAnnualVaccine
              ? `Urmatorul vaccin anual: ${nextAnnualVaccineDate || 'de completat'}.`
              : 'Adauga data in carnetul medical pentru reminder.'
          }
        ]
      : []),
    ...(preferences.parasiteReminders
      ? [
          {
            type: latestInternalDeworming ? 'note' : 'soft',
            title: latestInternalDeworming ? 'Deparazitare interna programata' : 'Deparazitare interna de completat',
            text: latestInternalDeworming
              ? `Urmatoarea deparazitare interna: ${nextInternalDewormingDate || 'de completat'}.`
              : 'Noteaza ultima administrare interna.'
          },
          {
            type: latestExternalDeworming ? 'note' : 'soft',
            title: latestExternalDeworming ? 'Deparazitare externa programata' : 'Deparazitare externa de completat',
            text: latestExternalDeworming
              ? `Urmatoarea deparazitare externa: ${nextExternalDewormingDate || 'de completat'}.`
              : 'Noteaza ultima administrare externa.'
          }
        ]
      : []),
    ...(ultimulSimptom
      ? [
          {
            type: 'note',
            title: 'Simptom recent',
            text: `${displayText(ultimulSimptom?.simptom, 'Simptom')} raportat pe ${formatDate(
              ultimulSimptom?.data_raportare
            )}.`
          }
        ]
      : [])
  ]
  const todayTaskMeta = {
    urgent: { icon: <AlertCircle size={16} />, label: 'Urgent' },
    good: { icon: <CheckCircle size={16} />, label: 'La zi' },
    info: { icon: <Plus size={16} />, label: 'Rutina' },
    soft: { icon: <Syringe size={16} />, label: 'Reminder' },
    note: { icon: <ClipboardList size={16} />, label: 'Recent' }
  }

  const todayTaskPageSize = 4
  const todayTaskPages = Math.max(1, Math.ceil(todayTasks.length / todayTaskPageSize))
  const safeTodayTaskPage = Math.min(todayTaskPage, todayTaskPages - 1)
  const visibleTodayTasks = todayTasks.slice(
    safeTodayTaskPage * todayTaskPageSize,
    safeTodayTaskPage * todayTaskPageSize + todayTaskPageSize
  )

  const goToPreviousTodayTasks = () => {
    setTodayTaskPage((page) => Math.max(0, page - 1))
  }

  const goToNextTodayTasks = () => {
    setTodayTaskPage((page) => Math.min(todayTaskPages - 1, page + 1))
  }

  const selectedTreatmentCalendar = (tratamente || []).find(
    (tratament) => tratament.id === selectedTreatmentCalendarId
  )
  const selectedTreatmentAdministrari = selectedTreatmentCalendar
    ? administrariPeTratament[selectedTreatmentCalendar.id] || []
    : []
  const selectedTreatmentMonthDays = selectedTreatmentCalendar
    ? getTreatmentCalendarMonthDays(treatmentCalendarMonth)
    : []
  const selectedTreatmentMonthLabel = treatmentCalendarMonth.toLocaleDateString('ro-RO', {
    month: 'long',
    year: 'numeric'
  })

  const pageHeadings = {
    profile: {
      eyebrow: 'Profil personal',
      title: `Profilul lui ${animal.nume}`,
      text: 'Informatiile importante, starea actuala si rutina de ingrijire intr-un singur loc.'
    },
    health: {
      eyebrow: 'Monitorizare preventiva',
      title: 'Centru de sanatate',
      text: `Urmareste schimbarile observate la ${animal.nume} si noteaza simptomele cat sunt inca usor de comparat.`
    },
    treatments: {
      eyebrow: 'Rutina de administrare',
      title: 'Monitorizare Tratamente',
      text: `Sanatatea lui ${animal.nume}  Monitorizare in timp real`
    },
    history: {
      eyebrow: 'Evolutie in timp',
      title: 'Istoric de sanatate',
      text: 'Un fir cronologic al simptomelor si tratamentelor, util pentru urmarire si consultatii.'
    },
    medical: {
      eyebrow: 'Documente si ingrijire',
      title: 'Carnet de sanatate',
      text: 'Pastreaza organizate vaccinarile, deparazitarile si informatiile medicale importante.'
    }
  }
  const activeHeading = pageHeadings[activeTab]

  const getAnimalInitial = (name = animal?.nume) => String(name || '?').trim().charAt(0).toUpperCase() || '?'

  const getAnimalAvatarTone = (sex = animal?.sex) => {
    const normalizedSex = String(sex || '').toLowerCase()
    return normalizedSex.includes('fem') ? 'female' : 'male'
  }

  const openEditProfile = () => {
    navigate(`/animal/${animalId}/edit`)
    setTimeout(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    }, 0)
  }

  const sidebarTabs = [
    { id: 'profile', label: 'Acasa', icon: 'home' },
    { id: 'health', label: 'Centru sanatate', icon: 'health' },
    { id: 'treatments', label: 'Monitor tratamente', icon: 'treatments' },
    { id: 'history', label: 'Activitate', icon: 'history' },
    { id: 'medical', label: 'Carnet de sanatate', icon: 'medical' }
  ]
  const profileSearchItems = [
    {
      id: 'profile',
      label: 'Profil animal',
      description: 'Date personale, rasa, greutate si microcip',
      icon: <PawPrint size={18} />,
      tab: 'profile',
      target: 'profile-overview',
      keywords: 'profil date personale rasa greutate sex microcip'
    },
    {
      id: 'edit-profile',
      label: 'Editeaza profilul',
      description: 'Actualizeaza fotografia si datele lui ' + animal.nume,
      icon: <Edit3 size={18} />,
      action: openEditProfile,
      keywords: 'editeaza modifica fotografie poza profil'
    },
    {
      id: 'health',
      label: 'Centru de sanatate',
      description: 'Evaluare preventiva, recomandari si harta corporala',
      icon: <HeartPulse size={18} />,
      tab: 'health',
      target: 'health-center',
      keywords: 'sanatate evaluare simptome recomandari harta corporala'
    },
    {
      id: 'evaluation',
      label: 'Incepe o evaluare preventiva',
      description: 'Noteaza rapid simptomele observate',
      icon: <ClipboardList size={18} />,
      tab: 'health',
      target: 'preventive-evaluation',
      action: () => setShowEvaluationForm(true),
      keywords: 'evaluare raportare simptom simptome preventie'
    },
    {
      id: 'body-map',
      label: 'Harta corporala',
      description: 'Localizeaza vizual zona in care ai observat schimbari',
      icon: <Map size={18} />,
      tab: 'health',
      target: 'body-map',
      keywords: 'harta corp zona cap abdomen articulatii labute coada'
    },
    {
      id: 'treatments',
      label: 'Monitor tratamente',
      description: 'Administrari, progres si tratamente active',
      icon: <Pill size={18} />,
      tab: 'treatments',
      target: 'treatment-monitor',
      keywords: 'tratament tratamente medicatie administrare pastile progres'
    },
    {
      id: 'history',
      label: 'Istoric de sanatate',
      description: 'Simptome si administrari in ordine cronologica',
      icon: <Activity size={18} />,
      tab: 'history',
      target: 'health-history',
      keywords: 'istoric activitate cronologie simptome administrari'
    },
    {
      id: 'medical',
      label: 'Carnet de sanatate',
      description: 'Vaccinari, deparazitari si vizite veterinare',
      icon: <BookOpen size={18} />,
      tab: 'medical',
      target: 'health-booklet',
      keywords: 'carnet vaccin vaccinari deparazitare veterinar documente'
    },
    ...(tratamentePrincipale || []).map((tratament) => ({
      id: `treatment-${tratament.id}`,
      label: tratament.nume,
      description: 'Tratament activ pentru ' + animal.nume,
      icon: <Pill size={18} />,
      tab: 'treatments',
      target: 'treatment-monitor',
      keywords: `tratament medicatie ${tratament.nume}`
    }))
  ]
  const normalizedProfileSearch = normalizeText(profileSearch.trim()) || ''
  const profileSearchResults = normalizedProfileSearch
    ? profileSearchItems
        .filter((item) =>
          normalizeText(`${item.label} ${item.description} ${item.keywords}`).includes(
            normalizedProfileSearch
          )
        )
        .slice(0, 6)
    : profileSearchItems.slice(0, 5)

  const selectProfileSearchItem = (item) => {
    if (item.tab) {
      setActiveTab(item.tab)
    }

    item.action?.()
    setProfileSearch('')
    setShowProfileSearch(false)
    setTimeout(() => {
      const target = item.target ? document.getElementById(item.target) : null

      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' })
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    }, 0)
  }

  const renderSidebarIcon = (icon) => {
    const icons = {
      pets: <PawPrint size={18} />,
      home: <Home size={18} />,
      health: <HeartPulse size={18} />,
      treatments: <Pill size={18} />,
      history: <Activity size={18} />,
      medical: <BookOpen size={18} />,
      settings: <Settings size={18} />,
      vet: <Stethoscope size={18} />
    }

    return (
      <span className="sidebar-icon-real" aria-hidden="true">
        {icons[icon] || <PawPrint size={18} />}
      </span>
    )
  }

  return (
    <div className="petcare-app-shell">
      <aside className="petcare-sidebar">
        <div className="petcare-sidebar-brand-row">
          <button className="petcare-brand" type="button" onClick={() => navigate('/')}>
            <span>Pet</span>Care
          </button>
          <button
            className="petcare-sidebar-back"
            type="button"
            aria-label="Inapoi la animalele mele"
            title="Inapoi la animalele mele"
            onClick={() => navigate('/')}
          >
            <ArrowLeft size={18} aria-hidden="true" />
          </button>
        </div>

        <button
          className="petcare-sidebar-pet sidebar-pet-button"
          type="button"
          aria-label={`Editează profilul lui ${animal.nume}`}
          title="Editează profilul animalului"
          onClick={() => navigate(`/animal/${animalId}/edit`)}
        >
          <div className="petcare-sidebar-avatar">
            {animal.fotografie_url ? (
              <img src={animal.fotografie_url} alt={animal.nume} />
            ) : (
              <span className={`animal-initial-avatar sidebar-animal-initial ${getAnimalAvatarTone(animal.sex)} visible`}>
                {getAnimalInitial(animal.nume)}
              </span>
            )}
          </div>
          <div className="petcare-sidebar-pet-copy">
            <strong>{animal.nume}</strong>
            <span className="petcare-sidebar-breed">{animal.rasa || animal.specie}</span>
            <span className="petcare-sidebar-age">{formatAge(animal.varsta, 'profil')}</span>
          </div>
        </button>

        <nav className="petcare-sidebar-nav" aria-label="Navigare principala profil">
          <button type="button" onClick={() => navigate('/')}>
            {renderSidebarIcon('pets')}
            Animalele mele
          </button>
          {sidebarTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={activeTab === tab.id ? 'active' : ''}
              onClick={() => setActiveTab(tab.id)}
            >
              {renderSidebarIcon(tab.icon)}
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="petcare-sidebar-footer">
          <button type="button" onClick={() => setShowSettings(true)}>
            {renderSidebarIcon('settings')}
            Setari
          </button>
          <button className="emergency" type="button" onClick={() => setShowVetSupport(true)}>
            {renderSidebarIcon('vet')}
            Asistenta veterinara
          </button>
        </div>
      </aside>

      <main className="petcare-main">
        <header className="petcare-topbar">
          <strong>PetCare <span>Premium</span></strong>
          <label
            className="petcare-topbar-search"
            onFocus={() => setShowProfileSearch(true)}
            onBlur={() => setTimeout(() => setShowProfileSearch(false), 120)}
          >
            <span aria-hidden="true"></span>
            <input
              type="search"
              placeholder="Cauta in profil..."
              aria-label="Cauta in profil"
              value={profileSearch}
              onChange={(event) => {
                setProfileSearch(event.target.value)
                setShowProfileSearch(true)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setProfileSearch('')
                  setShowProfileSearch(false)
                }

                if (event.key === 'Enter' && profileSearchResults[0]) {
                  event.preventDefault()
                  selectProfileSearchItem(profileSearchResults[0])
                }
              }}
            />
            {showProfileSearch && (
              <div className="petcare-search-results">
                <p>{profileSearch ? 'Rezultate in profil' : 'Acces rapid'}</p>
                {profileSearchResults.length > 0 ? (
                  profileSearchResults.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectProfileSearchItem(item)}
                    >
                      <span aria-hidden="true">{item.icon}</span>
                      <span>
                        <strong>{item.label}</strong>
                        <small>{item.description}</small>
                      </span>
                    </button>
                  ))
                ) : (
                  <span className="petcare-search-empty">
                    Nu am gasit o sectiune potrivita. Incearca vaccin, tratament sau
                    harta.
                  </span>
                )}
              </div>
            )}
          </label>
          <nav aria-label="Navigare rapida">
            <button type="button" onClick={() => setActiveTab('profile')}>Dashboard</button>
            <button type="button" onClick={() => setActiveTab('history')}>Activitate</button>
            <button type="button" onClick={() => setActiveTab('medical')}>Carnet</button>
          </nav>
          <div className="petcare-topbar-actions">
            <button
              className="notification-bell-button"
              type="button"
              aria-label="Deschide notificarile"
              onClick={() => setShowNotifications((current) => !current)}
            >
              <Bell size={19} />
           
            </button>
            {showNotifications && (
              <div className="notifications-panel">
                <div className="notifications-panel-header">
                  <strong>Notificari</strong>
                  <button type="button" aria-label="Inchide notificarile" onClick={() => setShowNotifications(false)}>
                    <X size={16} />
                  </button>
                </div>
                {notifications.length > 0 ? (
                  notifications.map((notification) => (
                    <div key={notification.id} className={`notification-item ${notification.type}`}>
                      <strong>{notification.title}</strong>
                      <p>{notification.text}</p>
                    </div>
                  ))
                ) : (
                  <p className="notifications-empty">Nu ai notificari active acum.</p>
                )}
              </div>
            )}
            <button
              className="petcare-topbar-record"
              type="button"
              onClick={() => {
                openMedicalRecordForm('vaccin')
              }}
            >
              Adauga inregistrare
            </button>
          </div>
        </header>

        <div className="page petcare-profile-page">
      <button className="back-button petcare-mobile-back" onClick={() => navigate('/')}>
         Inapoi la animalele mele
      </button>

      <section
        className={`petcare-page-heading ${activeTab === 'profile' ? 'profile-heading' : ''} ${
          activeTab === 'health' ? 'health-heading' : ''
        } ${activeTab === 'treatments' ? 'treatments-heading' : ''}`}
      >
        <div>
          <span>{activeHeading.eyebrow}</span>
          <h1>{activeHeading.title}</h1>
          <p>{activeHeading.text}</p>
        </div>
        <div className="petcare-heading-stats">
          <div>
            <span>Stare generala</span>
            <strong>{stareGenerala}</strong>
          </div>
          <div>
            <span>Tratamente active</span>
            <strong>{tratamentePrincipale.length}</strong>
          </div>
        </div>
      </section>

      {activeTab === 'profile' && (
        <>
      <header className="pet-profile-hero">
        <div className="pet-profile-identity">
          <div className="pet-profile-avatar">
            {animal.fotografie_url ? (
              <img src={animal.fotografie_url} alt={animal.nume} />
            ) : (
              <span className={`animal-initial-avatar pet-profile-initial ${getAnimalAvatarTone(animal.sex)} visible`}>
                {getAnimalInitial(animal.nume)}
              </span>
            )}
          </div>

          <div className="pet-profile-copy">
            <p className="hero-subtitle">Profil animal</p>
            <h1>{animal.nume}</h1>
            <p className="pet-profile-meta">
              {animal.rasa || 'Rasa necompletata'} {' '}
              {formatAge(animal.varsta, 'Varsta necompletata')} {' '}
              {animal.sex || 'Sex necompletat'} {' '}
              {animal.greutate ? `${animal.greutate} kg` : 'Greutate necompletata'}
            </p>
            <p className="hero-description">
              Monitorizeaza starea lui {animal.nume}, simptomele observate si
              tratamentele importante intr-un singur loc.
            </p>
          </div>
        </div>

        <div className="pet-profile-status">
          <div>
            <span>Stare generala</span>
            <strong>{stareGenerala}</strong>
          </div>
          <div>
            <span>Ultimul simptom</span>
            <strong>{displayText(ultimulSimptom?.simptom, 'Nimic raportat')}</strong>
          </div>
          <div>
            <span>Ultima actualizare</span>
            <strong>{ultimaActualizare}</strong>
          </div>
        </div>

        <div className="pet-profile-actions">
          <button
            className="secondary-button"
            onClick={openEditProfile}
          >
            Editeaza profil
          </button>
          <button
            className="primary-button"
            onClick={() => {
              setShowEvaluationForm(true)
            }}
          >
            Raporteaza simptom
          </button>
          <button
            className="secondary-button"
            onClick={() => {
              resetTreatmentForm()
              setShowTratamentForm(true)
            }}
          >
            Adauga tratament
          </button>
        </div>
      </header>

      <section className="today-panel">
        <div className="today-panel-header">
          <div>
            <span>Prioritati</span>
            <h2>Ce trebuie facut azi</h2>
          </div>
          <div className="today-panel-side">
            <p>
              {animal.nume} are aici cele mai importante lucruri de verificat rapid.
            </p>
            {todayTasks.length > todayTaskPageSize && (
              <div className="today-task-controls" aria-label="Navigare prioritati">
                <button
                  type="button"
                  onClick={goToPreviousTodayTasks}
                  disabled={safeTodayTaskPage === 0}
                  aria-label="Prioritatile anterioare"
                >
                  <ArrowLeft size={16} />
                </button>
                <span>{safeTodayTaskPage + 1}/{todayTaskPages}</span>
                <button
                  type="button"
                  onClick={goToNextTodayTasks}
                  disabled={safeTodayTaskPage >= todayTaskPages - 1}
                  aria-label="Prioritatile urmatoare"
                >
                  <ArrowRight size={16} />
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="today-task-grid">
          {visibleTodayTasks.map((task, index) => (
            <button
              key={`${task.title}-${index}`}
              type="button"
              className={`today-task ${task.type}`}
              onClick={() => {
                if (task.title.toLowerCase().includes('tratament')) {
                  setActiveTab('treatments')
                } else if (task.title.toLowerCase().includes('simptom')) {
                  setActiveTab('health')
                } else {
                  setActiveTab('medical')
                }
              }}
            >
              <div className="today-task-topline">
                <span className="today-task-icon" aria-hidden="true">
                  {todayTaskMeta[task.type].icon}
                </span>
                <em>{todayTaskMeta[task.type].label}</em>
              </div>
              <strong>{task.title}</strong>
              <span>{task.text}</span>
            </button>
          ))}
        </div>
      </section>
        </>
      )}

      <section className="profile-grid pet-profile-content">
        {activeTab === 'profile' && (
          <div id="profile-overview" className="profile-overview-layout">
            <div className="profile-card profile-home-card">
              <div className="section-header">
                <div>
                  <h2>Informatii esentiale</h2>
                </div>
                <button
                  className="secondary-button"
                  onClick={openEditProfile}
                >
                  Editeaza profil
                </button>
              </div>

              <div className="profile-detail-board">
                {[
                  ['Specie', animal.specie || 'Nespecificat'],
                  ['Rasa', animal.rasa || 'Nespecificata'],
                  ['Sex', animal.sex || 'Nespecificat'],
                  ['Varsta', formatAge(animal.varsta)],
                  ['Greutate', animal.greutate ? `${animal.greutate} kg` : 'De completat'],
                  ['Culoare', animal.culoare || 'De completat'],
                  [
                    'Data nasterii',
                    animal.data_nasterii ? formatDate(animal.data_nasterii) : 'De completat'
                  ],
                  ['Sterilizat', sterilizatText],
                  ['Microcip', microcipText]
                ].map(([label, value]) => (
                  <div key={label} className="profile-detail-row">
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            </div>

            <aside className="daily-profile-stack" aria-label="Rezumat rutina zilnica">
              <button
                type="button"
                className="daily-routine-card"
                onClick={() => setActiveTab('treatments')}
                aria-label="Deschide tratamentele pentru administrarile de azi"
              >
                <span className="daily-routine-label">Rutina de azi</span>
                <div
                  className="daily-routine-ring"
                  style={{
                    '--routine-score': `${tratamenteActive.length > 0 ? rutinaZilnicaScor * 3.6 : 0}deg`
                  }}
                >
                  <div>
                    <strong>{tratamenteActive.length > 0 ? `${rutinaZilnicaScor}%` : '—'} </strong>
                    <span>
                      {tratamenteActive.length > 0 ? 'completat' : 'fără rutină'}
                    </span>
                  </div>
                </div>
                <div className="daily-routine-legend">
                  <span>
                    <i className="indigo" />
                    Administrari
                  </span>
                  <strong>
                    {tratamenteActiveAdministrateAzi.length}/{tratamenteActive.length}
                  </strong>
                </div>
              </button>

              <button
                type="button"
                className="daily-journal-card"
                onClick={() => setShowDailyJournal(true)}
              >
                <span>Jurnal zilnic</span>
                <strong>Noteaza starea lui {animal.nume}</strong>
                <div>
                  <small>Apetit</small>
                  <b>{dailyJournalToday ? `${dailyJournalToday.appetite}/10` : 'De completat'}</b>
                </div>
                <div>
                  <small>Mobilitate</small>
                  <b>{dailyJournalToday ? `${dailyJournalToday.mobility}/10` : 'De completat'}</b>
                </div>
              </button>
            </aside>
          </div>
        )}

        {activeTab === 'health' && (
          <div id="health-center" className="health-compact-shell">
            <div className="health-compact-grid">
              <section className="health-compact-main">
                <div className="health-compact-status-row">
                  <article>
                    <span className="health-status-icon"><Plus size={16} /></span>
                    <div>
                      <small>Ultimul simptom</small>
                      <strong>{displayText(ultimulSimptom?.simptom, 'Fără raportări recente')}</strong>
                    </div>
                  </article>
                  <article>
                    <span className="health-status-icon violet"><Pill size={16} /></span>
                    <div>
                      <small>Rutina tratamentelor</small>
                      <strong>
                        {tratamenteActive?.length > 0
                          ? `${rutinaZilnicaScor}% bifat azi`
                          : 'Nu există tratamente active'}
                      </strong>
                    </div>
                  </article>
                  <article>
                    <span className="health-status-icon cyan"><CalendarCheck size={16} /></span>
                    <div>
                      <small>Ultima actualizare</small>
                      <strong>{ultimaActualizare}</strong>
                    </div>
                  </article>
                </div>

                <section className="health-compact-diagnostic" id="preventive-evaluation">
                  <span>Diagnostic preventiv</span>
                  <h3>Raportează ce ai observat</h3>
                  <p>Notează simptomele, intensitatea și contextul. PetCare te ajută să urmărești mai clar riscurile specifice lui {animal.nume}.</p>
                  <button type="button" onClick={incepeEvaluareNoua}>
                    Începe evaluarea
                    <ArrowRight size={15} />
                  </button>
                </section>

                {successMessage && <p className="success-message">{successMessage}</p>}

                {analiza && (
                  <section className="analysis-box health-redesign-analysis" ref={analysisResultRef}>
                    <div className="analysis-title-block">
                      <span>Interpretare preventivă</span>
                      <h3>Rezultatul evaluării</h3>
                      <p>Rezultatul te ajută să urmărești mai clar ce se întâmplă. Nu este diagnostic.</p>
                    </div>

                    <div className="analysis-list">
                      {analiza.map((rezultat) => {
                        const sectiuni = getEvaluareSectiuni(rezultat)

                        return (
                          <div key={rezultat.afectiune_id} className="analysis-card">
                            <div className="analysis-header">
                              <h4>{rezultat.afectiune}</h4>
                              <span className={`risk-badge ${rezultat.nivel_risc}`}>{rezultat.nivel_risc}</span>
                            </div>
                            <p>{sectiuni.meaning}</p>
                            <p className="recommendation">{sectiuni.recommendation}</p>

                            {rezultat.recomandari_preventive?.length > 0 && (
                              <div className="breed-preventive-panel">
                                <span>Corelare cu rasa</span>
                                {rezultat.recomandari_preventive.map((item) => (
                                  <div key={item.id} className="breed-preventive-item">
                                    <strong>{item.rasa}: {item.predispozitie}</strong>
                                    <p>{item.explicatie}</p>
                                    {item.tratament_preventiv && (
                                      <p><b>Prevenție:</b> {item.tratament_preventiv}</p>
                                    )}
                                    {item.recomandare && (
                                      <p><b>Recomandare:</b> {item.recomandare}</p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </section>
                )}

                <section className="health-compact-history">
                  <div className="health-compact-section-head">
                    <h3>Istoric simptome recente</h3>
                    <button type="button" onClick={() => navigate(`/animal/${animalId}/istoric`)}>Vezi tot istoricul</button>
                  </div>

                  <div className="health-compact-symptom-list">
                    {(istoricSimptome || []).length ? (
                      (istoricSimptome || []).slice(0, 2).map((item) => (
                        <article key={item.id} className="health-compact-symptom">
                          <span className="health-compact-symptom-icon"><AlertCircle size={15} /></span>
                          <div>
                            <div className="health-compact-symptom-title">
                              <strong>{displayText(item?.simptom, 'Simptom raportat')}</strong>
                              <small>{displayText(item?.severitate, 'nespecificată')}</small>
                            </div>
                            <p>{formatDate(item.data_raportare)} · frecvență {displayText(item?.frecventa, 'nespecificată')}</p>
                            {item?.observatii ? <span>{displayText(item.observatii)}</span> : null}
                          </div>
                        </article>
                      ))
                    ) : (
                      <article className="health-compact-empty">
                        <strong>Nu au fost adăugate simptome.</strong>
                        <p>Când raportezi un simptom, vor apărea aici ultimele două înregistrări.</p>
                      </article>
                    )}
                  </div>
                </section>

                <section className="health-breed-details-card">
                  <div className="health-breed-details-head">
                    <span>Profil rasă</span>
                    <h3>Detalii importante despre {breedName}</h3>
                    <p>Informații utile pentru monitorizarea zilnică a lui {animal.nume}.</p>
                  </div>

                  <div className="health-breed-details-grid">
                    <article>
                      <span>Predispoziții</span>
                      <ul>
                        {(breedDetails.predispozitii?.length ? breedDetails.predispozitii : getGenericBreedDetails(breedName).predispozitii)
                          .slice(0, 3)
                          .map((item, index) => <li key={`predispozitii-${index}`}>{item}</li>)}
                      </ul>
                    </article>

                    <article>
                      <span>De urmărit</span>
                      <ul>
                        {(breedDetails.de_urmarit?.length ? breedDetails.de_urmarit : getGenericBreedDetails(breedName).de_urmarit)
                          .slice(0, 3)
                          .map((item, index) => <li key={`de-urmarit-${index}`}>{item}</li>)}
                      </ul>
                    </article>

                    <article>
                      <span>Recomandări</span>
                      <ul>
                        {(breedDetails.recomandari?.length ? breedDetails.recomandari : getGenericBreedDetails(breedName).recomandari)
                          .slice(0, 3)
                          .map((item, index) => <li key={`recomandari-${index}`}>{item}</li>)}
                      </ul>
                    </article>
                  </div>
                </section>
              </section>

              <aside className="health-compact-side">
                <section className="health-compact-map-card" id="body-map">
                  <div className="health-compact-map-head">
                    <div>
                      <span>Interfață 3D interactivă</span>
                      <h3>Harta corporală</h3>
                    </div>
                    <button type="button" aria-label="Rotește modelul">↻</button>
                  </div>

                  <div className="health-body-map-visual health-body-map-real">
                    <BodyMap
                      species={animal.specie}
                      value={selectedBodyZone}
                      onChange={setSelectedBodyZone}
                      compact
                    />
                  </div>

                  <div className="health-compact-zone-buttons">
                    {Object.entries(bodyZoneLabels).map(([zone, label]) => (
                      <button
                        key={zone}
                        type="button"
                        className={selectedBodyZone === zone ? 'active' : ''}
                        onClick={() => setSelectedBodyZone(zone)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="health-compact-zone-summary">
                  <span>Zonă: {bodyZoneLabels[selectedBodyZone] || 'Abdomen'}</span>
                  <p>{bodyZoneDescriptions[selectedBodyZone] || bodyZoneDescriptions.abdomen}</p>
                </section>

                <button className="health-compact-download" type="button" onClick={(event) => generateHistoryPdfReport(event)}>
                  <FileText size={15} />
                  Descarcă PDF istoric
                  <Download size={14} />
                </button>

                <section className="weight-tracker-card">
                  <div className="weight-tracker-icon">
                    <Activity size={18} />
                  </div>
                  <div>
                    <span>Evoluție greutate</span>
                    <strong>{formatWeightValue(latestWeightEntry?.greutate ?? animal.greutate)}</strong>
                    <p>{getWeightReminderText()}</p>
                  </div>
                  <button type="button" onClick={() => setShowWeightTracker(true)}>
                    Adaugă greutate
                  </button>
                </section>
              </aside>
            </div>
          </div>
        )}

        {activeTab === 'treatments' && (
          <div id="treatment-monitor" className="treatment-dashboard">
            <section className="treatment-dashboard-top">
              <div>
                <span className="treatment-page-eyebrow">Centralizator</span>
                <h2>Centralizator Tratamente</h2>
                <p>Sanatatea lui {animal.nume}  Monitorizare in timp real</p>
              </div>

              <div className="treatment-toolbar">
                <div className="treatment-search-pill">
                  <span></span>
                  <span>Cauta tratamente...</span>
                </div>
                <button
                  className="primary-button treatment-new-button"
                  onClick={deschideFormTratament}
                >
                  <span>+</span>
                  Nou Tratament
                </button>
              </div>
            </section>

            <div className="treatment-top-chips">
              <div className="treatment-chip attention">
                <span></span>
                <strong>
                  {tratamenteNeadministrateAzi.length || 0}{' '}
                  {tratamenteNeadministrateAzi.length === 1
                    ? 'tratament necesita atentie'
                    : 'tratamente necesita atentie'}
                </strong>
              </div>
              <div className="treatment-toggle">
                <button
                  type="button"
                  className={!showArchivedTreatments ? 'active' : ''}
                  onClick={() => setShowArchivedTreatments(false)}
                >
                  Active
                </button>
                <button
                  type="button"
                  className={showArchivedTreatments ? 'active' : ''}
                  onClick={() => setShowArchivedTreatments(true)}
                >
                  Arhivate
                </button>
              </div>
            </div>

            <div className="treatment-dashboard-grid">
              <div className="treatment-main-column">
                {tratamenteAfisate.length === 0 ? (
                  showArchivedTreatments ? (
                    <div className="treatment-empty-state">
                      <span><PackageCheck size={22} /></span>
                      <strong>Nu exista tratamente arhivate</strong>
                      <p>
                        Tratamentele finalizate vor aparea aici, separate de rutina
                        activa.
                      </p>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="treatment-plan-card"
                      onClick={deschideFormTratament}
                    >
                      <span><Plus size={22} /></span>
                      <strong>Planifica primul tratament</strong>
                      <p>
                        Adauga tratamente periodice sau acute pentru a urmari
                        administrarile.
                      </p>
                    </button>
                  )
                ) : (
                  <div className="treatment-feature-list">
                    {tratamenteAfisate.map((t) => {
                      const info = calculeazaStatusTratament(t)
                      const stareTratament = getTratamentStare(t, info)
                      const esteInPauza = info?.status === 'Pauza'
                      const administrari = administrariPeTratament[t.id] || []
                      const ultimaAdministrare = administrari[0]
                      const administrariDateKeys = new Set(
                        administrari.map((administrare) =>
                          getDateKey(administrare.data_administrare)
                        )
                      )
                      const administratAzi = administrari.some((administrare) =>
                        esteAzi(administrare.data_administrare)
                      )
                      const zileRamaseAfisate = calculeazaZileRamaseAfisate(
                        info,
                        administratAzi
                      )
                      const progressPercent = info?.durataEtapa
                        ? Math.min(
                            100,
                            Math.round((info.ziCurenta / info.durataEtapa) * 100)
                          )
                        : 0
                      const adherence =
                        info?.ziCurenta && info.ziCurenta > 0
                          ? Math.min(
                              100,
                              Math.round((administrari.length / info.ziCurenta) * 100)
                            )
                          : administratAzi
                            ? 100
                            : 0

                      return (
                        <article key={t.id} className="treatment-feature-card">
                          <div className="treatment-feature-head">
                            <div className="treatment-icon-tile">
                              {esteInPauza ? <Clock size={28} /> : <Pill size={28} />}
                            </div>
                            <div>
                              <div className="treatment-name-line">
                                <h3>{t.nume}</h3>
                                <span
                                  className={`treatment-state-badge ${stareTratament.className}`}
                                >
                                  {stareTratament.label}
                                </span>
                                <button
                                  type="button"
                                  className="treatment-month-trigger"
                                  title="Deschide calendarul tratamentului"
                                  aria-label={`Deschide calendarul pentru ${t.nume}`}
                                  onClick={() => openTreatmentMonthCalendar(t)}
                                >
                                  <CalendarCheck size={16} />
                                </button>
                                <span
                                  className={`treatment-status-badge ${
                                    esteInPauza
                                      ? 'paused'
                                      : administratAzi
                                        ? 'done'
                                        : 'pending'
                                  }`}
                                >
                                  {esteInPauza
                                    ? 'Nu se administreaza azi'
                                    : administratAzi
                                      ? 'Administrat azi'
                                      : 'Neadministrat azi'}
                                </span>
                              </div>
                              <p className="treatment-dose-line">
                                {t.durata_administrare || 0} zile administrare {' '}
                                {t.durata_pauza || 0} zile pauza
                                {t.observatii ? `  ${t.observatii}` : ''}
                              </p>
                            </div>
                          </div>

                          <div className="treatment-progress-row">
                            <span>
                              {esteInPauza ? 'Pauza tratament' : 'Progres tratament'}
                            </span>
                            <strong>
                              {info
                                ? esteInPauza
                                  ? `Ziua ${info.ziCurenta} din ${info.durataEtapa} de pauza`
                                  : `Ziua ${info.ziCurenta} din ${info.durataEtapa}`
                                : 'In pregatire'}
                            </strong>
                          </div>
                          <div className="treatment-progress-bar">
                            <span style={{ width: `${progressPercent}%` }}></span>
                          </div>

                          <div className="treatment-week-card">
                            <div className="treatment-week-header">
                              <strong>Calendar saptamanal</strong>
                              <span>
                                {esteInPauza
                                  ? 'Blocat in perioada de pauza'
                                  : 'Saptamana curenta'}
                              </span>
                            </div>

                            {esteInPauza && (
                              <p className="treatment-pause-note">
                                Tratamentul este in pauza. Nu trebuie bifata
                                administrarea pana la reluarea ciclului.
                              </p>
                            )}

                            <div className="treatment-week-days">
                              {calendarDays.map((day) => {
                                const isChecked = administrariDateKeys.has(day.key)
                                const isFuture = day.key > todayKey
                                const isToday = day.key === todayKey
                                const dayStatus = getTreatmentDayStatus(t, day.key, administrari)
                                const canCheckDay = dayStatus.className === 'scheduled' && !isFuture && !showArchivedTreatments

                                return (
                                  <label
                                    key={day.key}
                                    className={`treatment-week-day ${
                                      isToday ? 'today' : ''
                                    } ${isChecked ? 'checked' : ''} ${
                                      !canCheckDay && !isChecked ? 'locked' : ''
                                    } ${dayStatus.className}`}
                                    title={dayStatus.tooltip}
                                  >
                                    <span>{day.label}</span>
                                    <strong>{day.day}</strong>
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      disabled={
                                        isChecked ||
                                        !canCheckDay ||
                                        savingAdministrareId === t.id
                                      }
                                      onChange={() =>
                                        salveazaAdministrareTratament(t.id, day.key)
                                      }
                                    />
                                    <em>{isChecked ? '' : ''}</em>
                                  </label>
                                )
                              })}
                            </div>
                          </div>

                          <div className="treatment-feature-bottom">
                            <div>
                              <span>Ultima doza</span>
                              <strong>
                                {ultimaAdministrare
                                  ? formatDate(ultimaAdministrare.data_administrare)
                                  : 'Nu exista inca'}
                              </strong>
                            </div>
                            <div>
                              <span>Durata ramasa</span>
                              <strong>
                                {(() => {
                                  const durataTotala = Number(t.durata_administrare) || 0
                                  const faraPauza = !Number(t.durata_pauza)
                                  const ramaseDupaBifari = faraPauza && durataTotala > 0
                                    ? Math.max(durataTotala - administrari.length, 0)
                                    : zileRamaseAfisate
                                  return ramaseDupaBifari !== null ? `${ramaseDupaBifari} zile` : 'N/A'
                                })()}
                              </strong>
                            </div>
                            <div>
                              <span>Doze bifate</span>
                              <strong>{adherence}%</strong>
                            </div>
                            <button
                              className="treatment-confirm-button"
                              onClick={() => salveazaAdministrareTratament(t.id)}
                              disabled={
                                showArchivedTreatments ||
                                esteInPauza ||
                                savingAdministrareId === t.id ||
                                administratAzi
                              }
                            >
                              {showArchivedTreatments ? 'Arhivat' : esteInPauza ? 'In pauza' : savingAdministrareId === t.id ? 'Se salveaza...' : administratAzi ? 'Administrat' : 'Confirma azi'}
                            </button>
                            {!showArchivedTreatments && (
                              <button
                                className="treatment-finish-button"
                                type="button"
                                onClick={() => finalizeazaTratament(t.id)}
                              >
                                <Archive size={16} />
                                Finalizeaza
                              </button>
                            )}
                          </div>
                        </article>
                      )
                    })}
                  </div>
                )}

                {tratamenteAfisate.length > 0 && !showArchivedTreatments && (
                  <button
                    type="button"
                    className="treatment-plan-card treatment-plan-card-secondary"
                    onClick={deschideFormTratament}
                  >
                    <span><Plus size={22} /></span>
                    <strong>Planifica un tratament nou</strong>
                    <p>
                      Mentine istoricul medical la zi adaugand tratamente periodice,
                      suplimente sau recomandari primite de la veterinar.
                    </p>
                  </button>
                )}

                <button
                  type="button"
                  className="treatment-archive-panel treatment-archive-soft"
                  onClick={() => setShowArchivedTreatments(true)}
                >
                  <div>
                    <span>Istoric tratamente</span>
                    <strong>Tratamente finalizate / arhivate</strong>
                    <p>
                      Tratamentele incheiate raman separate, ca lista principala sa
                      fie concentrata pe ce este activ acum.
                    </p>
                  </div>
                  <span className="archive-count">{tratamenteFinalizate.length}</span>
                </button>
              </div>

              <aside className="treatment-right-rail">
                <section className="treatment-recovery-card">
                  <span className="rail-kicker">Insights</span>
                  <h3>Recuperare</h3>
                  <div className="rail-insight-list">
                    <div>
                      <span><Footprints size={16} /></span>
                      <p>
                        <strong>Mobilitate urmarita</strong>
                        Compara simptomele recente cu zilele de administrare.
                      </p>
                    </div>
                    <div>
                      <span><AlertCircle size={16} /></span>
                      <p>
                        <strong>Verificare stoc</strong>
                        Mai ai doze pentru{' '}
                        {tratamentePrincipale[0]?.nume || 'tratamentul curent'}
                      </p>
                    </div>
                    <div>
                      <span><CalendarCheck size={16} /></span>
                      <p>
                        <strong>Check-up periodic</strong>
                        Noteaza reactiile observate in timpul tratamentului.
                      </p>
                    </div>
                  </div>
                  <div className="recovery-bars">
                    <span></span>
                    <span></span>
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </section>

                <section className="treatment-recent-card">
                  <div className="rail-card-title">
                    <h3>Istoric Recent</h3>
                    <button type="button" onClick={() => setShowArchivedTreatments(true)}>
                      Vezi arhivate
                    </button>
                  </div>

                  <div className="recent-dose-list">
                    {administrariRecente.length > 0 ? (
                      administrariRecente.map((administrare) => (
                        <div key={administrare.id}>
                          <span></span>
                          <p>
                            <strong>Doza administrata</strong>
                            {formatDate(administrare.data)}  {administrare.nume}
                          </p>
                        </div>
                      ))
                    ) : (
                      <div>
                        <span></span>
                        <p>
                          <strong>Nu exista doze recente</strong>
                          Administrarile bifate vor aparea aici.
                        </p>
                      </div>
                    )}
                  </div>
                </section>

                <section className="treatment-symptom-card">
                  <h3>Monitorizare Simptome</h3>
                  <p>
                    Coreleaza starea lui {animal.nume} cu tratamentul curent pentru
                    observatii mai clare.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowEvaluationForm(true)}
                  >
                    Adauga in jurnal
                  </button>
                </section>
              </aside>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div id="health-history" className="profile-card timeline-card">
            <div className="section-header">
              <div>
                <h2>Timeline sanatate</h2>
                <p className="profile-text">
                  Un fir cronologic cu simptome, administrari si evenimente medicale.
                </p>
              </div>
              
            </div>

            <div className="health-timeline">
              {healthTimelineEvents.length === 0 ? (
                <div className="health-timeline-empty">
                  <strong>Istoricul este momentan gol</strong>
                  <p>
                    Primele simptome raportate, tratamente incepute si administrari bifate
                    vor aparea aici dupa ce incepi monitorizarea.
                  </p>
                </div>
              ) : (
                <>
                  {previewTimelineEvents.map((event, index) => (
                    <div key={`${event.title}-${index}`} className="timeline-event">
                      <span>{formatDate(event.date)}</span>
                      <div>
                        <strong>{event.title}</strong>
                        <p>{event.text}</p>
                      </div>
                    </div>
                  ))}

                  <button
                    className="health-timeline-more"
                    type="button"
                    onClick={() => navigate(`/animal/${animalId}/istoric`)}
                  >
                    <span>...</span>
                    {hiddenTimelineEvents > 0
                      ? `Inca ${hiddenTimelineEvents} inregistrari in istoricul complet`
                      : 'Vezi istoricul complet'}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {activeTab === 'medical' && (
  <div id="health-booklet" className="medical-premium-layout">
    <div className="medical-main-column">
      <section className="medical-identity-card">
            <div className="medical-card-header">
              <div>
                <span className="medical-eyebrow">Identificare animal & proprietar</span>
                <h2>Carnetul lui {animal.nume}</h2>
              </div>
      
              <button
                className="medical-edit-button"
                type="button"
                onClick={() => {
                  setOwnerForm(ownerInfo)
                  setShowOwnerForm(true)
                }}
              >
                <Edit3 size={16} />
                Modifică date proprietar
              </button>
            </div>
      
            <div className="medical-section-title">Date proprietar</div>
      
            <div className="medical-pill-grid">
              {[
                ['Nume și prenume', ownerInfo.name || 'De completat'],
                ['Telefon', ownerInfo.phone || 'De completat'],
                ['Adresă', ownerInfo.address || 'De completat']
              ].map(([label, value]) => (
                <div key={label} className="medical-pill">
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
      
            <div className="medical-section-title">Date animal</div>
      
            <div className="medical-pill-grid">
              {[
                ['Nume pet', animal.nume],
                ['Rasă', animal.rasa || 'Nespecificată'],
                ['Sex', animal.sex || 'Nespecificat'],
                ['Data nașterii', animal.data_nasterii ? formatDate(animal.data_nasterii) : 'De completat'],
                ['Culoare', animal.culoare || 'De completat'],
                ['Microcip', microcipText]
              ].map(([label, value]) => (
                <div key={label} className="medical-pill">
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </section>

      <section className="medical-history-premium">
            <div className="medical-card-header">
              <div>
                <span className="medical-eyebrow">Istoric de sănătate</span>
                <h2>Înregistrări medicale</h2>
              </div>
      
              <button
                className="primary-button medical-add-record-button"
                type="button"
                onClick={() => openMedicalRecordForm('vaccin')}
              >
                <Plus size={16} />
                Adaugă în carnet
              </button>
            </div>
      
            <div className="medical-history-grid">
              {[
                ['vaccin', 'Vaccinări', 'Datele vaccinurilor și următoarele rapeluri.', <Syringe size={18} />],
                ['deparazitare', 'Deparazitări', 'Internă, externă și următoarele date recomandate.', <Shield size={18} />],
                ['tratament', 'Tratamente prescrise', 'Tratamente recomandate sau administrate.', <Pill size={18} />],
                ['control', 'Vizite de control', 'Consultații, motive și recomandări.', <Stethoscope size={18} />]
              ].map(([type, title, emptyText, icon]) => {
                const records = getMedicalRecords(type)
      
                return (
                  <div key={type} className="medical-history-card" style={{ justifyContent: 'flex-start', gap: '10px' }}>
                    <div className="medical-history-icon">{icon}</div>
      
                    <h3>{title}</h3>
      
                    <p style={{ margin: '0 0 2px' }}>{records.length ? `${records.length} înregistrări salvate. Deschide pentru detalii.` : emptyText}</p>
      
                    <button
                      type="button"
                      style={{ marginTop: 0 }}
                      onClick={() => openMedicalRecordForm(type)}
                    >
                      Adaugă / vezi detalii →
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
    </div>

    <aside className="medical-side-panel">
          <div className="health-score-card">
            <span>Sumar sănătate</span>
    
            <div className="health-score-row">
              <div className="health-score-circle">
                {healthIndex}%
              </div>
    
              <div>
                <small>Index sănătate</small>
                <strong>{healthIndexLabel}</strong>
              </div>
            </div>
    
            <div className={`medical-alert-pill ${vaccineStatusLabel === 'La zi' ? '' : 'warning'}`}>
              <span>Vaccin anual</span>
              <strong>{vaccineStatusLabel}</strong>
            </div>
    
            <div className={`medical-alert-pill ${dewormingStatus.isComplete ? '' : 'warning'}`}>
              <span>Deparazitări</span>
              <strong>{dewormingStatus.label}</strong>
            </div>
          </div>
    
          <div className="premium-support-card">
            <div className="premium-support-image">
            <img src="/vet-support.jpeg" alt="Medic veterinar cu animale de companie" />
          </div>
            <span>Consiliere veterinară</span>
            <strong>Ai nevoie de ajutor?</strong>
            <p>Notează întrebările pentru medic sau programează o verificare.</p>
    
            <button type="button" onClick={() => setShowVetSupport(true)}>
              Programează o consultatie
            </button>
          </div>
    
          <div className="medical-reminders-card">
            <span>Memento-uri</span>
    
            <div>
              <CalendarCheck size={18} />
              <p>
                <strong>Vaccin anual</strong>
                <small>{latestAnnualVaccine ? `Urmatorul vaccin: ${nextAnnualVaccineDate || 'de completat'}.` : 'Adaugă data pentru reminder.'}</small>
              </p>
            </div>
    
            <div>
              <Shield size={18} />
              <p>
                <strong>Deparazitări</strong>
                <small>{dewormingStatus.isComplete ? 'Internă și externă sunt la zi.' : dewormingStatus.label}</small>
              </p>
            </div>
          </div>
        </aside>
  </div>
)}
      </section>


{showEvaluationForm && (
        <div
          className="evaluation-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowEvaluationForm(false)
            }
          }}
        >
          <div
            id="preventive-evaluation"
            className="evaluation-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="evaluation-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="evaluation-modal-header">
              <span className="evaluation-modal-icon"><ClipboardList size={26} /></span>
              <div>
                <h3 id="evaluation-modal-title">Evaluare preventiva</h3>
                <p>Raporteaza simptom nou</p>
              </div>

              <button
                className="evaluation-modal-close"
                type="button"
                aria-label="Inchide evaluarea"
                onClick={() => setShowEvaluationForm(false)}
              >
                <X size={20} />
              </button>
            </div>

            <div className="evaluation-modal-body">
              <label className="form-label">Cauta simptom</label>
              <div className="evaluation-modal-search">
                <span className="evaluation-search-icon"></span>
                <input
                  className="search-input"
                  type="text"
                  placeholder="Ex: schiopatat, varsaturi, tuse..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="evaluation-symptom-grid">
                {simptomeFiltrate.map((simptom) => (
                  <label
                    key={simptom.id}
                    className={`evaluation-symptom-option ${
                      selectedSimptome.includes(simptom.id) ? 'selected' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedSimptome.includes(simptom.id)}
                      onChange={() => toggleSimptom(simptom.id)}
                    />
                    <span>{simptom.nume_afisare}</span>
                  </label>
                ))}
              </div>

              <div className="evaluation-modal-grid">
                <div>
                  <label className="form-label">Intensitate</label>
                  <select
                    className="form-select"
                    value={severitate}
                    onChange={(e) => setSeveritate(e.target.value)}
                  >
                    <option value="usoara">Usoara</option>
                    <option value="medie">Medie</option>
                    <option value="ridicata">Ridicata</option>
                  </select>
                </div>

                <div>
                  <label className="form-label">Frecventa</label>
                  <select
                    className="form-select"
                    value={frecventa}
                    onChange={(e) => setFrecventa(e.target.value)}
                  >
                    <option value="rar">Rar</option>
                    <option value="ocazional">Ocazional</option>
                    <option value="des">Des</option>
                  </select>
                </div>
              </div>

              <label className="form-label">Observatii suplimentare</label>
              <textarea
                className="form-textarea"
                placeholder="Ex: a aparut dimineata, dupa masa, dupa efort etc."
                value={observatii}
                onChange={(e) => setObservatii(e.target.value)}
              />
            </div>

            <div className="evaluation-modal-footer">
              <p>
                <span>i</span>
                Aceasta evaluare nu inlocuieste consultul medical.
              </p>
              <div className="evaluation-modal-actions">
                <button
                  className="primary-button"
                  type="button"
                  onClick={genereazaEvaluare}
                >
                  {loadingAnaliza ? 'Se genereaza...' : 'Genereaza evaluarea'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showTratamentForm && (
        <div
          className="evaluation-modal-backdrop treatment-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeTreatmentForm()
            }
          }}
        >
          <div
            className="evaluation-modal treatment-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="treatment-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="evaluation-modal-header">
              <span className="evaluation-modal-icon">+</span>
              <div>
                <h3 id="treatment-modal-title">Tratament nou</h3>
                <p>Planifica administrare</p>
              </div>

              <div className="modal-header-actions">
                <button
                  className="modal-icon-save"
                  type="button"
                  aria-label="Salveaza tratamentul"
                  title="Salveaza"
                  onClick={adaugaTratament}
                >
                  <CheckCircle2 size={20} />
                </button>
                <button
                  className="evaluation-modal-close"
                  type="button"
                  aria-label="Inchide formularul de tratament"
                  onClick={closeTreatmentForm}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="evaluation-modal-body treatment-modal-body">
              <label className="form-label">Nume tratament</label>
              <input
                className="search-input"
                placeholder="Ex: Vitamine articulatii"
                value={numeTratament}
                onChange={(e) => setNumeTratament(e.target.value)}
                autoFocus
              />

              <div className="treatment-modal-grid">
                <div>
                  <label className="form-label">Durata administrare (zile)</label>
                  <input
                    type="number"
                    className="form-select"
                    value={durataAdministrare}
                    onChange={(e) => setDurataAdministrare(e.target.value)}
                  />
                </div>

                <div>
                  <label className="form-label">Durata pauza (zile)</label>
                  <input
                    type="number"
                    className="form-select"
                    value={durataPauza}
                    onChange={(e) => setDurataPauza(e.target.value)}
                  />
                </div>
              </div>

              <label className="form-label">Data start</label>
              <input
                className="form-select"
                inputMode="numeric"
                maxLength={10}
                placeholder="dd/mm/yyyy"
                value={dataStart}
                onChange={(e) => setDataStart(formatMedicalDateInput(e.target.value))}
              />

              <label className="form-label">Observatii</label>
              <textarea
                className="form-textarea"
                placeholder="Ex: administrare zilnica dimineata"
                value={observatiiTratament}
                onChange={(e) => setObservatiiTratament(e.target.value)}
              />
            </div>

          </div>
        </div>
      )}

      {showMedicalForm && (
        <div
          className="medical-entry-modal"
          role="dialog"
          aria-modal="true"
          style={{ alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: '24px' }}
        >
          <div
            className="medical-entry-panel"
            style={{ maxHeight: '88vh', overflowY: 'auto', overflowX: 'hidden', boxSizing: 'border-box' }}
          >
            <div className="medical-entry-header">
              <div>
                <span>Carnet de sanatate</span>
                <h2>Adauga o inregistrare</h2>
                <p>Noteaza informatia importanta pentru profilul lui {animal.nume}.</p>
              </div>
              <div className="medical-entry-header-actions">
                <button
                  className="medical-entry-icon-save"
                  type="button"
                  aria-label="Salveaza inregistrarea"
                  onClick={saveMedicalRecord}
                  title="Salveaza"
                >
                  <CheckCircle size={20} />
                </button>
                <button
                  className="photo-editor-close"
                  type="button"
                  aria-label="Inchide formularul"
                  onClick={closeMedicalRecordForm}
                  title="Inchide"
                >
                  <X size={22} />
                </button>
              </div>
            </div>

            <div className="medical-entry-form">
              <label>
                <span>Tip inregistrare</span>
                <select
                  className="form-select"
                  value={medicalForm.type}
                  onChange={(event) => updateMedicalForm('type', event.target.value)}
                >
                  <option value="vaccin">Vaccinare</option>
                  <option value="deparazitare">Deparazitare</option>
                  <option value="interventie">Interventie / operatie</option>
                  <option value="tratament">Tratament prescris</option>
                  <option value="control">Vizita de control</option>
                </select>
              </label>

              <label>
                <span>Data (optional)</span>
                <input
                  className="search-input"
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="dd/mm/yyyy"
                  value={medicalForm.date}
                  onChange={(event) =>
                    updateMedicalForm('date', formatMedicalDateInput(event.target.value))
                  }
                />
              </label>

              {medicalForm.type === 'deparazitare' && (
                <label>
                  <span>Tip deparazitare</span>
                  <select
                    className="form-select"
                    value={medicalForm.category}
                    onChange={(event) => updateMedicalForm('category', event.target.value)}
                  >
                    <option value="">Nespecificat</option>
                    <option value="Interna">Interna</option>
                    <option value="Externa">Externa</option>
                  </select>
                </label>
              )}

              {(medicalForm.type === 'vaccin' || medicalForm.type === 'deparazitare') && (
                <label>
                  <span>
                    {medicalForm.type === 'vaccin' ? 'Tip vaccin' : 'Produs administrat'}
                  </span>
                  <input
                    className="search-input"
                    placeholder="Optional"
                    value={medicalForm.product}
                    onChange={(event) => updateMedicalForm('product', event.target.value)}
                  />
                </label>
              )}

              {['vaccin', 'deparazitare', 'control'].includes(medicalForm.type) && (
                <label>
                  <span>Urmatoarea data recomandata</span>
                  <input
                    className="search-input"
                    placeholder={medicalForm.type === 'deparazitare' && !medicalForm.category ? 'Alege tipul deparazitarii' : 'Se completeaza dupa data completa'}
                    value={medicalForm.nextDate}
                    readOnly
                    disabled
                  />
                </label>
              )}

              {medicalForm.type === 'tratament' && (
                <label className="wide">
                  <span>Boala / diagnostic</span>
                  <input
                    className="search-input"
                    placeholder="Completeaza daca exista un diagnostic"
                    value={medicalForm.diagnosis}
                    onChange={(event) => updateMedicalForm('diagnosis', event.target.value)}
                  />
                </label>
              )}

              <label className="wide">
                <span>
                  {medicalForm.type === 'interventie'
                    ? 'Descriere interventie'
                    : medicalForm.type === 'tratament'
                      ? 'Tratament aplicat / medicamente prescrise'
                      : medicalForm.type === 'control'
                        ? 'Motivul vizitei'
                        : 'Observatii'}
                </span>
                <textarea
                  className="form-textarea"
                  placeholder="Completeaza doar informatiile pe care le ai"
                  value={medicalForm.details}
                  onChange={(event) => updateMedicalForm('details', event.target.value)}
                />
              </label>
            </div>

            {getMedicalRecords(medicalForm.type).length > 0 ? (
              <div
                className="medical-entry-existing"
                style={{ maxHeight: '190px', overflowY: 'auto', overflowX: 'hidden', paddingRight: '8px', marginRight: 0, boxSizing: 'border-box' }}
              >
                <span>Inregistrari existente</span>
                {getMedicalRecordRows(getMedicalRecords(medicalForm.type))}
              </div>
            ) : null}

            <div className="medical-entry-actions medical-entry-actions-hidden" aria-hidden="true" />
          </div>
        </div>
      )}


      {showWeightTracker && (
        <div
          className="medical-entry-modal weight-tracker-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="weight-tracker-title"
        >
          <div className="weight-tracker-panel">
            <div className="weight-tracker-header">
              <div>
                <span>Tracking greutate</span>
                <h2 id="weight-tracker-title">Evoluția greutății - {animal.nume}</h2>
                <p>Adaugă o măsurătoare nouă doar când dorești să urmărești evoluția.</p>
              </div>
              <div className="modal-header-actions">
                <button
                  className="modal-icon-save"
                  type="button"
                  aria-label="Salveaza greutatea"
                  title="Salveaza"
                  onClick={saveWeightEntry}
                >
                  <CheckCircle2 size={20} />
                </button>
                <button
                  className="photo-editor-close"
                  type="button"
                  aria-label="Închide tracking greutate"
                  onClick={() => setShowWeightTracker(false)}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="weight-tracker-form">
              <label>
                <span>Greutate (kg)</span>
                <input
                  className="search-input"
                  type="number"
                  min="0"
                  step="0.1"
                  placeholder="Ex: 8.2"
                  value={weightForm.weight}
                  onChange={(event) =>
                    setWeightForm((current) => ({ ...current, weight: event.target.value }))
                  }
                />
              </label>
              <label>
                <span>Data înregistrării</span>
                <input
                  className="search-input"
                  type="text"
                  inputMode="numeric"
                  maxLength="10"
                  placeholder="dd/mm/yyyy"
                  value={weightForm.date}
                  onChange={(event) =>
                    setWeightForm((current) => ({
                      ...current,
                      date: formatMedicalDateInput(event.target.value)
                    }))
                  }
                />
              </label>
              <label className="wide">
                <span>Observații opționale</span>
                <textarea
                  className="form-textarea"
                  placeholder="Ex: cântărit acasă, după control veterinar..."
                  value={weightForm.notes}
                  onChange={(event) =>
                    setWeightForm((current) => ({ ...current, notes: event.target.value }))
                  }
                />
              </label>
            </div>

            <div className="weight-chart-card">
              <div className="weight-chart-head">
                <span>Istoric greutate</span>
                <strong>{weightChartData.length ? `${weightChartData.length} măsurători recente` : 'Fără măsurători'}</strong>
              </div>

              <div className="weight-chart-area">
                {weightChartData.length ? (
                  weightChartData.map((entry) => {
                    const height = 18 + ((entry.value - minWeightValue) / weightRange) * 72

                    return (
                      <div className="weight-chart-column" key={`${entry.id}-${entry.data_inregistrare}`}>
                        <div className="weight-chart-bar-wrap">
                          <span
                            className="weight-chart-bar"
                            style={{ height: `${height}%` }}
                            title={`${formatWeightValue(entry.greutate)} · ${formatCompactDate(entry.data_inregistrare)}`}
                          />
                        </div>
                        <strong>{formatWeightValue(entry.greutate)}</strong>
                        <small>{entry.label}</small>
                      </div>
                    )
                  })
                ) : (
                  <div className="weight-chart-empty">
                    <strong>Nu există încă date.</strong>
                    <p>Prima greutate salvată va apărea aici.</p>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {showDailyJournal && (
        <div
          className="medical-entry-modal wellness-journal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="daily-journal-title"
        >
          <div className="wellness-journal-panel">
            <div className="wellness-journal-header">
              <div>
                <span className="wellness-journal-eyebrow">Jurnal zilnic</span>
                <h2 id="daily-journal-title">Actualizare stare - {animal.nume}</h2>
              </div>

              <div className="wellness-journal-date">
                <span>Data inregistrarii</span>
                <strong>
                  <CalendarCheck size={18} />
                  {formatJournalDisplayDate(dailyJournalForm.date)}
                </strong>
              </div>
            </div>

            <div className="wellness-journal-body">
              <div className="wellness-score-section">
                <div className="wellness-score-header">
                  <span>Apetit (0-10)</span>
                  <small>0 = refuz total • 10 = crescut</small>
                </div>

                <div className="wellness-score-selector" aria-label="Selecteaza nivelul apetitului">
                  {Array.from({ length: 11 }, (_, score) => (
                    <button
                      key={`appetite-${score}`}
                      type="button"
                      className={Number(dailyJournalForm.appetite) === score ? 'active' : ''}
                      onClick={() => updateDailyJournalScore('appetite', score)}
                    >
                      {score}
                    </button>
                  ))}
                </div>
              </div>

              <div className="wellness-score-section">
                <div className="wellness-score-header">
                  <span>Mobilitate (0-10)</span>
                  <small>0 = imobil • 10 = activ</small>
                </div>

                <div className="wellness-score-selector" aria-label="Selecteaza nivelul mobilitatii">
                  {Array.from({ length: 11 }, (_, score) => (
                    <button
                      key={`mobility-${score}`}
                      type="button"
                      className={Number(dailyJournalForm.mobility) === score ? 'active' : ''}
                      onClick={() => updateDailyJournalScore('mobility', score)}
                    >
                      {score}
                    </button>
                  ))}
                </div>
              </div>

              <div className="wellness-chart-card">
                <div className="wellness-chart-head">
                  <span>Tendinta ultimele 7 zile</span>
                  <div className="wellness-chart-legend">
                    <strong><i className="appetite"></i>Apetit</strong>
                    <strong><i className="mobility"></i>Mobilitate</strong>
                  </div>
                </div>

                <div className="wellness-chart-area">
                  <div className="wellness-chart-scale">
                    <span>10</span>
                    <span>5</span>
                    <span>0</span>
                  </div>

                  <div className="wellness-chart-bars-grid">
                    {dailyJournalChart.map((day) => {
                      const isSelectedDate = day.date === dailyJournalForm.date
                      const appetiteValue = isSelectedDate
                        ? Number(dailyJournalForm.appetite)
                        : Number(day.appetite || 0)
                      const mobilityValue = isSelectedDate
                        ? Number(dailyJournalForm.mobility)
                        : Number(day.mobility || 0)
                      const hasVisualEntry = day.hasEntry || isSelectedDate

                      return (
                        <div
                          key={day.date}
                          className={`wellness-chart-day ${isSelectedDate ? 'today' : ''}`}
                        >
                          <div className="wellness-bars">
                            <span
                              className="appetite"
                              style={{
                                height: `${hasVisualEntry ? Math.max(appetiteValue * 10, 5) : 0}%`
                              }}
                              title={`Apetit: ${hasVisualEntry ? appetiteValue : 'necompletat'}`}
                            ></span>
                            <span
                              className="mobility"
                              style={{
                                height: `${hasVisualEntry ? Math.max(mobilityValue * 10, 5) : 0}%`
                              }}
                              title={`Mobilitate: ${hasVisualEntry ? mobilityValue : 'necompletat'}`}
                            ></span>
                          </div>
                          <small>{day.label}</small>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="wellness-journal-footer">
              <button
                className="wellness-journal-cancel"
                type="button"
                onClick={() => setShowDailyJournal(false)}
              >
                Renunta
              </button>

              <button
                className="wellness-journal-save"
                type="button"
                onClick={saveDailyJournal}
              >
                <CheckCircle size={20} />
                Salveaza in jurnal
              </button>
            </div>
          </div>
        </div>
      )}

      {showOwnerForm && (
        <div
          className="medical-entry-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="owner-form-title"
        >
          <div className="medical-entry-panel sidebar-action-panel">
            <div className="medical-entry-header">
              <div>
                <span>Date proprietar</span>
                <h2 id="owner-form-title">Modifica datele proprietarului</h2>
                <p>Aceste date se sincronizeaza cu profilul utilizatorului si carnetul animalului.</p>
              </div>
              <button
                className="photo-editor-close"
                type="button"
                aria-label="Inchide datele proprietarului"
                onClick={() => setShowOwnerForm(false)}
              >
                <X size={20} />
              </button>
            </div>

            <div className="owner-form-grid">
              <label>
                <span>Nume si prenume</span>
                <input
                  className="search-input"
                  placeholder="Ex: Larisa Geambasu"
                  value={ownerForm.name}
                  onChange={(event) =>
                    setOwnerForm((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </label>
              <label>
                <span>Telefon</span>
                <input
                  className="search-input"
                  placeholder="Optional"
                  value={ownerForm.phone}
                  onChange={(event) =>
                    setOwnerForm((current) => ({ ...current, phone: event.target.value }))
                  }
                />
              </label>
              <label className="wide">
                <span>Adresa</span>
                <input
                  className="search-input"
                  placeholder="Optional"
                  value={ownerForm.address}
                  onChange={(event) =>
                    setOwnerForm((current) => ({ ...current, address: event.target.value }))
                  }
                />
              </label>
            </div>

            <div className="medical-entry-actions">
              <button className="secondary-button" type="button" onClick={() => setShowOwnerForm(false)}>
                Inchide
              </button>
              <button className="primary-button" type="button" onClick={saveOwnerInfo}>
                Salveaza datele
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div
          className="medical-entry-modal"
          role="dialog"
          aria-modal="true"
          style={{ alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: '24px' }}
        >
          <div className="medical-entry-panel sidebar-action-panel">
            <div className="medical-entry-header">
              <div>
                <span>Preferinte profil</span>
                <h2>Setari pentru {animal.nume}</h2>
                <p>Alege ce remindere vrei sa urmaresti in profil.</p>
              </div>
              <div className="modal-header-actions">
                <button
                  className="modal-icon-save"
                  type="button"
                  aria-label="Salveaza setarile"
                  title="Salveaza"
                  onClick={savePreferences}
                >
                  <CheckCircle2 size={20} />
                </button>
                <button
                  className="photo-editor-close"
                  type="button"
                  aria-label="Inchide setarile"
                  onClick={() => setShowSettings(false)}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="profile-settings-list">
              {[
                ['treatmentReminders', 'Reminder tratamente', 'Evidentiaza administrarile care trebuie verificate zilnic.'],
                ['vaccineReminders', 'Reminder vaccinari', 'Pastreaza vizibile vaccinarile care trebuie completate in carnet.'],
                ['parasiteReminders', 'Reminder deparazitari', 'Aminteste datele recomandate pentru ingrijirea periodica.']
              ].map(([field, label, text]) => (
                <label key={field} className="profile-setting-row">
                  <span>
                    <strong>{label}</strong>
                    <small>{text}</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={preferences[field]}
                    onChange={(event) =>
                      setPreferences((current) => ({
                        ...current,
                        [field]: event.target.checked
                      }))
                    }
                  />
                </label>
              ))}
            </div>

            <label className="sidebar-modal-field">
              <span>Telefon cabinet veterinar</span>
              <input
                className="search-input"
                type="tel"
                placeholder="Optional"
                value={vetPhone}
                onChange={(event) => setVetPhone(event.target.value)}
              />
            </label>

          </div>
        </div>
      )}

      {showVetSupport && (
        <div
          className="medical-entry-modal"
          role="dialog"
          aria-modal="true"
          style={{ alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: '24px' }}
        >
          <div className="medical-entry-panel sidebar-action-panel vet-support-panel">
            <div className="medical-entry-header">
              <div>
                <span>Asistenta veterinara</span>
                <h2>Ajutor pentru {animal.nume}</h2>
                <p>Alege rapid pasul potrivit pentru situatia observata.</p>
              </div>
              <button
                className="photo-editor-close"
                type="button"
                aria-label="Inchide asistenta veterinara"
                onClick={() => setShowVetSupport(false)}
              >
                <X size={20} />
              </button>
            </div>

            <div className="vet-support-notice">
              <strong>Este o urgenta</strong>
              <p>
                Pentru dificultati de respiratie, convulsii, sangerare puternica sau stare
                severa, contacteaza imediat un cabinet veterinar.
              </p>
            </div>

            <div className="vet-support-actions">
              {vetPhone.trim() ? (
                <a className="primary-button" href={`tel:${vetPhone.replace(/\s/g, '')}`}>
                  Suna cabinetul: {vetPhone}
                </a>
              ) : (
                <button className="secondary-button" type="button" onClick={() => {
                  setShowVetSupport(false)
                  setShowSettings(true)
                }}>
                  Adauga numarul cabinetului
                </button>
              )}
              <button className="secondary-button" type="button" onClick={openVetVisitForm}>
                Noteaza o vizita de control
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setShowVetSupport(false)
                  setActiveTab('health')
                  setShowEvaluationForm(true)
                }}
              >
                Raporteaza un simptom
              </button>
            </div>
          </div>
        </div>
      )}


      {selectedTreatmentCalendar && (
        <>
          <style>{`
            .treatment-month-trigger {
              width: 34px;
              height: 34px;
              border: 1px solid #d8dcff;
              border-radius: 12px;
              background: #ffffff;
              color: #4f46e5;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              cursor: pointer;
              transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
            }
            .treatment-month-trigger:hover {
              transform: translateY(-1px);
              border-color: #6d5dfc;
              box-shadow: 0 10px 22px rgba(79, 70, 229, 0.16);
            }
            .treatment-month-modal-backdrop {
              position: fixed;
              inset: 0;
              z-index: 10000;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 20px;
              background: rgba(38, 49, 73, 0.45);
              backdrop-filter: blur(8px);
            }
            .treatment-month-modal {
              width: min(860px, 94vw);
              max-height: none;
              overflow: visible;
              border: 1px solid #dbe4f0;
              border-radius: 28px;
              background: linear-gradient(135deg, #ffffff 0%, #fbfdff 72%, #f3efff 100%);
              box-shadow: 0 28px 70px rgba(15, 23, 42, 0.28);
            }
            .treatment-month-modal-header {
              display: flex;
              align-items: flex-start;
              justify-content: space-between;
              gap: 20px;
              padding: 18px 24px 12px;
              border-bottom: 1px solid #e4ecf7;
            }
            .treatment-month-modal-header span {
              display: block;
              margin-bottom: 6px;
              color: #4f46e5;
              font-size: 12px;
              font-weight: 900;
              letter-spacing: 0.12em;
              text-transform: uppercase;
            }
            .treatment-month-modal-header h3 {
              margin: 0;
              font-size: 28px;
              line-height: 1.1;
            }
            .treatment-month-modal-header p {
              margin: 6px 0 0;
              color: #64748b;
            }
            .treatment-month-close {
              width: 44px;
              height: 44px;
              border: 1px solid #dbe4f0;
              border-radius: 999px;
              background: #ffffff;
              color: #172033;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              cursor: pointer;
            }
            .treatment-month-modal-body {
              overflow: visible;
              padding: 14px 24px 22px;
            }
            .treatment-month-toolbar {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 16px;
              margin-bottom: 10px;
            }
            .treatment-month-toolbar strong {
              color: #172033;
              font-size: 18px;
              text-transform: capitalize;
            }
            .treatment-month-toolbar div {
              display: flex;
              gap: 7px;
            }
            .treatment-month-toolbar button {
              width: 38px;
              height: 38px;
              border: 1px solid #d8dcff;
              border-radius: 12px;
              background: #ffffff;
              color: #4f46e5;
              cursor: pointer;
              font-weight: 900;
            }
            .treatment-month-legend {
              display: flex;
              flex-wrap: wrap;
              gap: 10px;
              margin-bottom: 10px;
              color: #64748b;
              font-size: 13px;
              font-weight: 700;
            }
            .treatment-month-legend span {
              display: inline-flex;
              align-items: center;
              gap: 6px;
            }
            .treatment-month-legend i {
              width: 10px;
              height: 10px;
              border-radius: 999px;
              display: inline-block;
            }
            .treatment-month-legend .green { background: #22c55e; }
            .treatment-month-legend .blue { background: #426bff; }
            .treatment-month-legend .red { background: #ef4444; }
            .treatment-month-weekdays,
            .treatment-month-grid {
              display: grid;
              grid-template-columns: repeat(7, minmax(0, 1fr));
              gap: 7px;
            }
            .treatment-month-weekdays {
              margin-bottom: 8px;
            }
            .treatment-month-weekdays span {
              color: #64748b;
              font-size: 12px;
              font-weight: 900;
              text-align: center;
              text-transform: uppercase;
            }
            .treatment-month-day {
              position: relative;
              min-height: 50px;
              border: 1px solid #dbe4f0;
              border-radius: 14px;
              background: #ffffff;
              color: #172033;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              gap: 4px;
              font-weight: 600;
            }
            .treatment-month-day.muted {
              opacity: 0.38;
              background: #f8fafc;
              color: #94a3b8;
              border-color: #e5edf7;
            }
            .treatment-month-day.muted::after {
              border-color: #d7e0ec;
              opacity: 0.7;
            }
            .treatment-month-day.empty {
              visibility: hidden;
              pointer-events: none;
            }
            .treatment-month-day-number {
              font-size: 14px;
              font-weight: 700;
              line-height: 1;
            }

            .treatment-month-day::after {
              content: '';
              width: 8px;
              height: 8px;
              border-radius: 999px;
              border: 1.5px dashed #cbd5e1;
            }
            .treatment-month-day.administered {
              border-color: #bbf7d0;
              background: #f0fdf4;
            }
            .treatment-month-day.administered::after {
              border: 0;
              background: #22c55e;
            }
            .treatment-month-day.scheduled {
              border-color: #c7d2fe;
              background: #f5f7ff;
            }
            .treatment-month-day.scheduled::after {
              border: 0;
              background: #426bff;
            }
            .treatment-month-day.pause,
            .treatment-month-day.finished {
              border-color: #fecaca;
              background: #fff1f2;
            }
            .treatment-month-day.pause::after,
            .treatment-month-day.finished::after {
              border: 0;
              background: #ef4444;
            }
            .treatment-month-day.today {
              box-shadow: inset 0 0 0 2px #4f46e5;
            }
            .treatment-month-day small {
              display: none;
            }
            @media (max-width: 720px) {
              .treatment-month-modal-backdrop {
                padding: 14px;
              }
              .treatment-month-modal-header {
                padding: 22px 20px 16px;
              }
              .treatment-month-modal-body {
                padding: 18px 20px 22px;
              }
              .treatment-month-day {
                min-height: 56px;
                border-radius: 14px;
              }
              .treatment-month-day small {
                display: none;
              }
            }
          `}</style>
          <div
            className="treatment-month-modal-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label={`Calendar tratament ${selectedTreatmentCalendar.nume}`}
            onClick={closeTreatmentMonthCalendar}
          >
            <section className="treatment-month-modal" onClick={(event) => event.stopPropagation()}>
              <header className="treatment-month-modal-header">
                <div>
                  <span>Calendar tratament</span>
                  <h3>{selectedTreatmentCalendar.nume}</h3>
                  <p>
                    Verde = administrat, albastru = programat, rosu = pauza/finalizat.
                  </p>
                </div>
                <button
                  type="button"
                  className="treatment-month-close"
                  onClick={closeTreatmentMonthCalendar}
                  aria-label="Inchide calendarul"
                >
                  <X size={22} />
                </button>
              </header>

              <div className="treatment-month-modal-body">
                <div className="treatment-month-toolbar">
                  <strong>{selectedTreatmentMonthLabel}</strong>
                  <div>
                    <button type="button" onClick={() => changeTreatmentCalendarMonth(-1)} aria-label="Luna anterioara">
                      ‹
                    </button>
                    <button type="button" onClick={() => changeTreatmentCalendarMonth(1)} aria-label="Luna urmatoare">
                      ›
                    </button>
                  </div>
                </div>

                <div className="treatment-month-legend">
                  <span><i className="green" />Administrat</span>
                  <span><i className="blue" />Programat</span>
                  <span><i className="red" />Pauza / finalizat</span>
                </div>

                <div className="treatment-month-weekdays">
                  {['Dum', 'Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sam'].map((day) => (
                    <span key={day}>{day}</span>
                  ))}
                </div>

                <div className="treatment-month-grid">
                  {selectedTreatmentMonthDays.map((day) => {
                    const status = getTreatmentDayStatus(
                      selectedTreatmentCalendar,
                      day.key,
                      selectedTreatmentAdministrari
                    )

                    return day.isEmpty ? (
                      <div key={day.key} className="treatment-month-day empty" aria-hidden="true" />
                    ) : (
                      <button
                        key={day.key}
                        type="button"
                        className={`treatment-month-day ${status.className} ${day.key === todayKey ? 'today' : ''}`}
                        title={status.tooltip}
                        disabled={
                          status.className !== 'scheduled' ||
                          day.key > todayKey ||
                          savingAdministrareId === selectedTreatmentCalendar.id
                        }
                        onClick={() => salveazaAdministrareTratament(selectedTreatmentCalendar.id, day.key)}
                      >
                        <span className="treatment-month-day-number">{day.day}</span>
                        {status.label ? <small>{status.label}</small> : null}
                      </button>
                    )
                  })}
                </div>
              </div>
            </section>
          </div>
        </>
      )}

      {toastMessage && (
        <div className="petcare-toast" role="status" aria-live="polite">
          <span aria-hidden="true"><CheckCircle size={16} /></span>
          <p>{toastMessage}</p>
        </div>
      )}
        </div>
      </main>
    </div>
  )

}

export default AnimalPage

