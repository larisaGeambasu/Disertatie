import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import {
  ArrowLeft,
  Home,
  HeartPulse,
  Pill,
  Activity,
  BookOpen,
  Settings,
  Stethoscope,
  Search,
  ClipboardList,
  MessageSquareText,
  X,
  Sparkles
} from 'lucide-react'

function HistoryPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const animalId = Number(id)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedInsight, setSelectedInsight] = useState(null)
  const [loadingInsight, setLoadingInsight] = useState(false)

  const sidebarIcons = {
    home: <Home size={19} />,
    health: <HeartPulse size={19} />,
    treatments: <Pill size={19} />,
    activity: <Activity size={19} />,
    medical: <BookOpen size={19} />,
    settings: <Settings size={19} />,
    vet: <Stethoscope size={19} />
  }

  const SidebarIcon = ({ type }) => (
    <span className="sidebar-icon-real" aria-hidden="true">
      {sidebarIcons[type]}
    </span>
  )

  const goToAnimalTab = (tab) => {
    navigate(`/animal/${animalId}?tab=${tab}`)
  }

  const openAnimalModal = (modal) => {
    sessionStorage.setItem(`petcare-return-after-modal-${animalId}`, `/animal/${animalId}/history`)
    navigate(`/animal/${animalId}?modal=${modal}`)
  }

  const {
    data: animale = [],
    isLoading: loadingAnimale,
    error: animaleError
  } = useQuery({
    queryKey: ['animale'],
    queryFn: async () => {
      const response = await axios.get('http://127.0.0.1:8000/animale')
      return response.data
    }
  })

  const {
    data: istoricSimptome = [],
    isLoading: loadingIstoric,
    error: istoricError
  } = useQuery({
    queryKey: ['istoric-simptome', animalId],
    queryFn: async () => {
      const response = await axios.get(
        `http://127.0.0.1:8000/istoric-simptome/${animalId}`
      )
      return response.data
    }
  })

  const animal = (animale || []).find((item) => item.id === animalId)

  const normalizeText = (text = '') =>
    String(text)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')

  const getAnimalInitial = (name = '') => {
    const cleanName = String(name || '').trim()
    return cleanName ? cleanName.charAt(0).toUpperCase() : 'A'
  }

  const getAnimalAvatarTone = (sex = '') => {
    const normalizedSex = normalizeText(sex)
    if (normalizedSex.includes('fem')) return 'female'
    return 'male'
  }

  const filteredHistory = useMemo(() => {
    const search = normalizeText(searchTerm.trim())

    if (!search) {
      return istoricSimptome || []
    }

    return (istoricSimptome || []).filter((item) =>
      normalizeText(
        `${item.simptom} ${item.severitate} ${item.frecventa} ${item.observatii}`
      ).includes(search)
    )
  }, [istoricSimptome, searchTerm])

  const formatDateTime = (dateValue) => {
    if (!dateValue) return 'Data necunoscuta'

    return new Date(dateValue).toLocaleString('ro-RO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatShortDate = (dateValue) => {
    if (!dateValue) return 'De completat'

    return new Date(dateValue).toLocaleDateString('ro-RO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  }

  const getSeverityKey = (severity) => {
    const value = normalizeText(severity)

    if (value.includes('ridic')) return 'critical'
    if (value.includes('med')) return 'moderate'
    return 'light'
  }

  const getSeverityLabel = (severity) => {
    const value = normalizeText(severity)

    if (value.includes('ridic')) return 'Ridicata'
    if (value.includes('med')) return 'Medie'
    if (value.includes('usoar')) return 'Usoara'
    return 'Nespecificata'
  }

  const getObservationText = (item) => {
    if (item.observatii) return item.observatii

    const symptom = normalizeText(item.simptom)

    if (symptom.includes('apetit')) {
      return 'Urmareste apetitul, energia, setea si greutatea in urmatoarele zile.'
    }

    if (symptom.includes('scaun') || symptom.includes('constip')) {
      return 'Urmareste frecventa scaunului, consumul de apa si nivelul de energie.'
    }

    if (symptom.includes('schiop') || symptom.includes('rigid')) {
      return 'Noteaza daca mersul modificat se repeta sau apare dupa efort.'
    }

    return 'Monitorizat in profil pentru comparatii pe termen lung.'
  }

  const buildFallbackInsight = (item) => {
    const symptom = normalizeText(item?.simptom)

    if (symptom.includes('apetit')) {
      return {
        title: 'Monitorizare apetit',
        description:
          'Schimbarile de apetit pot aparea dupa modificari alimentare, stres, disconfort digestiv sau schimbari de rutina.',
        recommendation:
          'Noteaza cantitatea mancata, setea, greutatea si energia. Daca apetitul se schimba brusc sau persista, discuta cu medicul veterinar.'
      }
    }

    if (symptom.includes('scaun') || symptom.includes('constip')) {
      return {
        title: 'Monitorizare digestie',
        description:
          'Modificarile scaunului pot fi legate de hidratare, alimentatie, stres sau tranzit intestinal mai lent.',
        recommendation:
          'Urmareste frecventa scaunului, consumul de apa si nivelul de energie. Pentru constipatie persistenta, durere sau apatie, cere sfatul veterinarului.'
      }
    }

    if (symptom.includes('schiop') || symptom.includes('mobil') || symptom.includes('rigid')) {
      return {
        title: 'Monitorizare mobilitate',
        description:
          'Modificarile de mers pot indica sensibilitate articulara, disconfort dupa efort sau o problema care trebuie urmarita in timp.',
        recommendation:
          'Noteaza cand apare schimbarea, daca se agraveaza dupa joaca sau sarituri si daca animalul evita anumite miscari.'
      }
    }

    if (symptom.includes('saliv')) {
      return {
        title: 'Monitorizare salivatie',
        description:
          'Salivarea excesiva poate aparea in contexte diferite, de la greata si stres pana la probleme dentare sau iritatii.',
        recommendation:
          'Urmareste daca apare impreuna cu varsaturi, refuzul hranei, durere la gura sau apatie. Daca se repeta, noteaza episodul si cere sfatul veterinarului.'
      }
    }

    return {
      title: item?.simptom || 'Simptom raportat',
      description:
        'Acest simptom merita urmarit in contextul rutinei zilnice, al alimentatiei, al tratamentelor si al comportamentului general.',
      recommendation:
        'Pastreaza observatiile in istoric si compara episoadele. Daca simptomul persista, se agraveaza sau apare impreuna cu alte semne, contacteaza medicul veterinar.'
    }
  }

  const openSymptomInsight = async (item) => {
    const fallback = buildFallbackInsight(item)

    setSelectedInsight({
      simptom: item.simptom,
      severitate: getSeverityLabel(item.severitate),
      frecventa: item.frecventa || 'Nespecificata',
      data: formatDateTime(item.data_raportare),
      ...fallback
    })

    if (!item.episod_id) return

    try {
      setLoadingInsight(true)
      const response = await axios.get(
        `http://127.0.0.1:8000/analiza-episod/${item.episod_id}`
      )

      const bestMatch = response.data?.[0]

      if (bestMatch) {
        setSelectedInsight({
          simptom: item.simptom,
          severitate: getSeverityLabel(item.severitate),
          frecventa: item.frecventa || 'Nespecificata',
          data: formatDateTime(item.data_raportare),
          title: bestMatch.afectiune || fallback.title,
          description: bestMatch.descriere || fallback.description,
          recommendation: bestMatch.recomandare || fallback.recommendation,
          risk: bestMatch.nivel_risc,
          score: bestMatch.scor_total
        })
      }
    } catch (error) {
      console.error('Nu am putut incarca recomandarea episodului:', error)
    } finally {
      setLoadingInsight(false)
    }
  }

  const highSeverityCount = (istoricSimptome || []).filter(
    (item) => getSeverityKey(item.severitate) === 'critical'
  ).length

  const lastUpdate = istoricSimptome?.[0]?.data_raportare

  if (loadingAnimale || loadingIstoric) {
    return <h1 className="loading-text">Se incarca istoricul...</h1>
  }

  if (animaleError || istoricError) {
    return <h1 className="error-text">A aparut o eroare la incarcarea istoricului.</h1>
  }

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

  return (
    <div className="petcare-app-shell full-history-shell">
      <aside className="petcare-sidebar">
        <div className="petcare-sidebar-brand-row">
          <button className="petcare-brand" type="button" onClick={() => navigate('/')}>
            <span>Pet</span>Care
          </button>

          <button
            className="petcare-sidebar-back"
            type="button"
            aria-label="Inapoi la profil"
            title="Inapoi la profil"
            onClick={() => goToAnimalTab('profile')}
          >
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
        </div>

        <button
          className="petcare-sidebar-pet sidebar-pet-button"
          type="button"
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

          <div>
            <strong>{animal.nume}</strong>
            <span>
              {animal.rasa || animal.specie} {animal.varsta ? `${animal.varsta} ani` : 'profil'}
            </span>
          </div>
        </button>

        <nav className="petcare-sidebar-nav" aria-label="Navigare istoric">
         <button
          className="sidebar-home-button"
          type="button"
          onClick={() => goToAnimalTab('profile')}
        >
          <SidebarIcon type="home" />
          Acasa
        </button>

          <button type="button" onClick={() => goToAnimalTab('health')}>
            <SidebarIcon type="health" />
            Centru sanatate
          </button>

          <button type="button" onClick={() => goToAnimalTab('treatments')}>
            <SidebarIcon type="treatments" />
            Monitor tratamente
          </button>

          <button className="active" type="button">
            <SidebarIcon type="activity" />
            Activitate
          </button>

          <button type="button" onClick={() => goToAnimalTab('medical')}>
            <SidebarIcon type="medical" />
            Carnet de sanatate
          </button>
        </nav>

        <div className="petcare-sidebar-footer">
          <button type="button" onClick={() => openAnimalModal('settings')}>
            <SidebarIcon type="settings" />
            Setari
          </button>

          <button className="emergency" type="button" onClick={() => openAnimalModal('vet')}>
            <SidebarIcon type="vet" />
            Asistenta veterinara
          </button>
        </div>
      </aside>

      <main className="petcare-main">
        <header className="petcare-topbar">
          <strong>
            PetCare <span>Premium</span>
          </strong>

          <label className="petcare-topbar-search">
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              placeholder="Cauta in istoricul medical..."
              aria-label="Cauta in istoricul medical"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </label>

          <nav aria-label="Navigare rapida">
            <button type="button" onClick={() => goToAnimalTab('profile')}>
              Dashboard
            </button>

            <button type="button" className="active">
              Activitate
            </button>

            <button type="button" onClick={() => goToAnimalTab('medical')}>
              Carnet
            </button>
          </nav>

          <div>
            <button
              className="petcare-topbar-record"
              type="button"
              onClick={() => openAnimalModal('medical')}
            >
              Adauga inregistrare
            </button>
          </div>
        </header>

        <div className="full-history-page">
          <section className="full-history-hero">
            <div>
              <span className="history-eyebrow">Istoric simptome</span>
              <div className="history-title-row">
                <h1>Istoricul complet</h1>
                <button
                  className="history-inline-back"
                  type="button"
                  onClick={() => navigate(`/animal/${animalId}?tab=history`)}
                >
                  <ArrowLeft size={17} />
                  Inapoi la istoric
                </button>
              </div>
              <p>
                Toate simptomele raportate pentru {animal.nume}, impreuna cu
                severitatea, frecventa, observatiile si momentul introducerii.
              </p>
            </div>

            <div className="history-stat-row">
              <div className="history-stat-pill">
                <span>Total inregistrari</span>
                <strong>{istoricSimptome.length}</strong>
              </div>

              <div className="history-stat-pill alert">
                <span>Alerte severitate</span>
                <strong>{highSeverityCount}</strong>
              </div>

              <div className="history-stat-pill">
                <span>Ultima actualizare</span>
                <strong>{lastUpdate ? formatShortDate(lastUpdate) : 'Nu exista'}</strong>
              </div>
            </div>
          </section>

          <section className="full-history-timeline-card">
            <div className="history-list-header">
              <div>
                <span className="history-eyebrow">Timeline clinic</span>
                <h2>Raportari recente</h2>
              </div>

            </div>

            {filteredHistory.length === 0 ? (
              <div className="history-empty-state">
                Nu exista simptome care se potrivesc cu aceasta cautare.
              </div>
            ) : (
              <div className="full-history-timeline">
                {filteredHistory.map((item) => {
                  const severityKey = getSeverityKey(item.severitate)

                  return (
                    <article
                      key={item.id}
                      className={`full-history-event ${severityKey}`}
                    >
                      <span className="history-event-dot" aria-hidden="true" />

                      <div className="history-event-card">
                        <div className="history-event-title">
                          <h3>{item.simptom}</h3>

                          <span className={`severity-chip ${severityKey}`}>
                            Severitate: {getSeverityLabel(item.severitate)}
                          </span>
                        </div>

                        <time>{formatDateTime(item.data_raportare)}</time>

                        <div className="history-event-meta">
                          <p>
                            <Activity size={16} aria-hidden="true" />
                            <strong>Frecventa:</strong>{' '}
                            {item.frecventa || 'Nespecificata'}
                          </p>

                          <p>
                            <MessageSquareText size={16} aria-hidden="true" />
                            <strong>Observatii:</strong> {getObservationText(item)}
                          </p>
                        </div>

                        <button
                          type="button"
                          className="history-event-action"
                          onClick={() => openSymptomInsight(item)}
                        >
                          Vezi recomandarea
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      </main>

      {selectedInsight && (
        <div
          className="history-insight-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedInsight(null)
            }
          }}
        >
          <section
            className="history-insight-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-insight-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="history-insight-close"
              aria-label="Inchide recomandarea"
              onClick={() => setSelectedInsight(null)}
            >
              <X size={19} />
            </button>

            <div className="history-insight-heading">
              <span><Sparkles size={22} /></span>
              <div>
                <p>Interpretare episod</p>
                <h2 id="history-insight-title">{selectedInsight.title}</h2>
              </div>
            </div>

            <div className="history-insight-meta">
              <span>{selectedInsight.simptom}</span>
              <span>Severitate: {selectedInsight.severitate}</span>
              <span>Frecventa: {selectedInsight.frecventa}</span>
              <span>{selectedInsight.data}</span>
            </div>

            {loadingInsight && (
              <p className="history-insight-loading">Se incarca recomandarea...</p>
            )}

            <div className="history-insight-section">
              <strong>Descriere</strong>
              <p>{selectedInsight.description}</p>
            </div>

            <div className="history-insight-section recommendation">
              <strong>Recomandare</strong>
              <p>{selectedInsight.recommendation}</p>
            </div>

            {(selectedInsight.risk || selectedInsight.score) && (
              <div className="history-insight-footer">
                {selectedInsight.risk && <span>Risc: {selectedInsight.risk}</span>}
                {selectedInsight.score && <span>Scor estimativ: {selectedInsight.score}</span>}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

export default HistoryPage