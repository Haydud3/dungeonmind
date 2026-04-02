import React, { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

export const MarqueeSelector = ({ tokens = [], walls = {}, lights = {}, isDeleting = false, onSelectTokens, onSelectWalls, onSelectLights }) => {
    const { camera, size, gl, controls } = useThree();

    useEffect(() => {
        const container = gl.domElement.parentNode;
        let isSelecting = false;
        let startPos = { x: 0, y: 0 };
        let boxOverlay = null;

        const onPointerDown = (e) => {
            // Button 2 is Right-Click
            if (e.button === 2) {
                isSelecting = true;
                startPos = { x: e.clientX, y: e.clientY };
                
                if (controls) controls.enabled = false;

                boxOverlay = document.createElement('div');
                boxOverlay.style.position = 'fixed';
                boxOverlay.style.backgroundColor = 'rgba(59, 130, 246, 0.2)';
                boxOverlay.style.border = '1px solid rgba(59, 130, 246, 0.8)';
                boxOverlay.style.pointerEvents = 'none';
                boxOverlay.style.zIndex = '9999';
                boxOverlay.style.left = `${startPos.x}px`;
                boxOverlay.style.top = `${startPos.y}px`;
                boxOverlay.style.width = '0px';
                boxOverlay.style.height = '0px';
                document.body.appendChild(boxOverlay);
            }
        };

        const onPointerMove = (e) => {
            if (isSelecting && boxOverlay) {
                const minX = Math.min(startPos.x, e.clientX);
                const minY = Math.min(startPos.y, e.clientY);
                const width = Math.abs(startPos.x - e.clientX);
                const height = Math.abs(startPos.y - e.clientY);

                boxOverlay.style.left = `${minX}px`;
                boxOverlay.style.top = `${minY}px`;
                boxOverlay.style.width = `${width}px`;
                boxOverlay.style.height = `${height}px`;
            }
        };

        const onPointerUp = (e) => {
            if (isSelecting) {
                isSelecting = false;
                if (controls) controls.enabled = true;
                if (boxOverlay && document.body.contains(boxOverlay)) {
                    document.body.removeChild(boxOverlay);
                    boxOverlay = null;
                }

                const endPos = { x: e.clientX, y: e.clientY };
                const minX = Math.min(startPos.x, endPos.x);
                const maxX = Math.max(startPos.x, endPos.x);
                const minY = Math.min(startPos.y, endPos.y);
                const maxY = Math.max(startPos.y, endPos.y);

                // If the box is tiny, treat it as a normal click and ignore
                if (maxX - minX < 5 && maxY - minY < 5) return;

                const rect = gl.domElement.getBoundingClientRect();
                const selectedTokens = [];
                const selectedWalls = [];
                const selectedLights = [];

                tokens.forEach(token => {
                    const vec = new THREE.Vector3(token.x || 0, token.y || 0, token.z || 0);
                    vec.project(camera);
                    const screenX = rect.left + (vec.x + 1) / 2 * size.width;
                    const screenY = rect.top + (-vec.y + 1) / 2 * size.height;

                    if (screenX >= minX && screenX <= maxX && screenY >= minY && screenY <= maxY) {
                        selectedTokens.push(token.id);
                    }
                });

                if (isDeleting && onSelectWalls) {
                    Object.values(walls).forEach(wall => {
                        let inside = false;
                        for (const p of wall.points) {
                            const vec = new THREE.Vector3(p.x, p.y, p.z).project(camera);
                            const screenX = rect.left + (vec.x + 1) / 2 * size.width;
                            const screenY = rect.top + (-vec.y + 1) / 2 * size.height;
                            if (screenX >= minX && screenX <= maxX && screenY >= minY && screenY <= maxY) {
                                inside = true; break;
                            }
                        }
                        if (inside) selectedWalls.push(wall.id);
                    });
                }

                if (isDeleting && onSelectLights) {
                    Object.values(lights).forEach(light => {
                        const vec = new THREE.Vector3(light.position.x, light.position.y || 1, light.position.z).project(camera);
                        const screenX = rect.left + (vec.x + 1) / 2 * size.width;
                        const screenY = rect.top + (-vec.y + 1) / 2 * size.height;
                        if (screenX >= minX && screenX <= maxX && screenY >= minY && screenY <= maxY) {
                            selectedLights.push(light.id);
                        }
                    });
                }

                if (onSelectTokens) onSelectTokens(prev => e.shiftKey ? [...new Set([...prev, ...selectedTokens])] : selectedTokens);
                if (isDeleting && onSelectWalls) onSelectWalls(prev => e.shiftKey ? [...new Set([...prev, ...selectedWalls])] : selectedWalls);
                if (isDeleting && onSelectLights) onSelectLights(prev => e.shiftKey ? [...new Set([...prev, ...selectedLights])] : selectedLights);
            }
        };

        container.addEventListener('pointerdown', onPointerDown);
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);

        return () => {
            container.removeEventListener('pointerdown', onPointerDown);
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
            if (boxOverlay && document.body.contains(boxOverlay)) {
                document.body.removeChild(boxOverlay);
            }
        };
    }, [camera, size, gl, controls, tokens, walls, lights, isDeleting, onSelectTokens, onSelectWalls, onSelectLights]);

    return null;
};