import { segmentsIntersect } from './mathUtils';

export const checkLineOfSight = (srcPt, targetPt, walls, ignoreWallId = null) => {
    if (!walls) return true;
    for (const wall of Object.values(walls).filter(Boolean)) {
        if (ignoreWallId && wall.id === ignoreWallId) continue;
        if (wall.isOpen || !wall.points || wall.points.length < 2) continue;
        for (let i = 0; i < wall.points.length - 1; i++) {
            if (segmentsIntersect(srcPt, targetPt, wall.points[i], wall.points[i+1])) return false;
        }
    }
    return true;
};

export const isPointInManualFog = (x, z, fogAlphaBuffer, scale = 20, aspect = 1) => {
    if (!fogAlphaBuffer) return false;
    const currentAspect = aspect || 1;
    const currentScale = scale || 20;
    const u = (x / (currentScale * currentAspect)) + 0.5;
    const v = (z / currentScale) + 0.5;
    if (u < 0 || u > 1 || v < 0 || v > 1) return false;
    const px = Math.floor(u * 1024);
    const py = Math.floor(v * 1024);
    const idx = (py * 1024 + px) * 4 + 3;
    return (fogAlphaBuffer[idx] || 0) > 64; // > 25% opacity counts as occluded by manual fog
};

export const isSegmentBlockedByManualFog = (srcPt, targetPt, fogAlphaBuffer, scale = 20, aspect = 1) => {
    if (!fogAlphaBuffer || !srcPt || !targetPt) return false;
    const dx = targetPt.x - srcPt.x;
    const dz = targetPt.z - srcPt.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 0.001) return false;

    const currentAspect = aspect || 1;
    const currentScale = scale || 20;
    // Sample along the segment every ~0.5 units, bounded between 3 and 50 samples
    const steps = Math.max(3, Math.min(50, Math.floor(dist / 0.5)));
    for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const x = srcPt.x + dx * t;
        const z = srcPt.z + dz * t;
        const u = (x / (currentScale * currentAspect)) + 0.5;
        const v = (z / currentScale) + 0.5;
        if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
            const px = Math.floor(u * 1024);
            const py = Math.floor(v * 1024);
            const idx = (py * 1024 + px) * 4 + 3;
            if ((fogAlphaBuffer[idx] || 0) > 128) {
                return true; // Ray is blocked by opaque fog
            }
        }
    }
    return false;
};
