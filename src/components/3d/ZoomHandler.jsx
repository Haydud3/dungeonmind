import React, { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';

export const ZoomHandler = ({ zoomRef }) => {
    const { camera, controls } = useThree();
    const targetDistance = useRef(null);

    useEffect(() => {
        if (zoomRef) {
            zoomRef.current = {
                zoomIn: () => {
                    if (!controls) return;
                    if (camera.isOrthographicCamera) {
                        const z = targetDistance.current || camera.zoom;
                        targetDistance.current = Math.min(controls.maxZoom || 10, z * 1.3);
                    } else {
                        const dist = targetDistance.current || camera.position.distanceTo(controls.target);
                        targetDistance.current = Math.max(controls.minDistance || 3, dist * 0.7);
                    }
                },
                zoomOut: () => {
                    if (!controls) return;
                    if (camera.isOrthographicCamera) {
                        const z = targetDistance.current || camera.zoom;
                        targetDistance.current = Math.max(controls.minZoom || 0.1, z * 0.7);
                    } else {
                        const dist = targetDistance.current || camera.position.distanceTo(controls.target);
                        targetDistance.current = Math.min(controls.maxDistance || 40, dist * 1.4);
                    }
                }
            };
        }
    }, [camera, controls, zoomRef]);

    useEffect(() => {
        if (!controls) return;
        const cancelZoom = () => { targetDistance.current = null; };
        controls.addEventListener('start', cancelZoom); // User started dragging map
        if (controls.domElement) controls.domElement.addEventListener('wheel', cancelZoom); // User scrolled wheel
        return () => {
            controls.removeEventListener('start', cancelZoom);
            if (controls.domElement) controls.domElement.removeEventListener('wheel', cancelZoom);
        };
    }, [controls]);

    useFrame(() => {
        if (controls && targetDistance.current !== null) {
            if (camera.isOrthographicCamera) {
                const currentZoom = camera.zoom;
                const diff = targetDistance.current - currentZoom;
                if (Math.abs(diff) < 0.05) {
                    targetDistance.current = null;
                } else {
                    camera.zoom = currentZoom + diff * 0.15;
                    camera.updateProjectionMatrix();
                    controls.update();
                }
            } else {
                const currentDist = camera.position.distanceTo(controls.target);
                const diff = targetDistance.current - currentDist;
                if (Math.abs(diff) < 0.1) {
                    targetDistance.current = null;
                } else {
                    const dir = camera.position.clone().sub(controls.target).normalize();
                    camera.position.copy(controls.target).add(dir.multiplyScalar(currentDist + diff * 0.15));
                    controls.update();
                }
            }
        }
    });

    return null;
};