interface Props {
  token: string
  onLogout: () => void
}

export function Dashboard({ token, onLogout }: Props) {
  return (
    <div style={{ padding: '1rem' }}>
      <h1>MineBot Dashboard</h1>
      <p>Connected. Dashboard coming next.</p>
      <button onClick={onLogout}>Salir</button>
    </div>
  )
}
