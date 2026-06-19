import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { ArrowRight, CheckCircle, Eye, EyeOff, Lock, Mail, PawPrint, X } from 'lucide-react'

function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [parola, setParola] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetMessage, setResetMessage] = useState('')
  const [resetLoading, setResetLoading] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!email.trim() || !parola.trim()) {
      setError('Completează emailul și parola.')
      return
    }

    try {
      setLoading(true)
      setError('')

      const response = await axios.post('http://127.0.0.1:8000/login', {
        email: email.trim(),
        parola
      })

      localStorage.setItem('petcare_user_id', response.data.id)
      localStorage.setItem('petcare_user', JSON.stringify(response.data))
      localStorage.setItem('petcare_user_nume', response.data.nume || '')

      navigate('/')
    } catch (loginError) {
      console.error(loginError)
      setError('Email sau parolă incorectă.')
    } finally {
      setLoading(false)
    }
  }

  const openForgotPassword = () => {
    setResetEmail(email.trim())
    setResetMessage('')
    setError('')
    setShowForgotPassword(true)
  }

  const closeForgotPassword = () => {
    setShowForgotPassword(false)
    setResetMessage('')
    setResetLoading(false)
  }

  const handleForgotPassword = async (event) => {
    event.preventDefault()

    const normalizedEmail = resetEmail.trim()

    if (!normalizedEmail) {
      setResetMessage('Completează adresa de email pentru resetare.')
      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setResetMessage('Introdu o adresă de email validă.')
      return
    }

    try {
      setResetLoading(true)
      setResetMessage('')

      await axios.post('http://127.0.0.1:8000/forgot-password', {
        email: normalizedEmail
      })

      setResetMessage('Instrucțiunile de resetare au fost trimise pe email.')
    } catch (forgotError) {
      console.warn('Endpoint-ul /forgot-password nu este disponibil încă.', forgotError)
      const requests = JSON.parse(localStorage.getItem('petcare_password_reset_requests') || '[]')
      localStorage.setItem(
        'petcare_password_reset_requests',
        JSON.stringify([
          ...requests,
          { email: normalizedEmail, created_at: new Date().toISOString() }
        ])
      )
      setResetMessage('Solicitarea de resetare a fost înregistrată. Verifică emailul dacă există un cont asociat.')
    } finally {
      setResetLoading(false)
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-visual">
        <div className="auth-brand">
          <span><PawPrint size={20} /></span>
          PetCare
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <span className="auth-eyebrow">Bun venit</span>
          <h1>Bine ai revenit</h1>
          <p>Accesează dosarul medical al animalului tău în siguranță.</p>

          <form className="auth-form" onSubmit={handleSubmit}>
            <label>
              Email
              <div className="auth-input-wrap">
                <Mail size={18} />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="nume@exemplu.ro"
                  autoComplete="email"
                />
              </div>
            </label>

            <label>
              <div className="auth-label-row">
                <span>Parolă</span>
                
              </div>
              <div className="auth-input-wrap">
                <Lock size={18} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={parola}
                  onChange={(event) => setParola(event.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <button type="button" className="auth-eye" onClick={() => setShowPassword((value) => !value)}>
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </label>

            {error ? <div className="auth-error">{error}</div> : null}

            <button className="auth-submit" type="submit" disabled={loading}>
              {loading ? 'Se verifică...' : 'Autentificare'}
              <ArrowRight size={18} />
            </button>
          </form>

          <div className="auth-switch">
            Nu ai un cont? <Link to="/register">Înscrie-te</Link>
          </div>
        </div>
      </section>

      {showForgotPassword ? (
        <div className="auth-reset-overlay" role="dialog" aria-modal="true">
          <section className="auth-reset-modal">
            <button
              type="button"
              className="auth-reset-close"
              aria-label="Închide resetarea parolei"
              onClick={closeForgotPassword}
            >
              <X size={20} />
            </button>

            <span className="auth-eyebrow">Resetare parolă</span>
            <h2>Ai uitat parola?</h2>
            <p>
              Introdu adresa de email asociată contului și vom înregistra solicitarea de resetare.
            </p>

            <form className="auth-form auth-reset-form" onSubmit={handleForgotPassword}>
              <label>
                Email cont
                <div className="auth-input-wrap">
                  <Mail size={18} />
                  <input
                    type="email"
                    value={resetEmail}
                    onChange={(event) => setResetEmail(event.target.value)}
                    placeholder="nume@exemplu.ro"
                    autoComplete="email"
                  />
                </div>
              </label>

              {resetMessage ? (
                <div className="auth-reset-message">
                  <CheckCircle size={17} />
                  <span>{resetMessage}</span>
                </div>
              ) : null}

              <button className="auth-submit" type="submit" disabled={resetLoading}>
                {resetLoading ? 'Se trimite...' : 'Trimite instrucțiuni'}
                <ArrowRight size={18} />
              </button>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  )
}

export default Login
