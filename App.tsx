import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { View, Text, StyleSheet, Dimensions } from 'react-native'
import { Camera, useCameraDevice, useFrameProcessor, VisionCameraProxy } from 'react-native-vision-camera'
import { Worklets } from 'react-native-worklets-core'

const detectHandsPlugin = VisionCameraProxy.initFrameProcessorPlugin('detectHands', {})

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')
const CAMERA_RENDER_HEIGHT = SCREEN_WIDTH * (640 / 480)
const CAMERA_OFFSET_Y = (SCREEN_HEIGHT - CAMERA_RENDER_HEIGHT) / 2

const PINCH_THRESHOLD = 0.08

const toScreen = (point: any, isFront: boolean) => ({
  x: (isFront ? 1 - point.y : point.y) * SCREEN_WIDTH,
  y: CAMERA_OFFSET_Y + (1 - point.x) * CAMERA_RENDER_HEIGHT,  // ✅ added 1 -
})
const getDistance = (a: any, b: any) => {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

const getMode = (landmarks: any[]): 'draw' | 'idle' => {
  const dist = getDistance(landmarks[4], landmarks[8])
  return dist < PINCH_THRESHOLD ? 'draw' : 'idle'
}

export default function App() {
  const device = useCameraDevice('front')
  const [hasPermission, setHasPermission] = useState<boolean | null>(null)

  const [mode, setMode] = useState<'draw' | 'idle'>('idle')
  const [finger, setFinger] = useState<{ x: number; y: number } | null>(null)

  const [balloons, setBalloons] = useState<{ id: number; x: number; y: number }[]>([])
  const [score, setScore] = useState(0)

  const lastPopTime = useRef(0)
  const frameCount = useRef(0)

  useEffect(() => {
    Camera.requestCameraPermission().then((status) => {
      setHasPermission(status === 'granted')
    })
  }, [])

  // 🎈 Spawn balloons
  useEffect(() => {
    const interval = setInterval(() => {
      setBalloons(prev => [
        ...prev,
        {
          id: Date.now(),
          x: Math.random() * SCREEN_WIDTH,
          y: SCREEN_HEIGHT + 50,
        }
      ])
    }, 1200)

    return () => clearInterval(interval)
  }, [])

  // 🎈 Move balloons
  useEffect(() => {
    const interval = setInterval(() => {
      setBalloons(prev =>
        prev
          .map(b => ({ ...b, y: b.y - 4 }))
          .filter(b => b.y > -50)
      )
    }, 40)

    return () => clearInterval(interval)
  }, [])

  const onResult = useCallback((data: any) => {
    if (!data?.hands?.length) {
      setMode('idle')
      setFinger(null)
      return
    }

    const landmarks = data.hands[0].landmarks

    const detectedMode = getMode(landmarks)
    setMode(detectedMode)

    const { x, y } = toScreen(landmarks[8], true)
    setFinger({ x, y })

    const now = Date.now()
    if (now - lastPopTime.current < 150) return

    if (detectedMode === 'draw') {
      setBalloons(prev => {
        let popped = false

        const remaining = prev.filter(b => {
          const dx = x - b.x
          const dy = y - b.y
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist < 40 && !popped) {
            popped = true
            lastPopTime.current = now
            setScore(s => s + 1)
            return false
          }
          return true
        })

        return remaining
      })
    }

  }, [])

  const onResultJS = useMemo(() => Worklets.createRunOnJS(onResult), [onResult])

  const frameProcessor = useFrameProcessor((frame) => {
    'worklet'

    frameCount.current++
    if (frameCount.current % 2 !== 0) return

    if (!detectHandsPlugin) return

    const result = detectHandsPlugin.call(frame)
    onResultJS(result)

  }, [onResultJS])

  if (hasPermission === null) return <Text>Requesting permission...</Text>
  if (!hasPermission) return <Text>No permission</Text>
  if (!device) return <Text>Loading camera...</Text>

  return (
    <View style={styles.container}>

      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive
        frameProcessor={frameProcessor}
      />

      {/* 🎈 Balloons */}
      {balloons.map(b => (
        <View
          key={b.id}
          style={{
            position: 'absolute',
            left: b.x - 25,
            top: b.y - 25,
            width: 50,
            height: 50,
            borderRadius: 25,
            backgroundColor: '#4FC3F7',
          }}
        />
      ))}

      {/* 👉 Finger cursor */}
      {finger && (
        <View style={[styles.dot, {
          left: finger.x - 10,
          top: finger.y - 10,
          backgroundColor: mode === 'draw' ? '#FF3B30' : 'white'
        }]} />
      )}

      {/* ⭐ Score */}
      <Text style={styles.score}>🎯 {score}</Text>

      {/* Mode */}
      <Text style={styles.mode}>
        {mode === 'draw' ? '🤏 Pinch to Pop' : '✋ Move hand'}
      </Text>

    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },

  dot: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'white',
  },

  score: {
    position: 'absolute',
    top: 60,
    left: 20,
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
  },

  mode: {
    position: 'absolute',
    top: 60,
    right: 20,
    color: 'white',
    fontSize: 16,
  },
})