export const segmentsIntersect = (p1, p2, p3, p4) => {
    const d1 = (p2.x - p1.x) * (p4.z - p3.z) - (p2.z - p1.z) * (p4.x - p3.x);
    if (Math.abs(d1) < 1e-6) return false; // Prevent division by absolute zero and parallel artifacts
    const uA = ((p4.x - p3.x) * (p1.z - p3.z) - (p4.z - p3.z) * (p1.x - p3.x)) / d1;
    const uB = ((p2.x - p1.x) * (p1.z - p3.z) - (p2.z - p1.z) * (p1.x - p3.x)) / d1;
    // Tiny epsilon buffer ensures perfect grid-snapped edges are caught as line-of-sight blockers
    return uA >= -1e-5 && uA <= 1 + 1e-5 && uB >= -1e-5 && uB <= 1 + 1e-5;
};
