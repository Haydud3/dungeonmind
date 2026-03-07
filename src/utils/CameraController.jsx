import { useLayoutEffect } from 'react';
import { useThree } from '@react-three/fiber';

const CameraController = ({ view, containerDimensions }) => {
    const { camera, gl } = useThree();
    
    useLayoutEffect(() => {
        if (!containerDimensions.width || !containerDimensions.height) return;
        
        gl.setSize(containerDimensions.width, containerDimensions.height, true);
        
        camera.left = -view.x / view.scale;
        camera.right = (containerDimensions.width - view.x) / view.scale;
        camera.top = view.y / view.scale;
        camera.bottom = (view.y - containerDimensions.height) / view.scale;
        camera.position.set(0, 0, 10);
        camera.zoom = 1;
        camera.updateProjectionMatrix();
    }, [camera, gl, view, containerDimensions]);
    
    return null;
};

export default CameraController;