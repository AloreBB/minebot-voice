# MineBot

Bot autonomo de Minecraft con dashboard web para control por voz y texto, potenciado por Claude AI.

MineBot se conecta a tu servidor de Minecraft como un jugador mas. Recolecta recursos, combate mobs, gestiona su inventario y responde a tus comandos en lenguaje natural (espanol). Cuando no tiene ordenes, sigue operando de forma autonoma.

## Arquitectura

```
apps/
  bot/     - Backend Node.js (Express + Socket.io + mineflayer)
  web/     - Frontend React 19 (Vite)
packages/
  shared/  - Tipos TypeScript compartidos
```

**Stack:** TypeScript, mineflayer, Anthropic Claude API, Socket.io, React 19, Vite, Docker

## Funcionalidades

### Bot Autonomo
- **Recoleccion** - Recoge madera y mina ores automaticamente
- **Combate** - Detecta mobs hostiles, pelea o huye segun su salud
- **Inventario** - Descarta items basura cuando se llena
- **Dormir** - Busca camas automaticamente cuando es de noche
- **Inmunidad** - Se aplica Resistance 255 al spawnear (no pierde loot)

### Dashboard Web
- **Control por voz** - Push-to-talk o toggle con reconocimiento de voz del navegador (Chrome/Edge)
- **Control por texto** - Campo de texto para escribir comandos
- **Stats en tiempo real** - Salud, comida, XP, posicion, clima
- **Inventario** - Grid 9x4 actualizado en tiempo real
- **Feed de actividad** - Log de acciones, combate y eventos

### Inteligencia Artificial
Claude interpreta comandos en lenguaje natural y los traduce a acciones:

```
Tu: "ve a minar diamantes"
Bot: Entendido, voy a cavar hasta Y=-59 para buscar diamantes
     -> digDown to Y=-59
     -> mine diamond_ore x10
```

**Acciones disponibles:** moveTo, mine, digDown, follow, attack, craft, equipItem, dropItem, stop, say, sleep

## Requisitos

- Docker y Docker Compose
- API key de [Anthropic](https://console.anthropic.com/) (para Claude AI)
- Minecraft Java Edition o Bedrock Edition (via Geyser)

## Instalacion

### 1. Clonar y configurar

```bash
git clone <repo-url> minecraft
cd minecraft
cp .env.example .env
```

Editar `.env`:

```env
ANTHROPIC_API_KEY=sk-ant-tu-key-aqui
ACCESS_PASSWORD=tu-password-para-el-dashboard
JWT_SECRET=genera-un-string-aleatorio-largo
```

### 2. Levantar con Docker

```bash
docker compose up -d
```

Esto levanta:
- **Minecraft Server** (Paper, Java 21) en puerto `25565` (Java) y `19132` (Bedrock via Geyser)
- **MineBot** con dashboard web en puerto `3001`

### 3. Conectarse

- **Minecraft:** Conecta a `tu-ip:25565` (Java) o `tu-ip:19132` (Bedrock)
- **Dashboard:** Abre `http://tu-ip:3001` e ingresa tu password

## Despliegue con Dokploy

El `docker-compose.yml` esta listo para Dokploy:

1. Crear un servicio Compose en Dokploy apuntando al repo
2. Configurar las variables de entorno en Dokploy (las del `.env`)
3. Agregar dominio al servicio `minebot` (ej: `voice.mc.tudominio.com`)
4. Dokploy maneja SSL y routing via Traefik automaticamente

El servidor de Minecraft queda accesible en los puertos 25565/19132 directamente.

## Desarrollo local

```bash
# Instalar dependencias
yarn install

# Build completo
yarn build

# Dev mode (requiere servidor Minecraft corriendo)
yarn dev
```

### Estructura del bot

| Archivo | Responsabilidad |
|---------|----------------|
| `bot/index.ts` | Conexion mineflayer + reconexion |
| `bot/state-machine.ts` | Evaluacion de estado (surviving > command > maintaining > idle) |
| `bot/behaviors.ts` | Comportamientos autonomos por estado |
| `bot/actions.ts` | Ejecucion de acciones individuales |
| `bot/plugins.ts` | Plugins mineflayer (pathfinder, auto-eat, pvp, etc.) |
| `ai/command-parser.ts` | Integracion con Claude API |
| `socket/events.ts` | Bridge Socket.io entre bot y dashboard |

## Whitelist

El servidor usa whitelist. Los jugadores permitidos se configuran en `docker-compose.yml`:

```yaml
WHITELIST: "Player1,MineBot,Player2"
```

Para agregar jugadores, modifica la variable y reinicia el contenedor.

## Comandos de ejemplo

| Comando | Que hace |
|---------|----------|
| "sigueme" | El bot te sigue |
| "mina 10 bloques de hierro" | Busca y mina iron_ore |
| "ve a dormir" | Busca la cama mas cercana y duerme |
| "para" | Detiene todas las actividades |
| "crafteame una mesa de crafteo" | Craftea una crafting_table |
| "deja la basura" | Tira items no deseados |
| "ve a las coordenadas 100 64 200" | Se mueve a esa posicion |

## Licencia

MIT
