import { Navigate, Route, Routes } from 'react-router-dom'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import UserSettings from './pages/UserSettings'
import AnimalPage from './pages/AnimalPage'
import AnimalEditPage from './pages/AnimalEditPage'
import HistoryPage from './pages/HistoryPage'

function ProtectedRoute({ children }) {
  const userId = localStorage.getItem('petcare_user_id')

  if (!userId) {
    return <Navigate to="/login" replace />
  }

  return children
}

function PublicRoute({ children }) {
  const userId = localStorage.getItem('petcare_user_id')

  if (userId) {
    return <Navigate to="/" replace />
  }

  return children
}

function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicRoute>
            <Register />
          </PublicRoute>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <UserSettings />
          </ProtectedRoute>
        }
      />
      <Route
        path="/animal/:id"
        element={
          <ProtectedRoute>
            <AnimalPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/animal/:id/edit"
        element={
          <ProtectedRoute>
            <AnimalEditPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/animal/:id/istoric"
        element={
          <ProtectedRoute>
            <HistoryPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
