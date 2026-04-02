import React, { useState, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { Line } from '@react-three/drei';

export const ArchitectPenController = ({ isEnabled, onCommitSegment, getTerrainHeight }) => {
    const { controls } = useThree();
    const [nodes, setNodes] = useState([]);
    const [cursorPos, setCursorPos] = useState(null);

    useEffect(() => {
        if (controls) controls.enabled = !isEnabled;
        if (!isEnabled) { setNodes([]); setCursorPos(null); }
    }, [isEnabled, controls]);

    const applySnap = (pt, lastNode) => {
        const dx = pt.x - lastNode.x;
        const dz = pt.z - lastNode.z;
        const angle = Math.atan2(dz, dx);
        const snappedAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
        const dist = Math.sqrt(dx*dx + dz*dz);
        pt.x = lastNode.x + Math.cos(snappedAngle) * dist;
        pt.z = lastNode.z + Math.sin(snappedAngle) * dist;
        return pt;
    };

    const handlePointerDown = (e) => {
        if (!isEnabled || e.button !== 0) return;
        e.stopPropagation();
        let pt = e.point.clone();
        pt.y = getTerrainHeight(pt.x, pt.z) + 0.1;

        if (e.shiftKey && nodes.length > 0) pt = applySnap(pt, nodes[nodes.length - 1]);

        const newNodes = [...nodes, pt];
        setNodes(newNodes);

        if (newNodes.length >= 2) {
            onCommitSegment(newNodes[newNodes.length - 2], newNodes[newNodes.length - 1]);
            setNodes([newNodes[newNodes.length - 1]]); // Chain the next segment
        }
    };

    const handlePointerMove = (e) => {
        if (!isEnabled) return;
        e.stopPropagation();
        let pt = e.point.clone();
        pt.y = getTerrainHeight(pt.x, pt.z) + 0.1;

        if (e.shiftKey && nodes.length > 0) pt = applySnap(pt, nodes[nodes.length - 1]);
        setCursorPos(pt);
    };

    const handleContextMenu = (e) => {
        if (!isEnabled) return;
        e.stopPropagation();
        setNodes([]); // Break the chain
    };

    useEffect(() => {
        const handleKeyDown = (e) => { if (e.key === 'Escape') setNodes([]); };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    if (!isEnabled) return null;

    return (
        <group>
            {nodes.length > 0 && cursorPos && (
                <Line points={[nodes[nodes.length - 1], cursorPos]} color="#ef4444" lineWidth={3} dashed dashScale={10} renderOrder={200} depthTest={false} />
            )}
            {nodes.map((n, i) => (
                <mesh key={i} position={n} renderOrder={200}>
                    <sphereGeometry args={[0.2]} />
                    <meshBasicMaterial color="#ef4444" depthTest={false} />
                </mesh>
            ))}
            <mesh onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onContextMenu={handleContextMenu} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
                <planeGeometry args={[1000, 1000]} />
                <meshBasicMaterial />
            </mesh>
        </group>
    );
};