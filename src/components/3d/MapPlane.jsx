import React, { useState, useMemo } from 'react';
import * as THREE from 'three';
import { useResolvedUrl } from '../../utils/useResolvedUrl';

export const MapPlaneContent = ({ backgroundUrl, scale = 20 }) => {
  const [aspect, setAspect] = useState(1);
  const texture = useMemo(() => {
      if (!backgroundUrl) return null;
      const loader = new THREE.TextureLoader();
      return loader.load(backgroundUrl, (tex) => {
          if (tex.image) {
              setAspect(tex.image.width / tex.image.height);
          }
      });
  }, [backgroundUrl]);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
      <planeGeometry args={[scale * aspect, scale]} />
      <meshStandardMaterial map={texture} transparent={true} roughness={0.8} metalness={0.1} />
    </mesh>
  );
};

export const MapPlane = ({ backgroundUrl, scale = 20 }) => {
  const resolvedUrl = useResolvedUrl(backgroundUrl);

  if (!resolvedUrl) return null;
  return <MapPlaneContent backgroundUrl={resolvedUrl} scale={scale} />;
};
