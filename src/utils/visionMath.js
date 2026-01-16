/**
 * Calculates a visibility polygon from a given point (origin).
 * Uses the "Sight & Light" / Raycasting algorithm.
 * @param {Object} origin - The source {x, y} (0-100 scale or pixels)
 * @param {Array} segments - Array of walls: [{p1:{x,y}, p2:{x,y}}]
 * @param {Object} bounds - Dimensions of the map {width, height}
 * @returns {Array} - Array of points {x, y} forming the visible polygon
 */
export const calculateVisibilityPolygon = (origin, segments, bounds) => {
    let endpoints = [];
    let walls = [...segments];

    // 1. Add map boundaries as walls so vision doesn't go on forever
    walls.push({ p1: { x: 0, y: 0 }, p2: { x: bounds.width, y: 0 } });
    walls.push({ p1: { x: bounds.width, y: 0 }, p2: { x: bounds.width, y: bounds.height } });
    walls.push({ p1: { x: bounds.width, y: bounds.height }, p2: { x: 0, y: bounds.height } });
    walls.push({ p1: { x: 0, y: bounds.height }, p2: { x: 0, y: 0 } });

    // 2. Collect all unique endpoints (corners) from walls
    walls.forEach(wall => {
        endpoints.push(wall.p1);
        endpoints.push(wall.p2);
    });

    // 3. Sort endpoints by angle from the origin
    endpoints.sort((a, b) => {
        const angA = Math.atan2(a.y - origin.y, a.x - origin.x);
        const angB = Math.atan2(b.y - origin.y, b.x - origin.x);
        return angA - angB;
    });

    // 4. Cast rays at angles
    // We cast 3 rays per point: directly at it, slightly left, slightly right.
    const uniqueAngles = [];
    const epsilon = 0.00001; 
    
    endpoints.forEach(p => {
        const angle = Math.atan2(p.y - origin.y, p.x - origin.x);
        uniqueAngles.push(angle - epsilon, angle, angle + epsilon);
    });

    const intersections = [];

    uniqueAngles.forEach(angle => {
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        
        let closest = null;
        let minT = Infinity;

        // Cast this specific ray against EVERY wall to see what it hits first
        walls.forEach(wall => {
            const rayEnd = { x: origin.x + dx, y: origin.y + dy };
            const result = getIntersection(origin, rayEnd, wall.p1, wall.p2);
            
            if (result && result.param < minT) {
                minT = result.param;
                closest = result;
            }
        });

        if (closest) intersections.push(closest);
    });

    return intersections;
};

/**
 * Calculates the intersection of a Ray and a Line Segment.
 */
const getIntersection = (rayStart, rayEnd, segmentStart, segmentEnd) => {
    const r_px = rayStart.x; const r_py = rayStart.y;
    const r_dx = rayEnd.x - rayStart.x; const r_dy = rayEnd.y - rayStart.y;
    
    const s_px = segmentStart.x; const s_py = segmentStart.y;
    const s_dx = segmentEnd.x - segmentStart.x; const s_dy = segmentEnd.y - segmentStart.y;

    const r_mag = Math.sqrt(r_dx * r_dx + r_dy * r_dy);
    const s_mag = Math.sqrt(s_dx * s_dx + s_dy * s_dy);

    if (r_dx / r_mag === s_dx / s_mag && r_dy / r_mag === s_dy / s_mag) return null;

    const T2 = (r_dx * (s_py - r_py) + r_dy * (r_px - s_px)) / (s_dx * r_dy - s_dy * r_dx);
    const T1 = (s_px + s_dx * T2 - r_px) / r_dx;

    if (T1 > 0 && T2 >= 0 && T2 <= 1) {
        return { x: rayStart.x + r_dx * T1, y: rayStart.y + r_dy * T1, param: T1 };
    }
    return null;
};

/**
 * Checks if a point is inside a polygon using the Ray Casting (Even-Odd) algorithm.
 * Used for "True Fog of War" (hiding tokens).
 * @param {Object} point - {x, y}
 * @param {Array} polygon - Array of {x, y} points
 * @returns {Boolean}
 */
export const isPointInPolygon = (point, polygon) => {
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