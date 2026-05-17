import React from 'react';
import { EffectComposer, Bloom, HueSaturation, BrightnessContrast } from '@react-three/postprocessing';
import { ENV_SETTINGS } from '../../constants/environment';

export const PostProcessingEffects = ({ environment, lightingMultiplier }) => {
    const envSetting = ENV_SETTINGS[environment || 'day'] || ENV_SETTINGS.day;
    if (!envSetting.effects) return null;

    // Filter out null/undefined children explicitly to prevent EffectComposer from breaking
    return (
        <EffectComposer disableNormalPass multisampling={0}>
            {envSetting.effects.bloom ? (
                <Bloom 
                    intensity={envSetting.effects.bloom.intensity * (lightingMultiplier || 1)} 
                    luminanceThreshold={envSetting.effects.bloom.luminanceThreshold || 0.6} 
                    luminanceSmoothing={0.9} 
                    height={300} 
                />
            ) : null}
            {envSetting.effects.colorGrading ? (
                <HueSaturation 
                    hue={envSetting.effects.colorGrading.hue || 0} 
                    saturation={envSetting.effects.colorGrading.saturation || 0} 
                />
            ) : null}
            {envSetting.effects.colorGrading ? (
                <BrightnessContrast 
                    brightness={envSetting.effects.colorGrading.brightness || 0} 
                    contrast={envSetting.effects.colorGrading.contrast || 0} 
                />
            ) : null}
        </EffectComposer>
    );
};