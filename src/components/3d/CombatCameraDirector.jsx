import React, { useState, useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export const CombatCameraDirector = ({ activeTokenId, tokensList }) => {
    const { camera, controls } = useThree();
    const [targetData, setTargetData] = useState(null);
    const prevActiveId = useRef(null); // Init as null so it pans on first load if combat is active

    useEffect(() => {
        if (activeTokenId && activeTokenId !== prevActiveId.current) {
            const t = tokensList.find(x => x.id === activeTokenId);
            if (t && controls) {
                const newTarget = new THREE.Vector3(t.x || 0, t.y || 0, t.z || 0);
                const delta = new THREE.Vector3().subVectors(newTarget, controls.target);
                const newCamPos = camera.position.clone().add(delta);
                setTargetData({ target: newTarget, camPos: newCamPos });
            }
        }
        prevActiveId.current = activeTokenId;
    }, [activeTokenId, tokensList, camera, controls]);

    useEffect(() => {
        if (!controls) return;
        const cancelPan = () => setTargetData(null);
        controls.addEventListener('start', cancelPan); // Yield to user if they touch the map
        return () => controls.removeEventListener('start', cancelPan);
    }, [controls]);

    useFrame(() => {
        if (targetData && controls) {
            controls.target.lerp(targetData.target, 0.08);
            camera.position.lerp(targetData.camPos, 0.08);
            if (controls.target.distanceTo(targetData.target) < 0.05) setTargetData(null);
        }
    });
    return null;
};