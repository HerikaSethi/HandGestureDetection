import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { View, Text } from 'react-native'
import { Camera, useCameraDevice, useFrameProcessor, VisionCameraProxy } from 'react-native-vision-camera'  // ✅ VisionCameraProxy
import { Worklets } from 'react-native-worklets-core'

// ✅ Initialize plugin OUTSIDE the component at module level
const detectHandsPlugin = VisionCameraProxy.initFrameProcessorPlugin('detectHands', {})

export default function App() {
  const device = useCameraDevice('back')
  const [hasPermission, setHasPermission] = useState<boolean | null>(null)

  useEffect(() => {
    Camera.requestCameraPermission().then((status) => {
      setHasPermission(status === 'granted')
    })
  }, [])

  // const onResult = useCallback((data: any) => {
  //   console.log('Native result:', data)
  // }, [])
  const onResult = useCallback((data: any) => {
  if (data?.hands?.length > 0) {
    console.log('Hands detected:', data.hands.length)
    console.log('First hand landmarks:', data.hands[0].landmarks)
  }
}, [])

  const onResultJS = useMemo(() => Worklets.createRunOnJS(onResult), [onResult])

  const frameProcessor = useFrameProcessor((frame) => {
    'worklet'

    if (detectHandsPlugin == null) {
      console.log('Plugin not found!')  // ✅ will tell us if plugin failed to init
      return
    }

    const result = detectHandsPlugin.call(frame)  // ✅ correct v4 call syntax
    onResultJS(result)
  }, [onResultJS])

  if (hasPermission === null) return <Text>Requesting permission...</Text>
  if (!hasPermission) return <Text>No permission</Text>
  if (device == null) return <Text>Loading camera...</Text>

  return (
    <View style={{ flex: 1 }}>
      <Camera
        style={{ flex: 1 }}
        device={device}
        isActive={true}
        frameProcessor={frameProcessor}
      />
    </View>
  )
}