/**
 * Calculates a visibility polygon from a given point (origin).
 * Optimized for 60FPS rendering.
 */
export const calculateVisibilityPolygon = (origin, walls, bounds) => {
    // 1. Add map boundaries to prevent infinite vision
    const allSegments = [
        ...walls,
        { p1: { x: 0, y: 0 }, p2: { x: bounds.width, y: 0 } },
        { p1: { x: bounds.width, y: 0 }, p2: { x: bounds.width, y: bounds.height } },
        { p1: { x: bounds.width, y: bounds.height }, p2: { x: 0, y: bounds.height } },
        { p1: { x: 0, y: bounds.height }, p2: { x: 0, y: 0 } }
    ];

    // 2. Collect unique angles to corners
    const uniqueAngles = new Set();
    allSegments.forEach(wall => {
        // Add angles for p1 and p2
        uniqueAngles.add(Math.atan2(wall.p1.y - origin.y, wall.p1.x - origin.x));
        uniqueAngles.add(Math.atan2(wall.p2.y - origin.y, wall.p2.x - origin.x));
    });

    // 3. Sort angles
    const sortedAngles = Array.from(uniqueAngles).sort((a, b) => a - b);

    // 4. Cast rays
    // Cast 3 rays per unique angle: directly at it, and slightly offset +/- to hit walls behind
    const intersections = [];
    const epsilon = 0.00001; 

    const castRay = (angle) => {
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        
        let minT = Infinity;
        let closest = null;

        // Check against EVERY wall
        for (const wall of allSegments) {
            // Ray: Origin + Dir * T
            // Segment: P1 + (P2-P1) * U
            const result = getIntersection(origin, {x: dx, y: dy}, wall.p1, wall.p2);
            if (result && result.param < minT) {
                minT = result.param;
                closest = result;
            }
        }

        if (closest) intersections.push(closest);
    };

    sortedAngles.forEach(angle => {
        castRay(angle - epsilon);
        castRay(angle);
        castRay(angle + epsilon);
    });

    return intersections;
};

/**
 * Optimized Ray-Segment Intersection (No Square Roots)
 * @param {Object} rayOrigin - {x, y}
 * @param {Object} rayDir - Normalized vector {x, y}
 * @param {Object} segA - Wall Start {x, y}
 * @param {Object} segB - Wall End {x, y}
 */
const getIntersection = (rayOrigin, rayDir, segA, segB) => {
    // Ray: r_px + r_dx * T
    // Seg: s_px + s_dx * U
    
    const r_px = rayOrigin.x;
    const r_py = rayOrigin.y;
    const r_dx = rayDir.x;
    const r_dy = rayDir.y;

    const s_px = segA.x;
    const s_py = segA.y;
    const s_dx = segB.x - segA.x;
    const s_dy = segB.y - segA.y;

    // Cross product (are lines parallel?)
    const r_mag = Math.sqrt(r_dx * r_dx + r_dy * r_dy); // Should be 1 if normalized
    const parallel = r_dx * s_dy - r_dy * s_dx;
    
    if (parallel === 0) return null;

    // Solve for T (Ray distance) and U (Segment fraction)
    const T = ((s_px - r_px) * s_dy - (s_py - r_py) * s_dx) / parallel;
    const U = ((s_px - r_px) * r_dy - (s_py - r_py) * r_dx) / parallel;

    // T > 0 means the wall is in front of us
    // 0 <= U <= 1 means the ray hits the actual wall segment
    if (T > 0 && U >= 0 && U <= 1) {
        return {
            x: r_px + r_dx * T,
            y: r_py + r_dy * T,
            param: T
        };
    }
    return null;
};

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