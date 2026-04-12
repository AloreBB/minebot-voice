import { useAuth } from './hooks/useAuth'
import { LoginPage } from './components/LoginPage'
import { Dashboard } from './components/Dashboard'

export default function App() {
  const { token, isAuthenticated, login, logout } = useAuth()

  if (!isAuthenticated || !token) {
    return <LoginPage onLogin={login} />
  }

  return <Dashboard token={token} onLogout={logout} />
}
