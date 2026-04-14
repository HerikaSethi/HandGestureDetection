package com.handgestureapp

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.mrousavy.camera.frameprocessors.FrameProcessorPluginRegistry

class MainApplication : Application(), ReactApplication {

    override val reactHost: ReactHost by lazy {
        getDefaultReactHost(
            context = applicationContext,
            packageList = PackageList(this).packages.apply { },
        )
    }

    override fun onCreate() {
        super.onCreate()

        // ✅ Register BEFORE loadReactNative
        FrameProcessorPluginRegistry.addFrameProcessorPlugin("detectHands") { proxy, options ->
            HandDetectorPlugin(proxy, options)
        }

        loadReactNative(this)  // ✅ After plugin registration
    }
}