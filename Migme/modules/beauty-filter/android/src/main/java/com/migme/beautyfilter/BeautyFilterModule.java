package com.migme.beautyfilter;

import androidx.annotation.NonNull;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.module.annotations.ReactModule;

import com.oney.WebRTCModule.videoEffects.ProcessorProvider;

@ReactModule(name = BeautyFilterModule.NAME)
public class BeautyFilterModule extends NativeBeautyFilterSpec {

    static final String NAME = "BeautyFilter";
    private static BeautyFrameProcessor processor;

    public BeautyFilterModule(ReactApplicationContext context) {
        super(context);
        ensureRegistered();
    }

    private static synchronized void ensureRegistered() {
        if (processor == null) {
            processor = new BeautyFrameProcessor();
            ProcessorProvider.addProcessor("beauty", () -> processor);
        }
    }

    @NonNull
    @Override
    public String getName() { return NAME; }

    @Override
    @ReactMethod
    public void setBeautyParams(ReadableMap params) {
        if (processor == null) return;
        float smooth    = params.hasKey("smooth")    ? (float) params.getDouble("smooth")    : 0f;
        float bright    = params.hasKey("bright")    ? (float) params.getDouble("bright")    : 0f;
        float rosiness  = params.hasKey("rosiness")  ? (float) params.getDouble("rosiness")  : 0f;
        boolean enabled = params.hasKey("enabled") && params.getBoolean("enabled");
        processor.setParams(smooth, bright, rosiness, enabled);
    }
}