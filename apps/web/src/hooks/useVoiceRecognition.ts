import { useState, useCallback, useRef, useEffect } from 'react'

export type VoiceState = 'idle' | 'listening' | 'processing'

const ERROR_MESSAGES: Record<string, string> = {
  'not-allowed': 'Permiso de micrófono denegado. Habilítalo en la configuración del navegador.',
  'no-speech': 'No se detectó voz. Intenta de nuevo.',
  'network': 'Error de red. Verifica tu conexión a internet.',
  'audio-capture': 'No se encontró micrófono. Conecta uno e intenta de nuevo.',
  'service-not-allowed': 'Servicio de voz no disponible. Usa Chrome o Edge.',
}

export function useVoiceRecognition(onResult: (text: string) => void) {
  const [state, setState] = useState<VoiceState>('idle')
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<any>(null)
  const onResultRef = useRef(onResult)
  const processingTimerRef = useRef<ReturnType<typeof setTimeout>>(null)

  useEffect(() => {
    onResultRef.current = onResult
  }, [onResult])

  const resetProcessingTimer = useCallback(() => {
    if (processingTimerRef.current) clearTimeout(processingTimerRef.current)
    processingTimerRef.current = setTimeout(() => {
      setState(prev => prev === 'processing' ? 'idle' : prev)
    }, 5000)
  }, [])

  const getRecognition = useCallback(() => {
    if (recognitionRef.current) return recognitionRef.current

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) return null

    const recognition = new SpeechRecognition()
    recognition.lang = 'es-ES'
    recognition.continuous = false
    recognition.interimResults = true

    recognition.onresult = (event: any) => {
      const last = event.results.length - 1
      const result = event.results[last]
      const text = result[0].transcript

      if (result.isFinal) {
        setTranscript(text)
        setError(null)
        setState('processing')
        resetProcessingTimer()
        onResultRef.current(text)
      } else {
        setTranscript(text)
      }
    }

    recognition.onerror = (e: any) => {
      console.error('[Voice] Error:', e.error)
      if (e.error === 'aborted') return
      setError(ERROR_MESSAGES[e.error] ?? `Error de voz: ${e.error}`)
      setState('idle')
    }

    recognition.onend = () => {
      setState(prev => prev === 'processing' ? prev : 'idle')
    }

    recognitionRef.current = recognition
    return recognition
  }, [resetProcessingTimer])

  const startListening = useCallback(() => {
    const recognition = getRecognition()
    if (!recognition) return

    setError(null)

    // Destroy and recreate if previously used — avoids stale state in some browsers
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch { /* noop */ }
      recognitionRef.current = null
    }
    const fresh = getRecognition()!

    try {
      setState('listening')
      fresh.start()
    } catch {
      setState('idle')
      setError('No se pudo iniciar el reconocimiento de voz.')
    }
  }, [getRecognition])

  const stopListening = useCallback(() => {
    const recognition = recognitionRef.current
    if (!recognition) return
    try {
      recognition.stop()
    } catch {
      // Already stopped
    }
  }, [])

  const isSupported = typeof window !== 'undefined' &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)

  return {
    state,
    transcript,
    error,
    startListening,
    stopListening,
    isSupported,
  }
}
