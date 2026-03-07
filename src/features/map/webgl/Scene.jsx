import React, { Suspense } from 'react';
import { useMapStore } from '../state/useMapStore';
import WebGLMap from './WebGLMap';
import WebGLGrid from './WebGLGrid';
import WebGLTokenLayer from './WebGLTokenLayer';
// import WebGLInteractionLayer from './WebGLInteractionLayer'; // To be moved
// import VfxOverlay from './VfxOverlay'; // To be moved

const Scene = ({ assembledMapUrl, tokenBlobUrls }) => {
  // Get data from the central store
  const mapData = useMapStore((state) => state.mapData);
  const mapDimensions = useMapStore((state) => state.mapDimensions);
  const selectedTokenId = useMapStore((state) => state.selectedTokenId);
  const movingTokenId = useMapStore((state) => state.movingTokenId);

  // This will be replaced by logic from useVisionEngine
  const visibleTokens = mapData.tokens; // Placeholder
  const visionProps = {
    wallUniforms: { buffer: new Float32Array(mapData.walls.flatMap(w => [w.p1.x, -w.p1.y, w.p2.x, -w.p2.y])), count: mapData.walls.length },
    viewerUniforms: { buffer: new Float32Array(), count: 0 }, // TODO
    visionActive: mapData.visionActive,
    discoveryTexture: null, // TODO
    isDM: true, // TODO: Get role properly
  };

  return (
    <Suspense fallback={null}>
      {assembledMapUrl && (
        <WebGLMap 
          url={assembledMapUrl} 
          width={mapDimensions.width} 
          height={mapDimensions.height} 
          {...visionProps}
          mapDimensions={mapDimensions}
        />
      )}
      <WebGLGrid 
        grid={mapData.grid} 
        width={mapDimensions.width} 
        height={mapDimensions.height} 
        {...visionProps}
        mapDimensions={mapDimensions}
      />
      <WebGLTokenLayer 
        visibleTokens={visibleTokens} 
        grid={mapData.grid} 
        mapDimensions={mapDimensions}
        selectedTokenId={selectedTokenId} 
        combat={null} // TODO from campaign data
        tokenBlobUrls={tokenBlobUrls} 
        tokenRefs={{current: {}}} // TODO
        movingTokenId={movingTokenId}
        showNameplates={mapData.grid.nameplates}
        role={'dm'} // TODO
        user={null} // TODO
        {...visionProps}
      />
    </Suspense>
  );
};

export default Scene;
