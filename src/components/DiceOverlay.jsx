import React from 'react';

const DiceOverlay = ({ roll }) => {
    if (!roll) return null;

    const { die, result } = roll;

    // 1. D6 Rendering (The Cube)
    const RenderD6 = () => (
        <div className="cube-wrapper animate-tumble">
            <div className="face face-front">1</div>
            <div className="face face-back">6</div>
            <div className="face face-right">3</div>
            <div className="face face-left">4</div>
            <div className="face face-top">5</div>
            <div className="face face-bottom">2</div>
            <div className="face-content animate-land">{result}</div>
        </div>
    );

    // 2. Generic Polygon Rendering (D4, D8, D10, D12, D20)
    // We stack multiple layers with Z-index translation to create fake 3D depth
    const RenderPoly = ({ shapeClass }) => (
        <div className="extrusion-wrapper animate-tumble">
            {/* Layer 1: Back (Darkest) */}
            <div className={`extrusion-layer ${shapeClass}`} style={{ transform: 'translateZ(-10px)', filter: 'brightness(0.5)' }}></div>
            {/* Layer 2: Middle */}
            <div className={`extrusion-layer ${shapeClass}`} style={{ transform: 'translateZ(-5px)', filter: 'brightness(0.7)' }}></div>
            {/* Layer 3: Base */}
            <div className={`extrusion-layer ${shapeClass}`} style={{ transform: 'translateZ(0px)' }}></div>
            {/* Layer 4: Front (Lightest) */}
            <div className={`extrusion-layer ${shapeClass}`} style={{ transform: 'translateZ(5px)', border: '1px solid rgba(255,255,255,0.4)' }}></div>
            
            {/* Result Text */}
            <div className={`extrusion-front ${shapeClass}`}>
                <span className="result-text animate-land">{result}</span>
            </div>
        </div>
    );

    let content = null;
    
    // Choose shape based on die type
    switch (parseInt(die)) {
        case 4: content = <RenderPoly shapeClass="clip-tri" />; break;
        case 6: content = <RenderD6 />; break; 
        case 8: content = <RenderPoly shapeClass="clip-diamond" />; break;
        case 10: content = <RenderPoly shapeClass="clip-kite" />; break;
        case 12: content = <RenderPoly shapeClass="clip-dodeca" />; break;
        case 20: content = <RenderPoly shapeClass="clip-hex" />; break;
        case 100: content = <RenderPoly shapeClass="rounded-full border-4 border-amber-600 bg-amber-800" />; break;
        default: content = <RenderPoly shapeClass="rounded-lg bg-amber-600" />; break;
    }

    return (
        <div className="die-container">
            <div className="die-mover">
                {content}
            </div>
        </div>
    );
};

export default DiceOverlay;
