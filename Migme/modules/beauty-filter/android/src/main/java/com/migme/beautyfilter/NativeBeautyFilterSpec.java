package com.migme.beautyfilter;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.turbomodule.core.interfaces.TurboModule;

public abstract class NativeBeautyFilterSpec extends com.facebook.react.bridge.ReactContextBaseJavaModule
        implements TurboModule {

    public NativeBeautyFilterSpec(ReactApplicationContext context) {
        super(context);
    }

    public abstract void setBeautyParams(ReadableMap params);
        }