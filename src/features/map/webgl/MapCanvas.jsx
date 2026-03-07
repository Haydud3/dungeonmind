import React from 'react';
import { Canvas } from '@react-three/fiber';
import { useMapStore } from '../state/useMapStore';
import CameraController from './CameraController';
import Scene from './Scene';

const MapCanvas = ({ assembledMapUrl, tokenBlobUrls }) => {
  const view = useMapStore((state) => state.view);
  
  // This needs to come from the container div, not window.
  // For now, this is a placeholder. Will be fixed when refactoring useMapInteractions.
  const containerDimensions = { width: window.innerWidth, height: window.innerHeight };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none' }}>
      <Canvas
          dpr={window.devicePixelRatio}
          resize={{ debounce: 0 }}
          orthographic
          camera={{ near: -100, far: 100 }}
          gl={{ 
              alpha: true, 
              powerPreference: 'low-power',
          }}
          events={null} // Interactions will be handled by the HTML layer
      >
          <CameraController view={view} containerDimensions={containerDimensions} />
          <Scene 
            assembledMapUrl={assembledMapUrl}
            tokenBlobUrls={tokenBlobUrls}
          />
      </Canvas>
    </div>
  );
};

export default MapCanvas;
