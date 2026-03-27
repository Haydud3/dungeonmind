import React, { forwardRef, useImperativeHandle, useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

const CameraController = forwardRef(({ view: initialView = 'isometric' }, ref) => {
    const { camera, controls } = useThree();

    const setView = (view) => {
        if (!controls || !camera) return;

        const target = controls.target.clone();
        let position;

        if (view === 'top-down') {
            position = new THREE.Vector3(target.x, target.y + 10, target.z + 0.0001); // Add a small epsilon to avoid gimbal lock
        } else { // 'isometric'
            position = new THREE.Vector3(target.x, target.y + 8, target.z + 8);
        }
        
        camera.position.set(position.x, position.y, position.z);
        if (controls) {
            controls.update();
        }
    };

    useEffect(() => {
        setView(initialView);
    }, [controls, initialView]);

    useImperativeHandle(ref, () => ({
        setView,
        reset: () => {
            if (controls) {
                controls.target.set(0, 0, 0);
            }
            setView(initialView);
        }
    }));

    return null;
});

export default CameraController;
