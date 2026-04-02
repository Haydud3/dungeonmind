import React, { useState, useMemo } from 'react';
import * as THREE from 'three';
import { useCursor, Line, Text, Billboard } from '@react-three/drei';

export const WallSegment = ({ start, end, onContextMenu, onToggleDoor, wall, onDelete, isVisibleToPlayers }) => {
    const vec = useMemo(() => new THREE.Vector3().subVectors(end, start), [start, end]);
    const midpoint = useMemo(() => new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5), [start, end]);
    const quat = useMemo(() => {
        const quaternion = new THREE.Quaternion();
        const axis = new THREE.Vector3(0, 1, 0);
        quaternion.setFromUnitVectors(axis, vec.clone().normalize());
        return quaternion;
    }, [vec]);
    
    const length = vec.length();
    const [hovered, setHover] = useState(false);
    useCursor(hovered, 'pointer', 'auto');

    return (
        <mesh 
            position={midpoint} 
            quaternion={quat}
            renderOrder={200}
            onClick={(e) => {
                if (onDelete) {
                    e.stopPropagation();
                    onDelete(wall.id);
                } else if (wall.type === 'door' || wall.type === 'window') {
                    e.stopPropagation();
                    if (onToggleDoor) onToggleDoor(e, wall.id);
                }
            }}
            onContextMenu={(e) => {
                if (onDelete) return;
                e.stopPropagation();
                if (onContextMenu) onContextMenu(e, wall.id);
            }}
            onPointerOver={(e) => {
                if (onDelete) {
                    e.stopPropagation();
                    setHover(true);
                }
            }}
            onPointerOut={(e) => {
                if (onDelete) {
                    e.stopPropagation();
                    setHover(false);
                }
            }}
        >
            <cylinderGeometry args={[0.4, 0.4, length, 8]} />
            <meshBasicMaterial visible={false} />
        </mesh>
    );
};

export const Wall = ({ wall, onContextMenu, onToggleDoor, showWalls, role, playerDoorVisibility, onDelete, isSelected, isVisibleToPlayers }) => {
    if (wall.isSecret && role !== 'dm') {
        return null;
    }
    const points = wall.points.map(p => new THREE.Vector3(p.x, p.y, p.z));
    let type = wall.type || 'wall';
    if (role !== 'dm' && playerDoorVisibility === false) {
        if (type === 'door' || type === 'window') {
            type = 'wall';
        }
    }
    
    const showIcon = role === 'dm' || isVisibleToPlayers;
    const color = isSelected ? '#fef08a' : (type === 'door' ? '#3b82f6' : type === 'window' ? '#06b6d4' : '#ef4444');

    // Hide structural walls unless editing (doors and windows stay visible)
    const isVisible = type === 'wall' ? showWalls : true;
    if (!isVisible) return null;

    const segments = [];
    if (onContextMenu || onToggleDoor || onDelete) {
        for (let i = 0; i < points.length - 1; i++) {
            segments.push(
                <WallSegment 
                    key={i} 
                    start={points[i]} 
                    end={points[i+1]} 
                    onContextMenu={onContextMenu}
                    onToggleDoor={onToggleDoor}
                    wall={wall}
                    onDelete={onDelete}
                    isVisibleToPlayers={isVisibleToPlayers}
                />
            );
        }
    }

    const center = new THREE.Vector3();
    points.forEach(p => center.add(p));
    center.divideScalar(points.length);
    
    return (
        <group>
            {(showWalls || type === 'wall') && (
                <Line 
                    points={points} 
                    color={color} 
                    lineWidth={type === 'door' || type === 'window' ? 8 : 5} 
                    dashed={wall.isOpen}
                    dashScale={wall.isOpen ? 2 : 1}
                    transparent={true}
                    opacity={wall.isOpen ? 0.3 : 1}
                    renderOrder={200}
                    depthTest={false}
                />
            )}

            {!showWalls && (type === 'door' || type === 'window') && showIcon && (
                <Billboard position={[center.x, 0.5, center.z]}>
                    <Text 
                        fontSize={0.8}
                        anchorX="center"
                        anchorY="middle"
                        depthTest={false}
                        renderOrder={201}
                        fillOpacity={wall.isOpen ? 0.3 : 1}
                        color={isSelected ? '#fef08a' : '#ffffff'}
                    >
                        {type === 'door' ? '🚪' : '🪟'}
                    </Text>
                </Billboard>
            )}
            
            {segments}
        </group>
    );
};

export const Walls = ({ walls, onWallContextMenu, onToggleDoor, showWalls, role, playerDoorVisibility, onDelete, selectedWalls = [], visibleDoorWindowIds }) => {
    if (!walls) return null;
    return (
        <group>
            {Object.values(walls).map(wall => (
                <Wall 
                    key={wall.id} 
                    wall={wall} 
                    onContextMenu={onWallContextMenu} 
                    onToggleDoor={onToggleDoor} 
                    showWalls={showWalls} 
                    role={role} 
                    playerDoorVisibility={playerDoorVisibility} 
                    onDelete={onDelete} 
                    isSelected={selectedWalls.includes(wall.id)} // Pass selectedWalls to Wall
                    isVisibleToPlayers={visibleDoorWindowIds?.has(wall.id)} // Pass calculated visibility for doors/windows
                />
            ))}
        </group>
    );
};
