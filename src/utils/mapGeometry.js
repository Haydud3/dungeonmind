// src/utils/mapGeometry.js

export const distToSegment = (p, v, w) => {
    const l2 = (w.x - v.x)**2 + (w.y - v.y)**2;
    if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
};

export const getIntersection = (ray, segment) => {
    const r_px = ray.x; const r_py = ray.y;
    const r_dx = ray.dx; const r_dy = ray.dy;
    const s_px = segment.p1.x; const s_py = segment.p1.y;
    const s_dx = segment.p2.x - segment.p1.x; const s_dy = segment.p2.y - segment.p1.y;

    const r_mag = Math.sqrt(r_dx * r_dx + r_dy * r_dy);
    const s_mag = Math.sqrt(s_dx * s_dx + s_dy * s_dy);
    if (r_dx / r_mag === s_dx / s_mag && r_dy / r_mag === s_dy / s_mag) return null;

    const denom = r_dx * s_dy - r_dy * s_dx;
    if (denom === 0) return null;

    const T2 = (r_dx * (s_py - r_py) + r_dy * (r_px - s_px)) / denom;
    const T1 = (s_px + s_dx * T2 - r_px) / r_dx;

    const EPSILON = 0.0001;
    if (T1 > -EPSILON && T2 >= 0 && T2 <= 1) return { T1, T2 };
    return null;
};

export const computeVisibilityPolygon = (origin, maxDist, wallSegments, mapW, mapH) => {
    let points = [];
    const uniqueAngles = new Set();
    
    const corners = [{x:0, y:0}, {x:mapW, y:0}, {x:mapW, y:mapH}, {x:0, y:mapH}];
    corners.forEach(c => uniqueAngles.add(Math.atan2(c.y - origin.y, c.x - origin.x)));

    wallSegments.forEach(wall => {
        [wall.p1, wall.p2].forEach(p => {
            const angle = Math.atan2(p.y - origin.y, p.x - origin.x);
            uniqueAngles.add(angle);
            uniqueAngles.add(angle - 0.00001); 
            uniqueAngles.add(angle + 0.00001); 
        });
    });

    const angles = Array.from(uniqueAngles).sort((a, b) => a - b);
// Exactly 2 lines before change
    angles.forEach(angle => {
        const r_dx = Math.cos(angle);
// COMPLETE NEW or MODIFIED code block
        const r_dy = Math.sin(angle);
        let closestDist = maxDist; 
        let hitPoint = { x: origin.x + r_dx * maxDist, y: origin.y + r_dy * maxDist };

        for(let i=0; i<wallSegments.length; i++) {
            const intersection = getIntersection({ x: origin.x, y: origin.y, dx: r_dx, dy: r_dy }, wallSegments[i]);
            if (intersection && intersection.T1 < closestDist && intersection.T1 > 0) {
                closestDist = intersection.T1;
                hitPoint = { x: origin.x + r_dx * closestDist, y: origin.y + r_dy * closestDist };
            }
        }
        points.push(hitPoint);
    });
    return points;
};

/**
 * Normalizes screen coordinates to world (map) coordinates.
 */
export const normalizeToWorld = (clientX, clientY, containerRect, view) => {
    return {
        x: (clientX - containerRect.left - view.x) / view.scale,
        y: (clientY - containerRect.top - view.y) / view.scale
    };
};

/**
 * Snaps world coordinates to the nearest grid intersection.
 */
export const snapWorldToGrid = (worldPos, grid) => {
    if (!grid.snap) return worldPos;
    return {
        x: Math.round((worldPos.x - grid.offsetX) / grid.size) * grid.size + grid.offsetX,
        y: Math.round((worldPos.y - grid.offsetY) / grid.size) * grid.size + grid.offsetY
    };
};