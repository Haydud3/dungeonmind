import React from 'react';

const DiceOverlay = ({ roll }) => {
    if (!roll) return null;

    const { die, result } = roll;

    // --- D6: TRUE 3D CUBE ---
    const RenderD6 = () => (
        <div className="cube-wrapper animate-tumble">
            <div className="face face-front"></div>
            <div className="face face-back"></div>
            <div className="face face-right"></div>
            <div className="face face-left"></div>
            <div className="face face-top"></div>
            <div className="face face-bottom"></div>
            {/* The Result floats on top of the front face */}
            <div className="face-result">
                <span className="result-text">{result}</span>
            </div>
        </div>
    );

    // --- POLYGONS: STACKED LAYERS FOR DEPTH ---
    const RenderPoly = ({ shapeClass }) => (
        <div className="extrusion-wrapper animate-tumble">
            {/* We create 5 layers to give it "thickness" */}
            {[...Array(5)].map((_, i) => (
                <div 
                    key={i}
                    className={`extrusion-layer ${shapeClass}`} 
                    style={{ 
                        transform: `translateZ(-${i * 2}px)`,
                        filter: `brightness(${1 - (i * 0.1)})` // Darkens back layers
                    }}
                ></div>
            ))}
            
            {/* Front Face with Result */}
            <div className={`extrusion-layer ${shapeClass}`} style={{ transform: 'translateZ(2px)', background: 'linear-gradient(135deg, #fbbf24, #d97706)' }}></div>
            
            <div className="face-result" style={{ transform: 'translateZ(10px)' }}>
                <span className="result-text">{result}</span>
            </div>
        </div>
    );

    let content = null;
    const d = parseInt(die);

    switch (d) {
        case 4: content = <RenderPoly shapeClass="clip-tri" />; break;
        case 6: content = <RenderD6 />; break;
        case 8: content = <RenderPoly shapeClass="clip-diamond" />; break;
        case 10: content = <RenderPoly shapeClass="clip-kite" />; break;
        case 12: content = <RenderPoly shapeClass="clip-dodeca" />; break;
        case 20: content = <RenderPoly shapeClass="clip-hex" />; break;
        case 100: content = <RenderPoly shapeClass="rounded-full" />; break;
        default: content = <RenderPoly shapeClass="rounded-xl" />; break;
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
