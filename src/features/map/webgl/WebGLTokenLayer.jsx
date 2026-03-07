import React from 'react';
import WebGLToken from './WebGLToken';
import { idsMatch } from '../../../utils/idUtils';

const WebGLTokenLayer = ({ visibleTokens, grid, mapDimensions, selectedTokenId, combat, tokenBlobUrls, tokenRefs, movingTokenId, wallUniforms, viewerUniforms, visionActive, showNameplates, role, user }) => {
    return (
        <group>
            {visibleTokens.map(token => (
                <WebGLToken 
                    key={token.id}
                    token={token}
                    grid={grid}
                    mapDimensions={mapDimensions}
                    isSelected={idsMatch(selectedTokenId, token.id)}
                    isTurn={combat?.active && idsMatch(combat.combatants?.[combat.turn]?.id, token.id)}
                    tokenBlobUrl={tokenBlobUrls[token.id]}
                    tokenRefs={tokenRefs}
                    isMoving={idsMatch(movingTokenId, token.id)}
                    wallUniforms={wallUniforms} 
                    viewerUniforms={viewerUniforms} 
                    visionActive={visionActive}
                    showNameplates={showNameplates}
                    role={role}
                    user={user}
                />
            ))}
        </group>
    );
};

export default WebGLTokenLayer;
