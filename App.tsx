import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { View, Text, StyleSheet, Dimensions } from 'react-native'
import { Camera, useCameraDevice, useFrameProcessor, VisionCameraProxy } from 'react-native-vision-camera'
import { Worklets } from 'react-native-worklets-core'

const detectHandsPlugin = VisionCameraProxy.initFrameProcessorPlugin('detectHands', {})

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')
const CAMERA_RENDER_HEIGHT = SCREEN_WIDTH * (640 / 480)
const CAMERA_OFFSET_Y = (SCREEN_HEIGHT - CAMERA_RENDER_HEIGHT) / 2

const PINCH_THRESHOLD = 0.06

const toScreen = (point: any, isFront: boolean) => ({
  x: (isFront ? 1 - point.x : point.x) * SCREEN_WIDTH,
  y: CAMERA_OFFSET_Y + point.y * CAMERA_RENDER_HEIGHT,
})

const getDistance = (a: any, b: any) => {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

const getMode = (landmarks: any[]): 'draw' | 'idle' => {
  const thumb = landmarks[4]
  const index = landmarks[8]
  const dist = getDistance(thumb, index)
  return dist < PINCH_THRESHOLD ? 'draw' : 'idle'
}

export default function App() {
  const device = useCameraDevice('front')
  const [hasPermission, setHasPermission] = useState<boolean | null>(null)

  const [hands, setHands] = useState<any[]>([])
  const [mode, setMode] = useState<'draw' | 'idle'>('idle')

  const [finger, setFinger] = useState<{ x: number; y: number } | null>(null)

  const [balloons, setBalloons] = useState<{ id: number; x: number; y: number }[]>([])
  const [score, setScore] = useState(0)

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
      setHands([])
      setMode('idle')
      setFinger(null)
      return
    }

    const landmarks = data.hands[0].landmarks
    setHands(data.hands)

    const detectedMode = getMode(landmarks)
    setMode(detectedMode)

    const { x, y } = toScreen(landmarks[8], true)
    setFinger({ x, y })

    // 🎯 Collision detection
    if (detectedMode === 'draw') {
      setBalloons(prev => {
        const remaining: typeof prev = []

        prev.forEach(b => {
          const dx = x - b.x
          const dy = y - b.y
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist < 40) {
            // 💥 POP!
            setScore(s => s + 1)
          } else {
            remaining.push(b)
          }
        })

        return remaining
      })
    }

  }, [])

  const onResultJS = useMemo(() => Worklets.createRunOnJS(onResult), [onResult])

  const frameCount = useRef(0)

  const frameProcessor = useFrameProcessor((frame) => {
    'worklet'

    frameCount.current++
    if (frameCount.current % 2 !== 0) return

    if (detectHandsPlugin == null) return
    const result = detectHandsPlugin.call(frame)
    onResultJS(result)
  }, [onResultJS])

  if (hasPermission === null) return <Text>Requesting permission...</Text>
  if (!hasPermission) return <Text>No permission</Text>
  if (device == null) return <Text>Loading camera...</Text>

  return (
    <View style={styles.container}>

      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
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
            backgroundColor: 'skyblue',
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
      <View style={styles.scoreBox}>
        <Text style={styles.scoreText}>Score: {score}</Text>
      </View>

      {/* Mode */}
      <View style={styles.modeBox}>
        <Text style={{ color: 'white' }}>
          {mode === 'draw' ? '🤏 Pinch = Pop' : '✋ Move hand'}
        </Text>
      </View>

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

  scoreBox: {
    position: 'absolute',
    top: 50,
    left: 20,
  },

  scoreText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },

  modeBox: {
    position: 'absolute',
    top: 50,
    right: 20,
  },
})