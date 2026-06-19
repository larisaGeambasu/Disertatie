import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { ArrowRight, Lock, Mail, PawPrint, ShieldCheck, UserRound } from 'lucide-react'

function Register() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    nume: '',
    email: '',
    parola: '',
    confirmareParola: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const updateForm = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!form.nume.trim() || !form.email.trim() || !form.parola.trim()) {
      setError('Completează numele, emailul și parola.')
      return
    }

    if (form.parola.length < 6) {
      setError('Parola trebuie să aibă minimum 6 caractere.')
      return
    }

    if (form.parola !== form.confirmareParola) {
      setError('Parolele nu coincid.')
      return
    }

    try {
      setLoading(true)
      setError('')

      const response = await axios.post('http://127.0.0.1:8000/register', {
        nume: form.nume.trim(),
        email: form.email.trim(),
        parola: form.parola
      })

      localStorage.setItem('petcare_user_id', response.data.id)
      localStorage.setItem('petcare_user', JSON.stringify(response.data))
      localStorage.setItem('petcare_user_nume', response.data.nume || '')

      navigate('/')
    } catch (registerError) {
      console.error(registerError)
      setError(registerError.response?.data?.detail || 'Nu am putut crea contul.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-shell register-auth">
      <section className="auth-visual">
        <div className="auth-brand">
          <span><PawPrint size={20} /></span>
          PetCare
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-card register-card">
          <span className="auth-eyebrow">Bun venit</span>
          <h1>Creează cont nou</h1>
          <p>Începe călătoria către o viață mai sănătoasă pentru animalul tău.</p>

          <form className="auth-form" onSubmit={handleSubmit}>
            <label>
              Nume complet
              <div className="auth-input-wrap">
                <UserRound size={18} />
                <input
                  type="text"
                  value={form.nume}
                  onChange={(event) => updateForm('nume', event.target.value)}
                  placeholder="Ion Popescu"
                  autoComplete="name"
                />
              </div>
            </label>

            <label>
              Email
              <div className="auth-input-wrap">
                <Mail size={18} />
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => updateForm('email', event.target.value)}
                  placeholder="nume@exemplu.ro"
                  autoComplete="email"
                />
              </div>
            </label>

            <div className="auth-two-cols">
              <label>
                Parolă
                <div className="auth-input-wrap">
                  <Lock size={18} />
                  <input
                    type="password"
                    value={form.parola}
                    onChange={(event) => updateForm('parola', event.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />
                </div>
              </label>

              <label>
                Confirmă parola
                <div className="auth-input-wrap">
                  <ShieldCheck size={18} />
                  <input
                    type="password"
                    value={form.confirmareParola}
                    onChange={(event) => updateForm('confirmareParola', event.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />
                </div>
              </label>
            </div>

            {error ? <div className="auth-error">{error}</div> : null}

            <button className="auth-submit" type="submit" disabled={loading}>
              {loading ? 'Se creează...' : 'Creează cont'}
              <ArrowRight size={18} />
            </button>
          </form>

          <div className="auth-switch">
            Ai deja un cont? <Link to="/login">Autentifică-te</Link>
          </div>
        </div>
      </section>
    </main>
  )
}

export default Register
