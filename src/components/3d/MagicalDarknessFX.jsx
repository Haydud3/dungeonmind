import React from 'react';
import * as THREE from 'three';

export const MagicalDarknessFX = ({ volumes, userRole, playerSenses }) => {
    const isDM = userRole === 'dm';
    const canSee = playerSenses?.canSeeInMagicalDarkness;

    if (isDM || canSee || !volumes || volumes.length === 0) {
        return null;
    }

    return (
        <group>
            {volumes.map(volume => {
                if (volume.shape === 'circle') {
                    const radius = Math.hypot(volume.points[1].x - volume.points[0].x, volume.points[1].z - volume.points[0].z);
                    return (
                        <mesh key={volume.id} position={[volume.points[0].x, 1, volume.points[0].z]}>
                            <sphereGeometry args={[radius, 32, 32]} />
                            <meshBasicMaterial color="black" opacity={0.5} transparent />
                        </mesh>
                    );
                }
                if (volume.shape === 'box') {
                    const width = Math.abs(volume.points[1].x - volume.points[0].x);
                    const depth = Math.abs(volume.points[1].z - volume.points[0].z);
                    const height = 5; // Or some other sensible height
                    return (
                        <mesh 
                            key={volume.id} 
                            position={[
                                (volume.points[0].x + volume.points[1].x) / 2,
                                height / 2,
                                (volume.points[0].z + volume.points[1].z) / 2
                            ]}
                        >
                            <boxGeometry args={[width, height, depth]} />
                            <meshBasicMaterial color="black" opacity={0.5} transparent />
                        </mesh>
                    );
                }
                return null;
            })}
        </group>
    );
};
