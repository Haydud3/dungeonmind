export const idsMatch = (id1, id2) => {
    if (id1 === null || id1 === undefined || id2 === null || id2 === undefined) return false;
    return String(id1) === String(id2);
};