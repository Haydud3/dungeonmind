import React, { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

export const DropZone = ({ onMapDrop }) => {
    const { camera, gl } = useThree();
    const onMapDropRef = useRef(onMapDrop);

    useEffect(() => {
        onMapDropRef.current = onMapDrop;
    }, [onMapDrop]);

    useEffect(() => {
        const handleDrop = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const rect = gl.domElement.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

            const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
            const target = new THREE.Vector3();
            const intersect = raycaster.ray.intersectPlane(plane, target);

            if (onMapDropRef.current) {
                onMapDropRef.current(e, intersect || new THREE.Vector3(0, 0, 0));
            }
        };
        const handleDragOver = (e) => { 
            e.preventDefault(); 
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'copy'; 
        };

        const container = gl.domElement.parentElement;
        if (container) {
            container.addEventListener('drop', handleDrop);
            container.addEventListener('dragover', handleDragOver);
            return () => { container.removeEventListener('drop', handleDrop); container.removeEventListener('dragover', handleDragOver); };
        }
    }, [camera, gl]);

    return null;
};