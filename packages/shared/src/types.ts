// Bot state for the autonomous state machine
export type BotState = 'surviving' | 'executing_command' | 'maintaining' | 'idle'

// Connection status
export type BotStatus = 'connecting' | 'connected' | 'disconnected' | 'dead'

// Stats sent every 1s from server to client
export interface BotStats {
  health: number
  food: number
  xp: { level: number; progress: number }
  position: { x: number; y: number; z: number }
  state: BotState
  timeOfDay: number
  isRaining: boolean
}

// Single inventory item
export interface InventoryItem {
  slot: number
  name: string
  displayName: string
  count: number
}

// Activity feed entry
export interface ActivityEvent {
  id: string
  timestamp: number
  type: 'danger' | 'command' | 'action' | 'info'
  message: string
}

// Voice command from client
export interface VoiceCommand {
  text: string
  timestamp: number
}

// Claude's parsed response
export interface CommandResponse {
  understood: string
  actions: BotAction[]
}

// All possible bot actions (fixed schema, Claude picks from these)
export type BotAction =
  | { action: 'moveTo'; x: number; y: number; z: number }
  | { action: 'mine'; block: string; count: number }
  | { action: 'digDown'; toY: number }
  | { action: 'follow'; player: string }
  | { action: 'attack'; entity: string }
  | { action: 'craft'; item: string }
  | { action: 'equipItem'; item: string; destination: string }
  | { action: 'dropItem'; item: string; count: number }
  | { action: 'stop' }
  | { action: 'say'; message: string }

// Socket.io typed events
export interface ServerToClientEvents {
  'bot:stats': (stats: BotStats) => void
  'bot:inventory': (items: InventoryItem[]) => void
  'bot:activity': (event: ActivityEvent) => void
  'bot:status': (status: BotStatus) => void
  'command:response': (response: CommandResponse) => void
}

export interface ClientToServerEvents {
  'voice:command': (command: VoiceCommand) => void
}

// Auth
export interface LoginRequest {
  password: string
}

export interface LoginResponse {
  token: string
}
