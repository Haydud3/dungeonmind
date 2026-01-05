import React, { useEffect, useState } from 'react';

const DiceOverlay = ({ roll }) => {
    const [phase, setPhase] = useState('rolling'); 

    useEffect(() => {
        const landTimer = setTimeout(() => setPhase('landed'), 1000);
        const fadeTimer = setTimeout(() => setPhase('fading'), 2500);
        return () => { clearTimeout(landTimer); clearTimeout(fadeTimer); };
    }, []);

    if (phase === 'fading') return null;

    // --- RENDER HELPERS ---

    // 1. TRUE 3D CUBE (Perfect for d6)
    const renderCube = () => (
        <div className="cube-wrapper">
            <div className="face face-front"></div>
            <div className="face face-back"></div>
            <div className="face face-right"></div>
            <div className="face face-left"></div>
            <div className="face face-top"></div>
            <div className="face face-bottom"></div>
            <div className="face-content">{phase === 'rolling' ? '' : roll.result}</div>
        </div>
    );

    // 2. EXTRUDED SHAPE (For d4, d8, d12, d20, d100)
    // We stack multiple layers to create "thickness" so it doesn't look like paper.
    const renderExtrudedShape = (dieType) => {
        const layers = Array.from({ length: 8 }); // 8 layers of thickness
        
        let shapeClass = "";
        let colorClass = "";
        
        switch(parseInt(dieType)) {
            case 4: shapeClass = "clip-tri"; colorClass = "bg-green-600"; break;
            case 8: shapeClass = "clip-diamond"; colorClass = "bg-indigo-600"; break;
            case 10: shapeClass = "clip-kite"; colorClass = "bg-purple-600"; break;
            case 12: shapeClass = "clip-dodeca"; colorClass = "bg-orange-600"; break;
            case 20: shapeClass = "clip-hex"; colorClass = "bg-red-700"; break;
            case 100: shapeClass = "rounded-full"; colorClass = "bg-slate-800 border-4 border-slate-600"; break; // Fixed d100
            default: shapeClass = "rounded-full"; colorClass = "bg-slate-600"; break;
        }

        return (
            <div className="extrusion-wrapper">
                {/* The "Sides" (Thickness) */}
                {layers.map((_, i) => (
                    <div 
                        key={i} 
                        className={`extrusion-layer ${shapeClass} ${colorClass}`}
                        style={{ transform: `translateZ(-${i}px)` }} 
                    />
                ))}
                {/* The "Front" Face */}
                <div className={`extrusion-front ${shapeClass} ${colorClass}`}>
                    <div className="inner-shading"></div>
                    <span className="result-text">{phase === 'rolling' ? '' : roll.result}</span>
                </div>
            </div>
        );
    };

    return (
        <div className="die-container">
            <div 
                className={`die-mover ${phase === 'rolling' ? 'animate-tumble' : 'animate-land'}`}
                style={{ top: '50vh', left: '50vw' }}
            >
                {parseInt(roll.die) === 6 
                    ? renderCube() 
                    : renderExtrudedShape(roll.die)
                }
            </div>
        </div>
    );
};

export default DiceOverlay;
