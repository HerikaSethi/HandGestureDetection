package com.handgestureapp

import android.graphics.Bitmap
import android.graphics.ImageFormat
import android.graphics.BitmapFactory
import android.graphics.Rect
import android.graphics.YuvImage
import android.media.Image
import java.io.ByteArrayOutputStream
import com.mrousavy.camera.frameprocessors.Frame
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin
import com.mrousavy.camera.frameprocessors.VisionCameraProxy
import com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarker
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.framework.image.BitmapImageBuilder

class HandDetectorPlugin(proxy: VisionCameraProxy, options: Map<String, Any>?) : FrameProcessorPlugin() {

    private var handLandmarker: HandLandmarker? = null

    init {
        val baseOptions = BaseOptions.builder()
            .setModelAssetPath("hand_landmarker.task")
            .build()

        val handOptions = HandLandmarker.HandLandmarkerOptions.builder()
            .setBaseOptions(baseOptions)
            .setRunningMode(RunningMode.IMAGE)
            .setNumHands(2)
            .build()

        handLandmarker = HandLandmarker.createFromOptions(proxy.context, handOptions)
    }

    private fun yuvToRgbaBitmap(image: Image): Bitmap {
        val yBuffer = image.planes[0].buffer
        val uBuffer = image.planes[1].buffer
        val vBuffer = image.planes[2].buffer

        val ySize = yBuffer.remaining()
        val uSize = uBuffer.remaining()
        val vSize = vBuffer.remaining()

        val nv21 = ByteArray(ySize + uSize + vSize)
        yBuffer.get(nv21, 0, ySize)
        vBuffer.get(nv21, ySize, vSize)
        uBuffer.get(nv21, ySize + vSize, uSize)

        val yuvImage = YuvImage(nv21, ImageFormat.NV21, image.width, image.height, null)
        val out = ByteArrayOutputStream()
        yuvImage.compressToJpeg(Rect(0, 0, image.width, image.height), 100, out)
        val jpegBytes = out.toByteArray()

        val decoded = BitmapFactory.decodeByteArray(jpegBytes, 0, jpegBytes.size)
        return decoded.copy(Bitmap.Config.ARGB_8888, false)
    }

    override fun callback(frame: Frame, params: Map<String, Any>?): Any? {
        val bitmap = yuvToRgbaBitmap(frame.image)
        val mpImage = BitmapImageBuilder(bitmap).build()
        val result = handLandmarker?.detect(mpImage)

        val hands = mutableListOf<Map<String, Any>>()

        result?.landmarks()?.forEachIndexed { handIndex, landmarks ->
            val points = landmarks.map { landmark ->
                mapOf(
                    "x" to landmark.x().toDouble(),  // ✅ toDouble()
                    "y" to landmark.y().toDouble(),  // ✅ toDouble()
                    "z" to landmark.z().toDouble()   // ✅ toDouble()
                )
            }
            hands.add(mapOf(
                "handIndex" to handIndex,
                "landmarks" to points
            ))
        }

        return mapOf("hands" to hands)
    }
}