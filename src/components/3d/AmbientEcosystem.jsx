import React from 'react';
import { DustMotes } from './ambient/DustMotes';
import { CloudShadows } from './ambient/CloudShadows';
import { FlockingBirds } from './ambient/FlockingBirds';
import { FallingLeaves } from './ambient/FallingLeaves';
import { ScuttlingCritters } from './ambient/ScuttlingCritters';
import { FloatingSpores } from './ambient/FloatingSpores';

export const AmbientEcosystem = ({ environment, ambientLifeLevel = 'off' }) => {
    if (ambientLifeLevel === 'off') return null;

    const isHigh = ambientLifeLevel === 'high';

    // Biome-specific Bird Configurations
    const getBirdConfig = (env) => {
        switch (env) {
            case 'city': return { count: 20, color: '#4b5563', speed: 1.5, scale: 0.8, altitude: 10 }; // Pigeons/Crows
            case 'coast': return { count: 30, color: '#94a3b8', speed: 0.8, scale: 1.6, altitude: 10 }; // Seagulls
            case 'desert': return { count: 5, color: '#1c1917', speed: 0.4, scale: 2.0, altitude: 25 }; // Buzzards/Vultures
            case 'forest': return { count: 25, color: '#3f271d', speed: 1.2, scale: 1.0, altitude: 12 }; // Woodland birds
            default: return { count: 15, color: '#333333', speed: 1.0, scale: 1.0, altitude: 15 };
        }
    };

    const birdConfig = getBirdConfig(environment);

    return (
        <group name="ambient-ecosystem">
            {/* Dust Motes: Drastically reduced for a subtle atmosphere */}
            {['generic'].includes(environment) && (
                <DustMotes count={isHigh ? 100 : 30} speed={0.2} opacity={0.3} color="#ffffff" />
            )}
            {['dungeon'].includes(environment) && (
                <>
                    <DustMotes count={isHigh ? 60 : 15} speed={0.1} opacity={0.2} color="#888888" />
                    {isHigh && <DustMotes count={15} speed={0.5} opacity={0.6} color="#ff7700" size={1.5} />} {/* Embers */}
                </>
            )}
            {['city'].includes(environment) && (
                <>
                    <DustMotes count={isHigh ? 100 : 30} speed={0.3} opacity={0.3} color="#aaaaaa" />
                    {isHigh && <DustMotes count={20} speed={0.8} opacity={0.2} color="#cccccc" size={3.0} />} {/* Smoke/Steam */}
                </>
            )}
            {/* Fast horizontal mist/salt */}
            {['coast'].includes(environment) && (
                <DustMotes count={isHigh ? 150 : 50} speed={2.5} opacity={0.4} color="#e2e8f0" size={0.5} horizontal={true} />
            )}
            {/* Low blowing sand */}
            {['desert'].includes(environment) && (
                <DustMotes count={isHigh ? 200 : 70} speed={3.0} opacity={0.5} color="#d6d3d1" size={0.4} horizontal={true} altitude={2} />
            )}

            {/* Cloud Shadows: Outdoors */}
            {['forest', 'desert', 'coast', 'generic', 'city'].includes(environment) && (
                <CloudShadows speed={environment === 'coast' || environment === 'desert' ? 1.5 : 0.5} />
            )}

            {/* Spores: Damp/Underground - Reduced count */}
            {['dungeon', 'forest'].includes(environment) && (
                <FloatingSpores count={isHigh ? 150 : 50} />
            )}

            {/* High-Performance/Boids (Fauna) */}
            {isHigh && (
                <>
                    {/* Flocking Birds: Outdoors (Customized by Biome) */}
                    {['forest', 'coast', 'city', 'desert'].includes(environment) && (
                        <FlockingBirds {...birdConfig} />
                    )}
                    
                    {/* Falling Leaves: Forests (Reduced Clutter) */}
                    {environment === 'forest' && <FallingLeaves count={200} color="#4ade80" emissive="#4ade80" emissiveIntensity={0.8} />}
                    
                    {/* Scuttling Critters: Dungeons/Cities (Sparse and Quick) */}
                    {['dungeon', 'city'].includes(environment) && (
                        <ScuttlingCritters count={environment === 'dungeon' ? 3 : 5} speed={environment === 'dungeon' ? 1.5 : 1.0} />
                    )}
                </>
            )}
        </group>
    );
};
