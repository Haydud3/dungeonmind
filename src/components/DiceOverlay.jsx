import React from 'react';

const DiceOverlay = ({ roll }) => {
    if (!roll) return null;

    const { die, result } = roll;

    // Helper to render a D6 (Cube)
    const RenderD6 = () => (
        <div className="cube-wrapper animate-tumble">
            <div className="face face-front">1</div>
            <div className="face face-back">6</div>
            <div className="face face-right">3</div>
            <div className="face face-left">4</div>
            <div className="face face-top">5</div>
            <div className="face face-bottom">2</div>
            {/* The result face forces itself to the front at the end of animation via CSS or we just overlay the result for visual clarity */}
            <div className="face-content animate-land">{result}</div>
        </div>
    );

    // Generic shape for D4, D8, D12, D20 (using the extrusion CSS classes)
    // We simplify the visual: It tumbles a shape and shows the number on top
    const RenderPoly = ({ shapeClass }) => (
        <div className="extrusion-wrapper animate-tumble">
            <div className={`extrusion-layer ${shapeClass} bg-amber-600 translate-z-[-10px]`}></div>
            <div className={`extrusion-layer ${shapeClass} bg-amber-700 translate-z-[-5px]`}></div>
            <div className={`extrusion-layer ${shapeClass} bg-amber-500 translate-z-[0px]`}></div>
            <div className={`extrusion-layer ${shapeClass} bg-amber-600 translate-z-[5px]`}></div>
            <div className={`extrusion-front ${shapeClass} bg-gradient-to-br from-amber-500 to-amber-700 border border-amber-300`}>
                <div className="inner-shading"></div>
                <span className="result-text animate-land">{result}</span>
            </div>
        </div>
    );

    let content = null;
    
    // Choose shape based on die type
    switch (die) {
        case 4: content = <RenderPoly shapeClass="clip-tri" />; break;
        case 6: content = <RenderD6 />; break; // True cube
        case 8: content = <RenderPoly shapeClass="clip-diamond" />; break;
        case 10: content = <RenderPoly shapeClass="clip-kite" />; break;
        case 12: content = <RenderPoly shapeClass="clip-dodeca" />; break;
        case 20: content = <RenderPoly shapeClass="clip-hex" />; break; // Hexagon is a good 2D approx for a spinning d20
        case 100: content = <RenderPoly shapeClass="rounded-full" />; break;
        default: content = <RenderPoly shapeClass="rounded-lg" />; break;
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
