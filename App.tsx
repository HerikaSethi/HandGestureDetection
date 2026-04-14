import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { View, Text, StyleSheet, Dimensions } from 'react-native'
import {
  Camera,
  useCameraDevice,
  useFrameProcessor,
  VisionCameraProxy,
} from 'react-native-vision-camera'
import { Worklets } from 'react-native-worklets-core'

const detectHandsPlugin = VisionCameraProxy.initFrameProcessorPlugin('detectHands', {})

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')

// All 21 points — tips are bigger
const TIP_POINTS = [4, 8, 12, 16, 20]

// Camera frame is 640x480 landscape, rotated 90° on phone = 480x640
// So on screen: width=480 maps to SCREEN_WIDTH, height=640 maps to SCREEN_HEIGHT
const CAMERA_RENDER_WIDTH = SCREEN_WIDTH
const CAMERA_RENDER_HEIGHT = SCREEN_WIDTH * (640 / 480)
const CAMERA_OFFSET_Y = (SCREEN_HEIGHT - CAMERA_RENDER_HEIGHT) / 2

const classifyGesture = (landmarks: any[]): string => {
  const thumbTip  = landmarks[4],  thumbMCP  = landmarks[1]
  const indexTip  = landmarks[8],  indexMCP  = landmarks[5]
  const middleTip = landmarks[12], middleMCP = landmarks[9]
  const ringTip   = landmarks[16], ringMCP   = landmarks[13]
  const pinkyTip  = landmarks[20], pinkyMCP  = landmarks[17]

  // For front camera x is flipped so thumb logic flips too
  const thumbUp  = thumbTip.x > thumbMCP.x  // flipped for front camera
  const indexUp  = indexTip.y  < indexMCP.y
  const middleUp = middleTip.y < middleMCP.y
  const ringUp   = ringTip.y   < ringMCP.y
  const pinkyUp  = pinkyTip.y  < pinkyMCP.y

  if (!indexUp && !middleUp && !ringUp && !pinkyUp && !thumbUp) return 'A'
  if ( indexUp &&  middleUp &&  ringUp &&  pinkyUp)             return 'B'
  if ( indexUp && !middleUp && !ringUp && !pinkyUp)             return 'D'
  if ( indexUp &&  middleUp && !ringUp && !pinkyUp && !thumbUp) return 'V'
  if (!indexUp && !middleUp && !ringUp &&  pinkyUp)             return 'I'
  if ( thumbUp &&  indexUp  && !middleUp && !ringUp && !pinkyUp) return 'L'
  if ( indexUp &&  middleUp &&  ringUp  && !pinkyUp)            return 'W'
  if ( thumbUp && !indexUp  && !middleUp && !ringUp &&  pinkyUp) return 'Y'
  return '?'
}

export default function App() {
  const device = useCameraDevice('front')
  const [hasPermission, setHasPermission] = useState<boolean | null>(null)
  const [hands, setHands] = useState<any[]>([])
  const [detectedSign, setDetectedSign] = useState<string>('Show your hand')

  useEffect(() => {
    Camera.requestCameraPermission().then((status) => {
      setHasPermission(status === 'granted')
    })
  }, [])

  const onResult = useCallback((data: any) => {
    if (data?.hands?.length > 0) {
      setHands(data.hands)
      setDetectedSign(classifyGesture(data.hands[0].landmarks))
    } else {
      setHands([])
      setDetectedSign('Show your hand')
    }
  }, [])

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

  return (
    <View style={styles.container}>

      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        frameProcessor={frameProcessor}
      />

      {/* Landmark dots overlay */}
      <View style={StyleSheet.absoluteFill}>
        {hands.map((hand: any, handIndex: number) =>
          hand?.landmarks?.map((point: any, pointIndex: number) => {
            const isTip = TIP_POINTS.includes(pointIndex)

            // ✅ Flip x for front camera, offset y for aspect ratio
            const x = (1 - point.x) * CAMERA_RENDER_WIDTH
            const y = CAMERA_OFFSET_Y + point.y * CAMERA_RENDER_HEIGHT
            const size = isTip ? 14 : 8

            return (
              <View
                key={`${handIndex}-${pointIndex}`}
                style={{
                  position: 'absolute',
                  left: x - size / 2,
                  top: y - size / 2,
                  width: size,
                  height: size,
                  borderRadius: size / 2,
                  backgroundColor: isTip ? '#FF3B30' : 'rgba(255,255,255,0.7)',
                }}
              />
            )
          })
        )}
      </View>

      {/* Hands count — top */}
      <View style={styles.topBadge}>
        <Text style={styles.topBadgeText}>
          {hands.length > 0
            ? `${hands.length} hand${hands.length > 1 ? 's' : ''} detected`
            : 'No hands detected'}
        </Text>
      </View>

      {/* Detected sign — bottom */}
      <View style={styles.bottomOverlay}>
        <Text style={styles.signLabel}>Sign</Text>
        <Text style={styles.signText}>{detectedSign}</Text>
      </View>

    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  topBadge: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  topBadgeText: {
    color: 'white',
    fontSize: 14,
  },
  bottomOverlay: {
    position: 'absolute',
    bottom: 60,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 40,
    paddingVertical: 20,
    borderRadius: 16,
    alignItems: 'center',
  },
  signLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    marginBottom: 4,
  },
  signText: {
    color: 'white',
    fontSize: 72,
    fontWeight: '700',
  },
})