import { calculateVisibilityPolygon } from '../utils/visionMath';

self.onmessage = (e) => {
    const { 
        emitters, // Array of { id, x, y, radius }
        walls,    // Array of wall segments
        bounds,   // { width, height }
        maxDim    // Maximum ray distance
    } = e.data;

    if (!emitters || !walls) return;

    // Filter walls once (ignore open doors)
    const blockingSegments = walls.filter(w => !(w.type === 'door' && w.isOpen));

    // Calculate polygons for all emitters
    const results = emitters.map(emitter => {
        const { id, x, y, radius } = emitter;
        const origin = { x, y };

        // Calculate Near Poly (Vision Radius)
        const nearPoly = calculateVisibilityPolygon(
            origin, 
            blockingSegments, 
            bounds, 
            radius
        );

        // Calculate Far Poly (Unbounded Line of Sight)
        const farPoly = calculateVisibilityPolygon(
            origin, 
            blockingSegments, 
            bounds, 
            maxDim
        );

        return { id, nearPoly, farPoly, radius };
    });

    self.postMessage(results);
};