/**
 * Calculates visibility radius based on 5e Rules (Darkvision, Equipment).
 * Returns radius in PIXELS (assuming 50px = 5ft).
 */
export const getCharacterVisionSettings = (character, cellPx = 50) => {
    const senses = character?.senses || {};
    const darkvision = senses.darkvision || 0;
    
    // Default 5e conversion: 60ft Darkvision = 12 cells.
    // Base radius for "blind" or standard human vision in dark is 0,
    // but in VTTs we often default to a small radius or darkvision.
    let radiusFeet = darkvision > 0 ? darkvision : 0;
    
    // If no darkvision, assume 5ft (1 cell) so they aren't totally lost, 
    // or rely on light sources.
    if (radiusFeet === 0) radiusFeet = 5;

    return {
        radius: (radiusFeet / 5) * cellPx,
        darkvision: darkvision
    };
};

/**
 * Calculates a visibility polygon from a given point (origin).
 * Optimized for 60FPS rendering.
 */
export const calculateVisibilityPolygon = (origin, walls, bounds, maxRadius = Infinity) => {
    // Optimization: If no walls, return null so the renderer can draw a simple circle
    if (!walls || walls.length === 0) {
        return null;
    }

    // 1. Prepare segments (including map bounds)
    const segments = walls.map(w => ({
        p1: { x: w.p1.x, y: w.p1.y },
        p2: { x: w.p2.x, y: w.p2.y }
    }));

    // Add boundaries to segments to constrain the polygon
    segments.push({ p1: { x: 0, y: 0 }, p2: { x: bounds.width, y: 0 } });
    segments.push({ p1: { x: bounds.width, y: 0 }, p2: { x: bounds.width, y: bounds.height } });
    segments.push({ p1: { x: bounds.width, y: bounds.height }, p2: { x: 0, y: bounds.height } });
    segments.push({ p1: { x: 0, y: bounds.height }, p2: { x: 0, y: 0 } });

    // 2. Collect all unique angles to cast rays
    const angles = new Set();
    segments.forEach(seg => {
        const a1 = Math.atan2(seg.p1.y - origin.y, seg.p1.x - origin.x);
        const a2 = Math.atan2(seg.p2.y - origin.y, seg.p2.x - origin.x);
        angles.add(a1);
        angles.add(a1 - 0.0001);
        angles.add(a1 + 0.0001);
        angles.add(a2);
        angles.add(a2 - 0.0001);
        angles.add(a2 + 0.0001);
    });

    const sortedAngles = Array.from(angles).sort((a, b) => a - b);
    const intersections = [];

    // 3. Cast rays and find the closest intersection for each angle
    sortedAngles.forEach(angle => {
        const rayDir = { x: Math.cos(angle), y: Math.sin(angle) };
        let closestIntersect = null;

        segments.forEach(seg => {
            const intersect = getIntersection(origin, rayDir, seg.p1, seg.p2);
            if (!intersect) return;
            if (!closestIntersect || intersect.param < closestIntersect.param) {
                closestIntersect = intersect;
            }
        });

        if (closestIntersect) {
            intersections.push({
                x: closestIntersect.x,
                y: closestIntersect.y,
                param: closestIntersect.param,
                angle: angle
            });
        }
    });

    return intersections;
};

/**
 * Internal Ray-Segment Intersection Helper
 */
const getIntersection = (rayOrigin, rayDir, segA, segB) => {
    const r_px = rayOrigin.x;
    const r_py = rayOrigin.y;
    const r_dx = rayDir.x;
    const r_dy = rayDir.y;

    const s_px = segA.x;
    const s_py = segA.y;
    const s_dx = segB.x - segA.x;
    const s_dy = segB.y - segA.y;

    const mag = Math.sqrt(r_dx * r_dx + r_dy * r_dy);
    const parallel = r_dx * s_dy - r_dy * s_dx;

    if (Math.abs(parallel) < 0.000001) return null;

    const T = ((s_px - r_px) * s_dy - (s_py - r_py) * s_dx) / parallel;
    const U = ((s_px - r_px) * r_dy - (s_py - r_py) * r_dx) / parallel;

    if (T > 0 && U >= 0 && U <= 1) {
        return {
            x: r_px + r_dx * T,
            y: r_py + r_dy * T,
            param: T
        };
    }
    return null;
};

/**
 * Standard Ray Casting algorithm for point-in-polygon testing
 */
export const isPointInPolygon = (point, polygon) => {
    if (!polygon || polygon.length < 3) return false;
    
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;

        const intersect = ((yi > point.y) !== (yj > point.y))
            && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
};