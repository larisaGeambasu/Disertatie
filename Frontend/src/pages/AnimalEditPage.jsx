import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import {
  Home,
  HeartPulse,
  Pill,
  Activity,
  BookOpen,
  Settings,
  HelpCircle,
  Camera,
  Upload,
  Crop,
  Save,
  X,
  Sparkles,
  CalendarDays,
  PawPrint,
  Edit3,
  BadgeCheck,
  Trash2,
  AlertTriangle
} from 'lucide-react'
const splitDetailText = (value) => {
  if (!value) return []

  if (Array.isArray(value)) {
    return value.filter(Boolean)
  }

  return String(value)
    .split(/;|\n/)
    .map((item) => item.trim())
    .filter(Boolean)
}


const getShortBreedItems = (items, fallback = []) => {
  const source = items?.length ? items : fallback

  return source
    .map((item) => String(item).trim())
    .filter(Boolean)
    .slice(0, 4)
}

const normalizeBreedDetails = (details) => {
  if (!details) return null

  return {
    nivel_activitate: Number(details.nivel_activitate || 60),
    nivel_socializare: Number(details.nivel_socializare || 64),
    predispozitii: splitDetailText(details.predispozitii),
    de_urmarit: splitDetailText(details.de_urmarit),
    recomandari: splitDetailText(details.recomandari),
    fun_fact: details.fun_fact || ''
  }
}

const getGenericBreedDetails = (breedName, specie) => ({
  nivel_activitate: specie === 'caine' ? 72 : 62,
  nivel_socializare: specie === 'caine' ? 76 : 64,
  predispozitii: [
    'Informațiile pot varia în funcție de linia genetică și stilul de viață.',
    'Greutatea, mobilitatea și apetitul merită urmărite periodic.'
  ],
  de_urmarit: [
    'Notează schimbările de energie, apetit sau comportament.',
    'Compară simptomele observate cu rutina și tratamentele recente.'
  ],
  recomandari: [
    'Completează observațiile importante în profil.',
    'Păstrează controalele și vaccinările în carnetul de sănătate.'
  ],
  fun_fact: `${breedName} are un profil unic, iar monitorizarea constantă ajută la observarea schimbărilor mici.`
})

function AnimalEditPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const animalId = Number(id)
  const [dataNasterii, setDataNasterii] = useState('')
  const [specie, setSpecie] = useState('')
  const [form, setForm] = useState({})
  const [microcipStatus, setMicrocipStatus] = useState('')
  const [photoPreview, setPhotoPreview] = useState('')
  const [photoData, setPhotoData] = useState('')
  const [photoCrop, setPhotoCrop] = useState({ x: 50, y: 50 })
  const [photoZoom, setPhotoZoom] = useState(1)
  const [showPhotoEditor, setShowPhotoEditor] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savingPhoto, setSavingPhoto] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [photoMessage, setPhotoMessage] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletingAnimal, setDeletingAnimal] = useState(false)
  const [deleteMessage, setDeleteMessage] = useState('')
  const dragState = useRef(null)

  const formatDateInput = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 8)
    const day = digits.slice(0, 2)
    const month = digits.slice(2, 4)
    const year = digits.slice(4, 8)

    return [day, month, year].filter(Boolean).join('/')
  }

  const handlePhotoChange = (event) => {
    const file = event.target.files?.[0]

    if (!file) return

    const reader = new FileReader()

    reader.onload = () => {
      const imageData = String(reader.result)
      setPhotoPreview(imageData)
      setPhotoData(imageData)
      setPhotoCrop({ x: 50, y: 50 })
      setPhotoZoom(1)
      setPhotoMessage('Incadreaza fotografia, apoi salveaz-o direct de aici.')
      setShowPhotoEditor(true)
    }

    reader.readAsDataURL(file)
  }

  const updateCropFromPointer = (event) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const cropSize = 300
    const minX = (cropSize / 2 / rect.width) * 100
    const maxX = 100 - minX
    const minY = (cropSize / 2 / rect.height) * 100
    const maxY = 100 - minY
    const nextX = ((event.clientX - rect.left) / rect.width) * 100
    const nextY = ((event.clientY - rect.top) / rect.height) * 100

    setPhotoCrop({
      x: Math.max(minX, Math.min(maxX, nextX)),
      y: Math.max(minY, Math.min(maxY, nextY))
    })
  }

  const startPhotoDrag = (event) => {
    if (!photoPreview && !animal.fotografie_url) return

    event.currentTarget.setPointerCapture(event.pointerId)
    dragState.current = true
    updateCropFromPointer(event)
  }

  const movePhotoDrag = (event) => {
    if (!dragState.current) return

    updateCropFromPointer(event)
  }

  const stopPhotoDrag = () => {
    dragState.current = null
  }

  const handlePhotoWheel = (event) => {
    if (!photoPreview && !animal.fotografie_url) return

    event.preventDefault()
    setPhotoZoom((current) => {
      const nextZoom = current + (event.deltaY > 0 ? -0.05 : 0.05)
      return Math.max(1, Math.min(2.2, Number(nextZoom.toFixed(2))))
    })
  }

  const formatDateForInput = (value) => {
    if (!value) return ''

    const [year, month, day] = String(value).slice(0, 10).split('-')
    return day && month && year ? `${day}/${month}/${year}` : ''
  }

  const formatDateForApi = (value) => {
    if (!value) return null

    const [day, month, year] = value.split('/')
    return day && month && year ? `${year}-${month}-${day}` : null
  }

  const createCroppedPhoto = () => {
    const imageSource = photoData || photoPreview || animal.fotografie_url

    if (!imageSource || (!photoData && !showPhotoEditor)) {
      return Promise.resolve(null)
    }

    return new Promise((resolve, reject) => {
      const image = new Image()
      image.crossOrigin = 'anonymous'

      image.onload = () => {
        const cropSize = Math.min(image.naturalWidth, image.naturalHeight) / photoZoom
        const centerX = (photoCrop.x / 100) * image.naturalWidth
        const centerY = (photoCrop.y / 100) * image.naturalHeight
        const sourceX = Math.max(0, Math.min(image.naturalWidth - cropSize, centerX - cropSize / 2))
        const sourceY = Math.max(0, Math.min(image.naturalHeight - cropSize, centerY - cropSize / 2))
        const canvas = document.createElement('canvas')
        canvas.width = 600
        canvas.height = 600
        canvas.getContext('2d').drawImage(
          image,
          sourceX,
          sourceY,
          cropSize,
          cropSize,
          0,
          0,
          canvas.width,
          canvas.height
        )
        resolve(canvas.toDataURL('image/jpeg', 0.88))
      }

      image.onerror = reject
      image.src = imageSource
    })
  }

  const { data: animale, isLoading, error } = useQuery({
    queryKey: ['animale'],
    queryFn: async () => {
      const response = await axios.get('http://127.0.0.1:8000/animale')
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

  const animal = (animale || []).find((item) => item.id === animalId)
  const specieSelectata = specie || animal?.specie || 'pisica'
  const raseFiltrate = rase.filter((rasa) => rasa.specie === specieSelectata)
  const selectedBreedId = form.rasa_id ? Number(form.rasa_id) : null

  const { data: breedDetailsFromApi } = useQuery({
    queryKey: ['rase-detalii', selectedBreedId],
    enabled: Boolean(selectedBreedId),
    queryFn: async () => {
      const response = await axios.get(`http://127.0.0.1:8000/rase-detalii/${selectedBreedId}`)
      return response.data
    },
    retry: false
  })


  useEffect(() => {
    if (!animal) return

    const rasaCurenta = rase.find(
      (rasa) => rasa.specie === animal.specie && rasa.nume === animal.rasa
    )

    setSpecie(animal.specie || 'pisica')
    setDataNasterii(formatDateForInput(animal.data_nasterii))
    setMicrocipStatus(
      animal.microcip === 'fara_microcip'
        ? 'nu'
        : animal.microcip === 'necunoscut'
          ? 'necunoscut'
          : animal.microcip
            ? 'da'
            : ''
    )
    setForm({
      nume: animal.nume || '',
      rasa_id: animal.rasa_id
        ? String(animal.rasa_id)
        : rasaCurenta
          ? String(rasaCurenta.id)
          : '',
      sex: animal.sex || '',
      greutate: animal.greutate || '',
      culoare: animal.culoare || '',
      sterilizat:
        animal.sterilizat === null || animal.sterilizat === undefined
          ? ''
          : animal.sterilizat
            ? 'da'
            : 'nu',
      microcip:
        animal.microcip === 'fara_microcip' || animal.microcip === 'necunoscut'
          ? ''
          : animal.microcip || '',
      observatii_generale: animal.observatii_generale || ''
    })
  }, [animal, rase])

  const updateForm = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const getProfilePayload = (fotografieData = null) => ({
    nume: form.nume.trim(),
    specie: specieSelectata,
    rasa_id: form.rasa_id ? Number(form.rasa_id) : null,
    varsta: animal.varsta || null,
    greutate: form.greutate === '' ? null : Number(form.greutate),
    sex: form.sex || null,
    culoare: form.culoare || null,
    data_nasterii: formatDateForApi(dataNasterii),
    sterilizat: form.sterilizat === '' ? null : form.sterilizat === 'da',
    microcip:
      microcipStatus === 'da'
        ? form.microcip || null
        : microcipStatus === 'nu'
          ? 'fara_microcip'
          : microcipStatus === 'necunoscut'
            ? 'necunoscut'
            : null,
    observatii_generale: form.observatii_generale || null,
    fotografie_url: animal.fotografie_url || null,
    fotografie_data: fotografieData
  })

  const salveazaFotografie = async () => {
    if (!photoData && !photoPreview && !animal.fotografie_url) {
      setPhotoMessage('Alege o fotografie inainte de salvare.')
      return
    }

    if (!form.nume.trim()) {
      setPhotoMessage('Completeaza numele animalului inainte de salvare.')
      return
    }

    try {
      setSavingPhoto(true)
      setPhotoMessage('')
      const fotografieData = await createCroppedPhoto()
      const response = await axios.put(
        `http://127.0.0.1:8000/animale/${animalId}`,
        getProfilePayload(fotografieData)
      )

      const fotografieUrl = response.data.fotografie_url
      queryClient.setQueryData(['animale'], (currentAnimals = []) =>
        currentAnimals.map((currentAnimal) =>
          currentAnimal.id === animalId
            ? { ...currentAnimal, fotografie_url: fotografieUrl }
            : currentAnimal
        )
      )
      await queryClient.invalidateQueries({ queryKey: ['animale'] })
      setPhotoPreview(fotografieUrl)
      setPhotoData('')
      setPhotoCrop({ x: 50, y: 50 })
      setPhotoZoom(1)
      setPhotoMessage('Fotografia de profil a fost salvata.')
      setShowPhotoEditor(false)
    } catch (photoSaveError) {
      console.error('Eroare la salvarea fotografiei:', photoSaveError)
      setPhotoMessage('Nu am putut salva fotografia. Verifica daca backendul ruleaza.')
    } finally {
      setSavingPhoto(false)
    }
  }

  const salveazaProfil = async () => {
    if (!form.nume.trim()) {
      setSaveMessage('Completeaza numele animalului.')
      return
    }

    try {
      setSaving(true)
      setSaveMessage('')

      const fotografieData = await createCroppedPhoto()

      await axios.put(
        `http://127.0.0.1:8000/animale/${animalId}`,
        getProfilePayload(fotografieData)
      )

      await queryClient.invalidateQueries({ queryKey: ['animale'] })
      navigate(`/animal/${animalId}`)
    } catch (saveError) {
      console.error('Eroare la salvarea profilului:', saveError)
      setSaveMessage('Nu am putut salva profilul. Verifica daca backendul ruleaza si incearca din nou.')
    } finally {
      setSaving(false)
    }
  }


  const stergeAnimal = async () => {
    if (!animalId || !animal) return

    try {
      setDeletingAnimal(true)
      setDeleteMessage('')

      await axios.delete(`http://127.0.0.1:8000/animale/${animalId}`)

      sessionStorage.removeItem(`petcare-open-tab-${animalId}`)
      sessionStorage.removeItem(`petcare-open-modal-${animalId}`)
      await queryClient.invalidateQueries({ queryKey: ['animale'] })
      navigate('/')
    } catch (deleteError) {
      console.error('Eroare la stergerea animalului:', deleteError)
      setDeleteMessage('Nu am putut sterge profilul. Verifica backend-ul si incearca din nou.')
    } finally {
      setDeletingAnimal(false)
    }
  }

  if (isLoading) {
    return <h1 className="loading-text">Se incarca formularul de editare...</h1>
  }

  if (error) {
    return <h1 className="error-text">Nu am putut incarca profilul.</h1>
  }

  if (!animal) {
    return (
      <div className="page">
        <h1>Animalul nu a fost gasit.</h1>
        <button className="primary-button" type="button" onClick={() => navigate('/')}>
          Inapoi la dashboard
        </button>
      </div>
    )
  }

  const selectedBreed = rase.find((rasa) => String(rasa.id) === String(form.rasa_id))
  const breedName = selectedBreed?.nume || animal.rasa || 'Rasă necompletată'
  const animalAgeText = Number(animal.varsta) === 1 ? '1 an' : animal.varsta ? `${animal.varsta} ani` : 'Vârstă necompletată'
  const speciesLabel = specieSelectata === 'caine' ? 'Câine' : 'Pisică'
  const profilePhoto = photoPreview || animal.fotografie_url
  const breedDetails = normalizeBreedDetails(breedDetailsFromApi) || getGenericBreedDetails(breedName, specieSelectata)
  const activityLevel = breedDetails.nivel_activitate
  const socialLevel = breedDetails.nivel_socializare

  const getAnimalInitial = (name = animal?.nume) => String(name || '?').trim().charAt(0).toUpperCase() || '?'

  const getAnimalAvatarTone = (sex = form.sex || animal?.sex) => {
    const normalizedSex = String(sex || '').toLowerCase()
    return normalizedSex.includes('fem') ? 'female' : 'male'
  }

  const formatAnimalAge = (age) => {
    const numericAge = Number(age)

    if (!Number.isFinite(numericAge) || numericAge <= 0) {
      return 'profil'
    }

    return numericAge === 1 ? '1 an' : `${numericAge} ani`
  }

  const goToAnimalTab = (tab) => {
    sessionStorage.setItem(`petcare-open-tab-${animalId}`, tab)
    navigate(`/animal/${animalId}`)
  }

  const goToAnimalModal = (modal) => {
    sessionStorage.setItem(`petcare-open-modal-${animalId}`, modal)
    navigate(`/animal/${animalId}`)
  }

  return (
    <div className="petcare-app-shell edit-profile-app-shell">
      <aside className="petcare-sidebar">
        <div className="petcare-sidebar-brand-row">
          <button className="petcare-brand" type="button" onClick={() => navigate('/')}>
            <span>Pet</span>Care
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
            <span className="petcare-sidebar-age">{formatAnimalAge(animal.varsta)}</span>
          </div>
        </button>

        <nav className="petcare-sidebar-nav" aria-label="Navigare editare profil">
          <button className="active" type="button" onClick={() => goToAnimalTab('profile')}>
            <span className="sidebar-icon-real"><Home size={18} /></span>
            Acasă
          </button>
          <button type="button" onClick={() => goToAnimalTab('health')}>
            <span className="sidebar-icon-real"><HeartPulse size={18} /></span>
            Centru sănătate
          </button>
          <button type="button" onClick={() => goToAnimalTab('treatments')}>
            <span className="sidebar-icon-real"><Pill size={18} /></span>
            Monitor tratamente
          </button>
          <button type="button" onClick={() => goToAnimalTab('history')}>
            <span className="sidebar-icon-real"><Activity size={18} /></span>
            Activitate
          </button>
          <button type="button" onClick={() => goToAnimalTab('medical')}>
            <span className="sidebar-icon-real"><BookOpen size={18} /></span>
            Carnet de sănătate
          </button>
        </nav>

        <div className="petcare-sidebar-footer">
          <button type="button" onClick={() => goToAnimalModal('settings')}>
            <span className="sidebar-icon-real"><Settings size={18} /></span>
            Setări
          </button>
          <button className="emergency" type="button" onClick={() => goToAnimalModal('vet')}>
            <span className="sidebar-icon-real"><HelpCircle size={18} /></span>
            Asistență veterinară
          </button>
        </div>
      </aside>

      <main className="petcare-main edit-premium-main">
        <header className="edit-premium-topbar">
         

         
          <div className="edit-topbar-actions">
            <button className="edit-ghost-action" type="button" onClick={() => navigate(`/animal/${animalId}`)}>
              Renunță
            </button>
            <button className="edit-save-action" type="button" disabled={saving} onClick={salveazaProfil}>
              <Save size={17} /> {saving ? 'Se salvează...' : 'Salvează modificări'}
            </button>
          </div>
        </header>

        <section className="edit-premium-hero">
          <div>
            <h1>Editează Profil: {animal.nume}</h1>
            <p>
              Actualizează datele importante ale profilului și alege poza care îi
              reprezintă cel mai bine personalitatea.
            </p>
          </div>
        </section>

        <div className="edit-premium-layout">
          <aside className="edit-premium-left-column">
            <section className="edit-photo-premium-card">
              <div className="edit-card-title-row">
                <Camera size={22} />
                <h2>Poza Profil</h2>
              </div>

              <div className="edit-photo-frame">
                {profilePhoto ? (
                  <img
                    src={profilePhoto}
                    alt={animal.nume}
                    style={{
                      objectPosition: `${photoCrop.x}% ${photoCrop.y}%`,
                      transform: `scale(${photoZoom})`
                    }}
                  />
                ) : (
                  <span className={`animal-initial-avatar edit-photo-initial ${getAnimalAvatarTone(form.sex || animal.sex)} visible`}>
                    {getAnimalInitial(form.nume || animal.nume)}
                  </span>
                )}
              </div>

              <label className="edit-upload-main-button">
                <Upload size={17} /> Alege poza
                <input type="file" accept="image/*" onChange={handlePhotoChange} />
              </label>

              

              {photoData && (
                <button className="edit-outline-button accent" type="button" disabled={savingPhoto} onClick={salveazaFotografie}>
                  {savingPhoto ? 'Se salvează...' : 'Salvează fotografia'}
                </button>
              )}
              {photoMessage && <p className="edit-inline-message">{photoMessage}</p>}
            </section>

            <section className="breed-insights-card breed-insights-card-summary">
              <div className="edit-card-title-row breed-card-title-compact">
                <Sparkles size={20} />
                <h2>Informații despre rasă</h2>
              </div>

              <div className="breed-note-bubble compact breed-name-chip">
                <strong>{breedName}</strong>
              </div>

              <div className="breed-meters-compact">
                <div className="breed-meter-row">
                  <span>Nivel activitate</span>
                  <div className="breed-meter">
                    <i style={{ width: `${activityLevel}%` }} />
                  </div>
                </div>

                <div className="breed-meter-row">
                  <span>Socializare</span>
                  <div className="breed-meter">
                    <i style={{ width: `${socialLevel}%` }} />
                  </div>
                </div>
              </div>

              <div className="breed-funfact-inline">
                <span>Fun fact</span>
                <p>{breedDetails.fun_fact || `${breedName} are un profil unic, iar monitorizarea constantă ajută la observarea schimbărilor mici.`}</p>
              </div>
            </section>
          </aside>

          <div className="edit-premium-right-column">
            <section className="edit-main-premium-card">
            <div className="edit-card-header-premium">
              <div>
                <h2>Date Profil</h2>
                <p>Actualizează informațiile de bază ale animalului.</p>
              </div>
              <span className="clinical-id-chip">ID profil: {animalId.toString().padStart(4, '0')}</span>
            </div>

            <div className="edit-premium-form-grid">
              <label>
                <span>Nume</span>
                <div className="edit-field-shell">
                  <input value={form.nume || ''} onChange={(event) => updateForm('nume', event.target.value)} />
                  <Edit3 size={17} />
                </div>
              </label>

              <label>
                <span>Specie</span>
                <div className="edit-field-shell select-shell">
                  <select
                    value={specieSelectata}
                    onChange={(event) => {
                      setSpecie(event.target.value)
                      updateForm('rasa_id', '')
                    }}
                  >
                    <option value="pisica">Pisică</option>
                    <option value="caine">Câine</option>
                  </select>
                </div>
              </label>

              <label>
                <span>Rasă</span>
                <div className="edit-field-shell select-shell">
                  <select value={form.rasa_id || ''} onChange={(event) => updateForm('rasa_id', event.target.value)}>
                    <option value="">Alege rasa</option>
                    {raseFiltrate.map((rasa) => (
                      <option key={rasa.id} value={rasa.id}>{rasa.nume}</option>
                    ))}
                  </select>
                </div>
              </label>

              <label>
                <span>Sex</span>
                <div className="edit-field-shell select-shell">
                  <select value={form.sex || ''} onChange={(event) => updateForm('sex', event.target.value)}>
                    <option value="">De completat</option>
                    <option value="femela">Femelă</option>
                    <option value="mascul">Mascul</option>
                  </select>
                </div>
              </label>

              <label>
                <span>Greutate (kg)</span>
                <div className="edit-field-shell">
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={form.greutate || ''}
                    onChange={(event) => updateForm('greutate', event.target.value)}
                  />
                </div>
              </label>

              <label>
                <span>Culoare</span>
                <div className="edit-field-shell">
                  <input
                    placeholder="Ex: gri tigrat"
                    value={form.culoare || ''}
                    onChange={(event) => updateForm('culoare', event.target.value)}
                  />
                </div>
              </label>

              <label>
                <span>Data nașterii</span>
                <div className="edit-field-shell">
                  <input
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="dd/mm/yyyy"
                    value={dataNasterii}
                    onChange={(event) => setDataNasterii(formatDateInput(event.target.value))}
                  />
                  <CalendarDays size={17} />
                </div>
              </label>

              <label>
                <span>Sterilizat / castrat</span>
                <div className="edit-field-shell select-shell">
                  <select value={form.sterilizat || ''} onChange={(event) => updateForm('sterilizat', event.target.value)}>
                    <option value="">De completat</option>
                    <option value="da">Da</option>
                    <option value="nu">Nu</option>
                  </select>
                </div>
              </label>

              <label className="edit-full-field">
                <span>Microcip</span>
                <div className="edit-field-shell select-shell">
                  <select value={microcipStatus} onChange={(event) => setMicrocipStatus(event.target.value)}>
                    <option value="">De completat opțional</option>
                    <option value="da">Are microcip</option>
                    <option value="nu">Nu are microcip</option>
                    <option value="necunoscut">Nu știu</option>
                  </select>
                </div>
              </label>

              {microcipStatus === 'da' && (
                <label className="edit-full-field">
                  <span>Număr microcip</span>
                  <div className="edit-field-shell">
                    <input
                      placeholder="Introduceți codul format din 15 cifre"
                      value={form.microcip || ''}
                      onChange={(event) => updateForm('microcip', event.target.value)}
                    />
                    <BadgeCheck size={17} />
                  </div>
                </label>
              )}
            </div>

            

            {saveMessage && <p className="error-message">{saveMessage}</p>}
            </section>

            <section className="edit-observations-card">
              <div className="edit-card-title-row">
                <Edit3 size={20} />
                <h2>Observații generale</h2>
              </div>

              <textarea
                placeholder="Ex: sensibilități alimentare, rutină zilnică, preferințe de joacă sau observații medicale pe termen lung..."
                value={form.observatii_generale || ''}
                onChange={(event) => updateForm('observatii_generale', event.target.value)}
                maxLength={1000}
              />

              <div className="edit-observations-footer">
                <span>Completează doar informațiile importante pentru profil.</span>
                <span>{(form.observatii_generale || '').length} / 1000 caractere</span>
              </div>
            </section>

            <section
              className="edit-danger-zone-card"
              style={{
                marginTop: '0',
                padding: '28px',
                borderRadius: '28px',
                border: '1px solid rgba(239, 68, 68, 0.22)',
                background: 'linear-gradient(135deg, rgba(255,255,255,0.96), rgba(254,242,242,0.9))',
                boxShadow: '0 22px 55px rgba(15, 23, 42, 0.08)'
              }}
            >
              <div className="edit-card-title-row" style={{ alignItems: 'flex-start' }}>
                <span
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '16px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#dc2626',
                    background: 'rgba(254, 226, 226, 0.95)',
                    flex: '0 0 auto'
                  }}
                >
                  <AlertTriangle size={21} />
                </span>
                <div>
                  <h2>Zonă periculoasă</h2>
                  <p style={{ margin: '6px 0 0', color: '#64748b', lineHeight: 1.55 }}>
                    Ștergerea profilului va elimina animalul și datele asociate din baza de date.
                    Această acțiune nu poate fi anulată.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setDeleteMessage('')
                  setShowDeleteConfirm(true)
                }}
                style={{
                  marginTop: '22px',
                  minHeight: '48px',
                  borderRadius: '999px',
                  border: '1px solid rgba(220, 38, 38, 0.28)',
                  background: '#fff',
                  color: '#dc2626',
                  fontWeight: 900,
                  padding: '0 22px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '10px',
                  cursor: 'pointer'
                }}
              >
                <Trash2 size={18} />
                Șterge animalul
              </button>
            </section>
          </div>
        </div>


        {showDeleteConfirm && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Confirmare stergere animal"
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1200,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px',
              background: 'rgba(15, 23, 42, 0.48)',
              backdropFilter: 'blur(14px)'
            }}
          >
            <div
              style={{
                width: 'min(560px, 100%)',
                borderRadius: '34px',
                background: 'linear-gradient(135deg, #ffffff 0%, #fff7f7 100%)',
                border: '1px solid rgba(239, 68, 68, 0.22)',
                boxShadow: '0 32px 90px rgba(15, 23, 42, 0.28)',
                padding: '34px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '18px', alignItems: 'flex-start' }}>
                <div>
                  <span style={{ color: '#dc2626', letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 900, fontSize: '0.78rem' }}>
                    Confirmare ștergere
                  </span>
                  <h2 style={{ margin: '10px 0 10px', fontSize: '2rem', color: '#0f172a' }}>
                    Ștergi profilul lui {animal.nume}?
                  </h2>
                  <p style={{ margin: 0, color: '#64748b', lineHeight: 1.6 }}>
                    Profilul animalului, simptomele raportate, tratamentele și administrările asociate vor fi șterse din baza de date.
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Inchide confirmarea"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deletingAnimal}
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    border: '1px solid rgba(148, 163, 184, 0.35)',
                    background: '#fff',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#334155',
                    flex: '0 0 auto'
                  }}
                >
                  <X size={22} />
                </button>
              </div>

              {deleteMessage && (
                <p style={{ margin: '22px 0 0', color: '#dc2626', fontWeight: 800 }}>
                  {deleteMessage}
                </p>
              )}

              <div style={{ marginTop: '30px', display: 'flex', justifyContent: 'flex-end', gap: '14px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deletingAnimal}
                  style={{
                    minHeight: '50px',
                    borderRadius: '999px',
                    border: '1px solid rgba(148, 163, 184, 0.35)',
                    background: '#fff',
                    color: '#334155',
                    fontWeight: 900,
                    padding: '0 22px',
                    cursor: 'pointer'
                  }}
                >
                  Renunță
                </button>
                <button
                  type="button"
                  onClick={stergeAnimal}
                  disabled={deletingAnimal}
                  style={{
                    minHeight: '50px',
                    borderRadius: '999px',
                    border: 'none',
                    background: '#dc2626',
                    color: '#fff',
                    fontWeight: 900,
                    padding: '0 24px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '10px',
                    cursor: deletingAnimal ? 'not-allowed' : 'pointer',
                    opacity: deletingAnimal ? 0.72 : 1
                  }}
                >
                  <Trash2 size={18} />
                  {deletingAnimal ? 'Se șterge...' : 'Șterge definitiv'}
                </button>
              </div>
            </div>
          </div>
        )}

        {showPhotoEditor && (photoPreview || animal.fotografie_url) && (
          <div className="photo-editor-modal" role="dialog" aria-modal="true">
            <div className="photo-editor-panel">
              <div className="photo-editor-header">
                <div>
                  <span>Poza profil</span>
                  <strong>Încadrează poza lui {animal.nume}</strong>
                  <p>Trage pătratul cu mouse-ul ca să îl așezi peste fața animalului.</p>
                </div>
                <button
                  className="photo-editor-close"
                  type="button"
                  aria-label="Închide editorul"
                  onClick={() => setShowPhotoEditor(false)}
                >
                  <X size={22} />
                </button>
              </div>

              <div
                className="photo-crop-stage"
                role="application"
                aria-label="Încadrare poză profil"
                onPointerDown={startPhotoDrag}
                onPointerMove={movePhotoDrag}
                onPointerUp={stopPhotoDrag}
                onPointerCancel={stopPhotoDrag}
                onWheel={handlePhotoWheel}
                style={{
                  '--crop-x': `${photoCrop.x}%`,
                  '--crop-y': `${photoCrop.y}%`
                }}
              >
                <img
                  src={photoPreview || animal.fotografie_url}
                  alt={`Încadrare ${animal.nume}`}
                  draggable="false"
                  style={{ transform: `scale(${photoZoom})` }}
                />
                <div className="photo-crop-grid" />
                <div className="photo-crop-mask" />
                <div className="photo-crop-handle" />
              </div>

              <div className="photo-editor-zoom-control">
                <label htmlFor="photo-zoom">Zoom poză</label>
                <input
                  id="photo-zoom"
                  type="range"
                  min="1"
                  max="2.2"
                  step="0.02"
                  value={photoZoom}
                  onChange={(event) => setPhotoZoom(Number(event.target.value))}
                />
                <span>{Math.round(photoZoom * 100)}%</span>
              </div>

              <div className="photo-editor-actions">
                <div>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => {
                      setPhotoCrop({ x: 50, y: 50 })
                      setPhotoZoom(1)
                    }}
                  >
                    Resetează
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    disabled={savingPhoto}
                    onClick={photoData ? salveazaFotografie : () => setShowPhotoEditor(false)}
                  >
                    {savingPhoto ? 'Se salvează...' : photoData ? 'Salvează fotografia' : 'Gata'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default AnimalEditPage
