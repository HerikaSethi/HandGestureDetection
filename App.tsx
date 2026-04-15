import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { View, Text, StyleSheet, Dimensions, TouchableOpacity } from 'react-native'
import { Camera, useCameraDevice, useFrameProcessor, VisionCameraProxy } from 'react-native-vision-camera'
import { Worklets } from 'react-native-worklets-core'
import Svg, { Path } from 'react-native-svg'

const detectHandsPlugin = VisionCameraProxy.initFrameProcessorPlugin('detectHands', {})

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')
const CAMERA_RENDER_HEIGHT = SCREEN_WIDTH * (640 / 480)
const CAMERA_OFFSET_Y = (SCREEN_HEIGHT - CAMERA_RENDER_HEIGHT) / 2

// CONFIG
const SMOOTHING = 0.6
const MIN_DISTANCE = 4
const PINCH_THRESHOLD = 0.06

// Convert normalized → screen
const toScreen = (point: any, isFront: boolean) => ({
  x: (isFront ? 1 - point.x : point.x) * SCREEN_WIDTH,
  y: CAMERA_OFFSET_Y + point.y * CAMERA_RENDER_HEIGHT,
})

// Distance between 2 points
const getDistance = (a: any, b: any) => {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

// Pinch detection
const getMode = (landmarks: any[]): 'draw' | 'idle' => {
  const thumb = landmarks[4]
  const index = landmarks[8]

  const dist = getDistance(thumb, index)

  if (dist < PINCH_THRESHOLD) return 'draw'
  return 'idle'
}

export default function App() {
  const device = useCameraDevice('front')
  const [hasPermission, setHasPermission] = useState<boolean | null>(null)

  const [hands, setHands] = useState<any[]>([])
  const [mode, setMode] = useState<'draw' | 'idle'>('idle')

  const [paths, setPaths] = useState<string[]>([])
  const [currentPath, setCurrentPath] = useState<string>('')

  const lastPointRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    Camera.requestCameraPermission().then((status) => {
      setHasPermission(status === 'granted')
    })
  }, [])

  const onResult = useCallback((data: any) => {
    if (!data?.hands?.length) {
      setHands([])
      setMode('idle')

      setCurrentPath(prev => {
        if (prev) setPaths(p => [...p, prev])
        return ''
      })

      lastPointRef.current = null
      return
    }

    const landmarks = data.hands[0].landmarks
    setHands(data.hands)

    const detectedMode = getMode(landmarks)
    setMode(detectedMode)

    if (detectedMode === 'draw') {
      let { x, y } = toScreen(landmarks[8], true)

      // smoothing
      if (lastPointRef.current) {
        x = lastPointRef.current.x * SMOOTHING + x * (1 - SMOOTHING)
        y = lastPointRef.current.y * SMOOTHING + y * (1 - SMOOTHING)

        // jitter filter
        const dx = x - lastPointRef.current.x
        const dy = y - lastPointRef.current.y
        const dist = Math.sqrt(dx * dx + dy * dy)

        if (dist < MIN_DISTANCE) return
      }

      if (!lastPointRef.current) {
        setCurrentPath(`M${x.toFixed(1)},${y.toFixed(1)}`)
      } else {
        const lx = lastPointRef.current.x
        const ly = lastPointRef.current.y

        const mx = (lx + x) / 2
        const my = (ly + y) / 2

        setCurrentPath(prev =>
          `${prev} Q${lx.toFixed(1)},${ly.toFixed(1)} ${mx.toFixed(1)},${my.toFixed(1)}`
        )
      }

      lastPointRef.current = { x, y }

    } else {
      // stop drawing
      if (currentPath) {
        setPaths(prev => [...prev, currentPath])
        setCurrentPath('')
      }
      lastPointRef.current = null
    }

  }, [currentPath])

  const onResultJS = useMemo(() => Worklets.createRunOnJS(onResult), [onResult])

  // frame skipping for performance
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

      {/* Drawing */}
      <Svg style={StyleSheet.absoluteFill}>
        {paths.map((d, i) => (
          <Path key={i} d={d} stroke="#FF3B30" strokeWidth={4} fill="none" strokeLinecap="round" />
        ))}
        {currentPath ? (
          <Path d={currentPath} stroke="#FF3B30" strokeWidth={4} fill="none" strokeLinecap="round" />
        ) : null}
      </Svg>

      {/* fingertip indicator */}
      {hands.length > 0 && (() => {
        const { x, y } = toScreen(hands[0].landmarks[8], true)
        return (
          <View style={[styles.dot, {
            left: x - 10,
            top: y - 10,
            backgroundColor: mode === 'draw' ? '#FF3B30' : 'rgba(255,255,255,0.5)'
          }]} />
        )
      })()}

      {/* Mode label */}
      <View style={styles.modeBox}>
        <Text style={{ color: 'white' }}>
          {mode === 'draw' ? '✏️ Drawing (Pinch)' : '✋ Open hand'}
        </Text>
      </View>

      {/* Clear button */}
      <TouchableOpacity
        style={styles.clearBtn}
        onPress={() => {
          setPaths([])
          setCurrentPath('')
        }}>
        <Text style={{ color: 'white' }}>Clear</Text>
      </TouchableOpacity>

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
  modeBox: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 10,
    borderRadius: 10,
  },
  clearBtn: {
    position: 'absolute',
    bottom: 50,
    alignSelf: 'center',
    backgroundColor: 'red',
    padding: 12,
    borderRadius: 20,
  },
})