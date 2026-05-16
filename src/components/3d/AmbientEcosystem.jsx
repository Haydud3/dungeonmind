import React from 'react';
import { DustMotes } from './ambient/DustMotes';
import { CloudShadows } from './ambient/CloudShadows';
import { FlockingBirds } from './ambient/FlockingBirds';
import { FallingLeaves } from './ambient/FallingLeaves';
import { ScuttlingCritters } from './ambient/ScuttlingCritters';
import { FloatingSpores } from './ambient/FloatingSpores';
import { Fireflies } from './ambient/Fireflies';
import { Tumbleweeds } from './ambient/Tumbleweeds';

const FIREFLIES_BOUNDS = { x: 50, y: 8, z: 50 };
const TUMBLEWEEDS_BOUNDS = { x: 50, z: 50 };

export const AmbientEcosystem = ({ environment, ambientLifeLevel = 'off', mapScale = 20, particleDensity = 1.0 }) => {
    if (ambientLifeLevel === 'off') return null;

    const isHigh = ambientLifeLevel === 'high';
    const c = (baseCount) => Math.max(0, Math.floor(baseCount * particleDensity * 0.4));

    // Biome-specific Bird Configurations
    const getBirdConfig = (env) => {
        let base = { count: 15, color: '#333333', speed: 1.0, scale: 1.0, altitude: 15 };
        switch (env) {
            case 'city': base = { count: 20, color: '#4b5563', speed: 1.5, scale: 0.8, altitude: 10 }; break;
            case 'coast': base = { count: 30, color: '#94a3b8', speed: 0.8, scale: 1.6, altitude: 10 }; break;
            case 'desert': base = { count: 5, color: '#1c1917', speed: 0.4, scale: 2.0, altitude: 25 }; break;
            case 'forest': base = { count: 150, color: '#3f271d', speed: 1.2, scale: 1.0, altitude: 12 }; break;
        }
        base.count = c(base.count);
        return base;
    };

    const birdConfig = getBirdConfig(environment);

    return (
        <group name="ambient-ecosystem">
            {/* Dust Motes: Drastically reduced for a subtle atmosphere */}
            {['generic'].includes(environment) && (
                <>
                    <DustMotes count={c(isHigh ? 25 : 8)} speed={0.2} opacity={0.3} color="#ffffff" mapScale={mapScale} />
                    {isHigh && <Fireflies count={c(15)} bounds={FIREFLIES_BOUNDS} mapScale={mapScale} />}
                </>
            )}
            {['dungeon'].includes(environment) && (
                <>
                    <DustMotes count={c(isHigh ? 15 : 5)} speed={0.1} opacity={0.2} color="#888888" mapScale={mapScale} />
                    {isHigh && <DustMotes count={c(5)} speed={0.5} opacity={0.6} color="#ff7700" size={1.5} mapScale={mapScale} />} {/* Embers */}
                </>
            )}
            {['city'].includes(environment) && (
                <>
                    <DustMotes count={c(isHigh ? 25 : 8)} speed={0.3} opacity={0.3} color="#aaaaaa" mapScale={mapScale} />
                    {isHigh && <DustMotes count={c(5)} speed={0.8} opacity={0.2} color="#cccccc" size={3.0} mapScale={mapScale} />} {/* Smoke/Steam */}
                </>
            )}
            {/* Fast horizontal mist/salt */}
            {['coast'].includes(environment) && (
                <DustMotes count={c(isHigh ? 35 : 12)} speed={2.5} opacity={0.4} color="#e2e8f0" size={0.5} horizontal={true} mapScale={mapScale} />
            )}
            {/* Low blowing sand */}
            {['desert'].includes(environment) && (
                <>
                    <DustMotes count={c(isHigh ? 50 : 15)} speed={3.0} opacity={0.5} color="#d6d3d1" size={0.4} horizontal={true} altitude={2} mapScale={mapScale} />
                    {isHigh && <Tumbleweeds count={c(2)} bounds={TUMBLEWEEDS_BOUNDS} />}
                </>
            )}

            {/* Cloud Shadows: Outdoors */}
            {['forest', 'desert', 'coast', 'generic', 'city'].includes(environment) && (
                <CloudShadows speed={environment === 'coast' || environment === 'desert' ? 1.5 : 0.5} />
            )}

            {/* Spores: Damp/Underground - Reduced count */}
            {['dungeon', 'forest'].includes(environment) && (
                <FloatingSpores count={c(isHigh ? 15 : 5)} mapScale={mapScale} />
            )}

            {/* High-Performance/Boids (Fauna) */}
            {isHigh && (
                <>
                    {/* Flocking Birds: Outdoors (Customized by Biome) */}
                    {['forest', 'coast', 'city', 'desert'].includes(environment) && (
                        <FlockingBirds {...birdConfig} mapScale={mapScale} />
                    )}
                    
                    {/* Falling Leaves: Forests (Reduced Clutter) */}
                    {environment === 'forest' && <FallingLeaves count={c(120)} mapScale={mapScale} />
                    }
                    
                    {/* Scuttling Critters: Dungeons/Cities (Sparse and Quick) */}
                    {['dungeon', 'city'].includes(environment) && (
                        <ScuttlingCritters count={c(environment === 'dungeon' ? 3 : 5)} speed={environment === 'dungeon' ? 1.5 : 1.0} />
                    )}
                </>
            )}
        </group>
    );
};
