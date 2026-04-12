import { useState, useCallback, useRef } from 'react'

export type VoiceState = 'idle' | 'listening' | 'processing'

interface SpeechRecognitionEvent {
  results: { [key: number]: { [key: number]: { transcript: string } }; length: number }
}

export function useVoiceRecognition(onResult: (text: string) => void) {
  const [state, setState] = useState<VoiceState>('idle')
  const [transcript, setTranscript] = useState('')
  const recognitionRef = useRef<any>(null)
  const isToggleMode = useRef(false)

  const getRecognition = useCallback(() => {
    if (recognitionRef.current) return recognitionRef.current

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) return null

    const recognition = new SpeechRecognition()
    recognition.lang = 'es-ES'
    recognition.continuous = false
    recognition.interimResults = false

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const text = event.results[0][0].transcript
      setTranscript(text)
      setState('processing')
      onResult(text)
    }

    recognition.onerror = () => {
      setState('idle')
    }

    recognition.onend = () => {
      if (!isToggleMode.current) {
        setState(prev => prev === 'processing' ? prev : 'idle')
      }
    }

    recognitionRef.current = recognition
    return recognition
  }, [onResult])

  const startListening = useCallback(() => {
    const recognition = getRecognition()
    if (!recognition) return
    isToggleMode.current = false
    setState('listening')
    recognition.start()
  }, [getRecognition])

  const stopListening = useCallback(() => {
    const recognition = recognitionRef.current
    if (!recognition) return
    recognition.stop()
  }, [])

  const toggleListening = useCallback(() => {
    const recognition = getRecognition()
    if (!recognition) return

    if (state === 'listening') {
      isToggleMode.current = false
      recognition.stop()
    } else {
      isToggleMode.current = true
      setState('listening')
      recognition.start()
    }
  }, [state, getRecognition])

  const isSupported = typeof window !== 'undefined' &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)

  return {
    state,
    transcript,
    startListening,
    stopListening,
    toggleListening,
    isSupported,
  }
}
