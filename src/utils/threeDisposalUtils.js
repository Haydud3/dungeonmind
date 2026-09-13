/**
 * Three.js Resource Disposal Utilities
 * Provides safe, deterministic cleanup for textures, render targets, materials, and geometries
 * to prevent GPU VRAM and JS heap memory leaks.
 */

export const safeDisposeTexture = (texture) => {
    if (!texture) return;
    try {
        if (typeof texture.dispose === 'function') {
            texture.dispose();
        }
        if (texture.image && typeof texture.image.close === 'function') {
            // ImageBitmap disposal if applicable
            texture.image.close();
        }
    } catch (e) {
        console.warn('[ThreeDisposal] Error disposing texture:', e);
    }
};

export const safeDisposeRenderTarget = (renderTarget) => {
    if (!renderTarget) return;
    try {
        if (renderTarget.texture) {
            safeDisposeTexture(renderTarget.texture);
        }
        if (typeof renderTarget.dispose === 'function') {
            renderTarget.dispose();
        }
    } catch (e) {
        console.warn('[ThreeDisposal] Error disposing render target:', e);
    }
};

export const safeDisposeMaterial = (material) => {
    if (!material) return;
    try {
        // Dispose all associated textures on the material
        const textureKeys = [
            'map', 'alphaMap', 'aoMap', 'bumpMap', 'displacementMap',
            'emissiveMap', 'envMap', 'lightMap', 'metalnessMap',
            'normalMap', 'roughnessMap', 'specularMap'
        ];
        textureKeys.forEach(key => {
            if (material[key]) {
                safeDisposeTexture(material[key]);
            }
        });
        if (typeof material.dispose === 'function') {
            material.dispose();
        }
    } catch (e) {
        console.warn('[ThreeDisposal] Error disposing material:', e);
    }
};

export const safeDisposeGeometry = (geometry) => {
    if (!geometry) return;
    try {
        if (typeof geometry.dispose === 'function') {
            geometry.dispose();
        }
    } catch (e) {
        console.warn('[ThreeDisposal] Error disposing geometry:', e);
    }
};

export const safeDisposeObject3D = (object3D) => {
    if (!object3D) return;
    try {
        object3D.traverse((child) => {
            if (child.geometry) {
                safeDisposeGeometry(child.geometry);
            }
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(safeDisposeMaterial);
                } else {
                    safeDisposeMaterial(child.material);
                }
            }
        });
    } catch (e) {
        console.warn('[ThreeDisposal] Error disposing Object3D hierarchy:', e);
    }
};

