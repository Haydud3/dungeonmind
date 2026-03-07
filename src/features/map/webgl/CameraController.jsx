import { useThree } from '@react-three/fiber';
import { useLayoutEffect } from 'react';

/**
 * CameraController syncs the Three.js OrthographicCamera with the 
 * CSS-based pan and zoom state of the InteractiveMap.
 */
const CameraController = ({ view, containerDimensions }) => {
    const { camera } = useThree();

    useLayoutEffect(() => {
        if (!camera || !containerDimensions.width || !containerDimensions.height) return;

        // 1. Sync the zoom level (scale)
        camera.zoom = view.scale;

        // 2. Position the camera in world space.
        // The CSS map uses transform-origin: 0 0 and translate(view.x, view.y).
        // To align WebGL, we calculate the camera position (center of viewport) 
        // relative to the world origin (0,0).
        camera.position.x = (containerDimensions.width / 2 - view.x) / view.scale;
        camera.position.y = -(containerDimensions.height / 2 - view.y) / view.scale;

        camera.updateProjectionMatrix();
    }, [view, containerDimensions, camera]);

    return null;
};

export default CameraController;
