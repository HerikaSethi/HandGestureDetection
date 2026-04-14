import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { View, Text, StyleSheet, Dimensions, TouchableOpacity } from 'react-native'
import { Camera, useCameraDevice, useFrameProcessor, VisionCameraProxy } from 'react-native-vision-camera'
import { Worklets } from 'react-native-worklets-core'
import Svg, { Path } from 'react-native-svg'  

const detectHandsPlugin = VisionCameraProxy.initFrameProcessorPlugin('detectHands', {})
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')

const CAMERA_RENDER_HEIGHT = SCREEN_WIDTH * (640 / 480)
const CAMERA_OFFSET_Y = (SCREEN_HEIGHT - CAMERA_RENDER_HEIGHT) / 2

// Convert normalized landmark to screen coordinates
const toScreen = (point: any, isFront: boolean) => ({
  x: (isFront ? 1 - point.x : point.x) * SCREEN_WIDTH,
  y: CAMERA_OFFSET_Y + point.y * CAMERA_RENDER_HEIGHT,
})

// Detect which fingers are up
const getFingersUp = (landmarks: any[]) => ({
  index:  landmarks[8].y  < landmarks[5].y,
  middle: landmarks[12].y < landmarks[9].y,
  ring:   landmarks[16].y < landmarks[13].y,
  pinky:  landmarks[20].y < landmarks[17].y,
})

// Detect gesture mode
const getMode = (landmarks: any[]): 'draw' | 'clear' | 'idle' => {
  const f = getFingersUp(landmarks)
  // Only index up = draw
  if (f.index && !f.middle && !f.ring && !f.pinky) return 'draw'
  // All fingers down = clear
  if (!f.index && !f.middle && !f.ring && !f.pinky) return 'clear'
  return 'idle'  // any other combo = pause drawing (lift pen)
}

export default function App() {
  const device = useCameraDevice('front')
  const [hasPermission, setHasPermission] = useState<boolean | null>(null)
  const [hands, setHands] = useState<any[]>([])
  const [mode, setMode] = useState<'draw' | 'clear' | 'idle'>('idle')

  // Drawing state
  const [paths, setPaths] = useState<string[]>([])           // completed paths
  const [currentPath, setCurrentPath] = useState<string>('')  // path being drawn

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
      // Save current path when hand disappears
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

    if (detectedMode === 'clear') {
      // ✅ Fist = clear canvas
      setPaths([])
      setCurrentPath('')
      lastPointRef.current = null
      return
    }

    if (detectedMode === 'draw') {
      // ✅ Index finger up = draw with fingertip
      const tip = landmarks[8]
      const { x, y } = toScreen(tip, true)

      if (lastPointRef.current === null) {
        // Start new stroke
        setCurrentPath(`M${x.toFixed(1)},${y.toFixed(1)}`)
      } else {
        // Continue stroke with smooth curve
        const lx = lastPointRef.current.x
        const ly = lastPointRef.current.y
        const mx = ((lx + x) / 2).toFixed(1)
        const my = ((ly + y) / 2).toFixed(1)
        setCurrentPath(prev => `${prev} Q${lx.toFixed(1)},${ly.toFixed(1)} ${mx},${my}`)
      }
      lastPointRef.current = { x, y }
    } else {
      // idle = lift pen, save stroke
      if (currentPath) {
        setPaths(prev => [...prev, currentPath])
        setCurrentPath('')
      }
      lastPointRef.current = null
    }
  }, [currentPath])

  const onResultJS = useMemo(() => Worklets.createRunOnJS(onResult), [onResult])

  const frameProcessor = useFrameProcessor((frame) => {
    'worklet'
    if (detectHandsPlugin == null) return
    const result = detectHandsPlugin.call(frame)
    onResultJS(result)
  }, [onResultJS])

  if (hasPermission === null) return <Text>Requesting permission...</Text>
  if (!hasPermission) return <Text>No camera permission</Text>
  if (device == null) return <Text>Loading camera...</Text>

  const modeColor = mode === 'draw' ? '#FF3B30' : mode === 'clear' ? '#FF9500' : '#FFFFFF'
  const modeLabel = mode === 'draw' ? '✏️ Drawing' : mode === 'clear' ? '🗑 Clearing...' : '✋ Idle'

  return (
    <View style={styles.container}>

      {/* Camera */}
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        frameProcessor={frameProcessor}
      />

      {/* SVG Drawing Canvas */}
      <Svg style={StyleSheet.absoluteFill}>
        {/* Completed paths */}
        {paths.map((d, i) => (
          <Path key={i} d={d} stroke="#FF3B30" strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        ))}
        {/* Current path being drawn */}
        {currentPath ? (
          <Path d={currentPath} stroke="#FF3B30" strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        ) : null}
      </Svg>

      {/* Fingertip dot — shows where you're drawing */}
      {hands.length > 0 && (() => {
        const tip = hands[0].landmarks[8]
        const { x, y } = toScreen(tip, true)
        return (
          <View style={[styles.fingertipDot, {
            left: x - 10,
            top: y - 10,
            backgroundColor: mode === 'draw' ? '#FF3B30' : 'rgba(255,255,255,0.5)',
            transform: [{ scale: mode === 'draw' ? 1.2 : 1 }]
          }]}/>
        )
      })()}

      {/* Mode indicator */}
      <View style={[styles.modeBadge, { borderColor: modeColor }]}>
        <Text style={[styles.modeText, { color: modeColor }]}>{modeLabel}</Text>
      </View>

      {/* Instructions */}
      <View style={styles.instructions}>
        <Text style={styles.instrText}>☝️ Index up = Draw</Text>
        <Text style={styles.instrText}>✊ Fist = Clear</Text>
        <Text style={styles.instrText}>✋ Other = Pause</Text>
      </View>

      {/* Manual clear button */}
      <TouchableOpacity style={styles.clearBtn} onPress={() => { setPaths([]); setCurrentPath('') }}>
        <Text style={styles.clearBtnText}>Clear</Text>
      </TouchableOpacity>

    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
  fingertipDot: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'white',
  },
  modeBadge: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modeText: { fontSize: 16, fontWeight: '600' },
  instructions: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    padding: 12,
    borderRadius: 12,
    gap: 4,
  },
  instrText: { color: 'white', fontSize: 13 },
  clearBtn: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,59,48,0.8)',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 24,
  },
  clearBtnText: { color: 'white', fontSize: 16, fontWeight: '600' },
})