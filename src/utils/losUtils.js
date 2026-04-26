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
