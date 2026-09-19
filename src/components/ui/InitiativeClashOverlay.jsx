import React, { useEffect, useState, useRef, useMemo } from 'react';

/**
 * Procedural Web Audio sword clash sound generator.
 * Creates a crisp metallic strike transient, resonant steel ring, and sub-bass impact punch.
 * Requires 0 external audio files and has 0 network latency.
 */
export const playSwordClashSound = () => {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        if (ctx.state === 'suspended') {
            ctx.resume();
        }
        const now = ctx.currentTime;

        // 1. Sharp metallic strike transient (White/Pink noise burst through bandpass filter)
        const bufferSize = Math.floor(ctx.sampleRate * 0.08);
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.015));
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.setValueAtTime(3400, now);
        noiseFilter.Q.setValueAtTime(5.0, now);

        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.85, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(ctx.destination);
        noise.start(now);

        // 2. Harmonic blade resonance ringing (simulates vibrating tempered steel)
        const harmonics = [
            { freq: 2180, gain: 0.35, decay: 1.4 },
            { freq: 3260, gain: 0.22, decay: 1.1 },
            { freq: 4410, gain: 0.15, decay: 0.8 },
            { freq: 1420, gain: 0.25, decay: 1.3 }
        ];

        harmonics.forEach(({ freq, gain, decay }) => {
            const osc = ctx.createOscillator();
            const oscGain = ctx.createGain();

            osc.type = freq < 2000 ? 'triangle' : 'sine';
            osc.frequency.setValueAtTime(freq, now);
            // Slight downward micro-pitch envelope as blade vibration settles
            osc.frequency.exponentialRampToValueAtTime(freq * 0.97, now + decay);

            oscGain.gain.setValueAtTime(gain, now);
            oscGain.gain.exponentialRampToValueAtTime(0.0001, now + decay);

            osc.connect(oscGain);
            oscGain.connect(ctx.destination);

            osc.start(now);
            osc.stop(now + decay);
        });

        // 3. Low impact bass punch (gives the strike physical weight)
        const bassOsc = ctx.createOscillator();
        const bassGain = ctx.createGain();
        bassOsc.type = 'sine';
        bassOsc.frequency.setValueAtTime(150, now);
        bassOsc.frequency.exponentialRampToValueAtTime(45, now + 0.22);

        bassGain.gain.setValueAtTime(0.65, now);
        bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

        bassOsc.connect(bassGain);
        bassGain.connect(ctx.destination);

        bassOsc.start(now);
        bassOsc.stop(now + 0.25);
    } catch (err) {
        console.warn('Sword clash audio effect skipped:', err);
    }
};

/**
 * Detailed SVG Fantasy Longsword component
 */
const FantasySword = ({ className = '', isFlipped = false }) => (
    <svg 
        viewBox="0 0 100 480" 
        className={`w-28 sm:w-36 md:w-44 h-auto drop-shadow-[0_10px_25px_rgba(0,0,0,0.85)] ${className}`}
        style={{ transform: isFlipped ? 'scaleX(-1)' : undefined }}
    >
        <defs>
            {/* Blade Metallic Gradient - Bright Bevel */}
            <linearGradient id="bladeLeft" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#f8fafc" />
                <stop offset="40%" stopColor="#e2e8f0" />
                <stop offset="100%" stopColor="#94a3b8" />
            </linearGradient>
            
            {/* Blade Metallic Gradient - Dark Bevel */}
            <linearGradient id="bladeRight" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#64748b" />
                <stop offset="60%" stopColor="#475569" />
                <stop offset="100%" stopColor="#334155" />
            </linearGradient>

            {/* Fuller / Blood Groove Gradient */}
            <linearGradient id="bladeFuller" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#1e293b" />
                <stop offset="50%" stopColor="#0f172a" />
                <stop offset="100%" stopColor="#1e293b" />
            </linearGradient>

            {/* Gold Crossguard & Pommel Gradient */}
            <linearGradient id="goldHilt" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#fef08a" />
                <stop offset="35%" stopColor="#f59e0b" />
                <stop offset="80%" stopColor="#b45309" />
                <stop offset="100%" stopColor="#78350f" />
            </linearGradient>

            {/* Grip Gradient */}
            <linearGradient id="leatherGrip" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#451a03" />
                <stop offset="40%" stopColor="#78350f" />
                <stop offset="70%" stopColor="#451a03" />
                <stop offset="100%" stopColor="#270e02" />
            </linearGradient>

            {/* Rune Glow Filter */}
            <filter id="runeGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                </feMerge>
            </filter>
        </defs>

        {/* 1. Pommel (Bottom) */}
        <path d="M 42 450 C 42 465 58 465 58 450 C 58 442 42 442 42 450 Z" fill="url(#goldHilt)" stroke="#78350f" strokeWidth="1.5" />
        <circle cx="50" cy="451" r="3.5" fill="#ef4444" stroke="#7f1d1d" strokeWidth="1" />

        {/* 2. Grip (Hilt handle) with leather wrapping ribs */}
        <rect x="46" y="380" width="8" height="66" rx="2" fill="url(#leatherGrip)" stroke="#1c1917" strokeWidth="1" />
        {[390, 400, 410, 420, 430, 440].map(y => (
            <line key={y} x1="45" y1={y} x2="55" y2={y + 3} stroke="#d97706" strokeWidth="1.2" opacity="0.8" />
        ))}

        {/* 3. Crossguard (Quillons) */}
        <path 
            d="M 12 376 C 25 372 40 374 46 378 L 46 385 L 54 385 L 54 378 C 60 374 75 372 88 376 C 92 377 94 372 90 369 C 75 360 62 366 52 368 L 50 368 L 48 368 C 38 366 25 360 10 369 C 6 372 8 377 12 376 Z" 
            fill="url(#goldHilt)" 
            stroke="#78350f" 
            strokeWidth="1.5"
            filter="drop-shadow(0 2px 4px rgba(0,0,0,0.5))"
        />
        {/* Guard Center Medallion with Ruby */}
        <circle cx="50" cy="373" r="6" fill="url(#goldHilt)" stroke="#78350f" strokeWidth="1.5" />
        <circle cx="50" cy="373" r="3.5" fill="#ef4444" filter="url(#runeGlow)" />

        {/* 4. Blade Left Half (Specular / Light side) */}
        <path 
            d="M 50 368 L 44 366 L 46 45 Q 48 20 50 10 L 50 368 Z" 
            fill="url(#bladeLeft)" 
        />

        {/* 5. Blade Right Half (Shadow / Steel side) */}
        <path 
            d="M 50 368 L 56 366 L 54 45 Q 52 20 50 10 L 50 368 Z" 
            fill="url(#bladeRight)" 
        />

        {/* 6. Central Fuller (Blood Groove) */}
        <rect x="49" y="90" width="2" height="260" rx="1" fill="url(#bladeFuller)" opacity="0.85" />

        {/* 7. Subtle Glowing Ancient Runes along the blade */}
        <g stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" opacity="0.75" filter="url(#runeGlow)">
            <line x1="50" y1="140" x2="48" y2="148" />
            <line x1="50" y1="148" x2="52" y2="156" />
            <circle cx="50" cy="180" r="1.5" fill="#f59e0b" />
            <line x1="47" y1="210" x2="53" y2="214" />
            <line x1="50" y1="235" x2="50" y2="250" />
            <circle cx="50" cy="275" r="1.5" fill="#f59e0b" />
        </g>
    </svg>
);

export const InitiativeClashOverlay = ({ onComplete }) => {
    // Animation phases:
    // 'entry' (0 - 320ms): swords charge in towards center
    // 'impact' (320ms - 1750ms): blades strike with clank, sparks, banner reveals
    // 'exit' (1750ms - 2050ms): smooth fade out
    const [phase, setPhase] = useState('entry');
    const [showSparks, setShowSparks] = useState(false);
    const [screenShake, setScreenShake] = useState(false);
    const audioTriggeredRef = useRef(false);

    // Precalculate random spark trajectories
    const sparks = useMemo(() => {
        return Array.from({ length: 18 }).map((_, i) => {
            const angle = (i / 18) * Math.PI * 2 + (Math.random() * 0.4 - 0.2);
            const dist = 90 + Math.random() * 140;
            const size = 3 + Math.random() * 4;
            const duration = 0.4 + Math.random() * 0.35;
            const isWhite = Math.random() > 0.6;
            return {
                id: i,
                x: Math.cos(angle) * dist,
                y: Math.sin(angle) * dist,
                size,
                duration,
                color: isWhite ? '#ffffff' : (Math.random() > 0.5 ? '#fbbf24' : '#f97316'),
                delay: Math.random() * 0.05
            };
        });
    }, []);

    useEffect(() => {
        // Stage 1: The Clash occurs at 320ms
        const clashTimer = setTimeout(() => {
            setPhase('impact');
            setShowSparks(true);
            setScreenShake(true);

            if (!audioTriggeredRef.current) {
                audioTriggeredRef.current = true;
                playSwordClashSound();
            }

            // Stop screen shake after 220ms
            setTimeout(() => {
                setScreenShake(false);
            }, 220);
        }, 320);

        // Stage 2: Begin exit fade at 1800ms
        const exitTimer = setTimeout(() => {
            setPhase('exit');
        }, 1800);

        // Stage 3: Finish and cleanup at 2100ms
        const completeTimer = setTimeout(() => {
            if (onComplete) onComplete();
        }, 2100);

        // Allow user to click anywhere or press Escape to skip immediately
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') {
                if (onComplete) onComplete();
            }
        };
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            clearTimeout(clashTimer);
            clearTimeout(exitTimer);
            clearTimeout(completeTimer);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [onComplete]);

    const handleSkip = () => {
        if (onComplete) onComplete();
    };

    return (
        <div 
            onClick={handleSkip}
            className={`fixed inset-0 z-[120] flex items-center justify-center cursor-pointer select-none overflow-hidden transition-opacity duration-300 ${
                phase === 'exit' ? 'opacity-0' : 'opacity-100'
            }`}
            style={{
                background: 'radial-gradient(circle at center, rgba(15, 23, 42, 0.92) 0%, rgba(3, 7, 18, 0.97) 100%)',
                backdropFilter: 'blur(10px)'
            }}
            title="Click anywhere to skip"
        >
            {/* CSS Animation Keyframes */}
            <style>{`
                @keyframes clashShake {
                    0% { transform: translate(0, 0); }
                    20% { transform: translate(-5px, 4px) rotate(-0.5deg); }
                    40% { transform: translate(5px, -4px) rotate(0.5deg); }
                    60% { transform: translate(-3px, 2px); }
                    80% { transform: translate(3px, -2px); }
                    100% { transform: translate(0, 0); }
                }

                @keyframes shockwaveExpand {
                    0% { transform: scale(0.1); opacity: 1; border-width: 8px; }
                    50% { opacity: 0.8; }
                    100% { transform: scale(3.2); opacity: 0; border-width: 1px; }
                }

                @keyframes flashBurst {
                    0% { transform: scale(0.2); opacity: 1; }
                    40% { transform: scale(1.6); opacity: 0.9; }
                    100% { transform: scale(2.4); opacity: 0; }
                }

                @keyframes sparkFly {
                    0% { transform: translate(0, 0) scale(1.4); opacity: 1; }
                    80% { opacity: 0.9; }
                    100% { transform: translate(var(--tx), var(--ty)) scale(0.2); opacity: 0; }
                }

                @keyframes bannerSlam {
                    0% { transform: scale(1.6); opacity: 0; filter: blur(6px); }
                    60% { transform: scale(0.96); opacity: 1; filter: blur(0px); }
                    100% { transform: scale(1.0); opacity: 1; filter: blur(0px); }
                }

                @keyframes swordGlowPulse {
                    0%, 100% { filter: drop-shadow(0 0 12px rgba(245, 158, 11, 0.5)); }
                    50% { filter: drop-shadow(0 0 24px rgba(245, 158, 11, 0.9)); }
                }
            `}</style>

            {/* Ambient Background Glow */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div 
                    className="w-[500px] h-[500px] rounded-full bg-amber-500/15 blur-[100px] transition-all duration-700"
                    style={{ transform: phase === 'impact' ? 'scale(1.4)' : 'scale(0.8)' }}
                />
            </div>

            {/* Main Shaking Stage */}
            <div 
                className="relative w-full max-w-2xl h-96 flex items-center justify-center pointer-events-none"
                style={{
                    animation: screenShake ? 'clashShake 0.22s cubic-bezier(0.36, 0.07, 0.19, 0.97) both' : 'none'
                }}
            >
                {/* 1. LEFT SWORD */}
                <div 
                    className="absolute z-10 transition-all"
                    style={{
                        transformOrigin: '50% 40%',
                        transform: phase === 'entry' 
                            ? 'translate(-120vw, -80vh) rotate(-35deg) scale(1.2)' 
                            : 'translate(-12px, -8px) rotate(-45deg) scale(1.1)',
                        transition: phase === 'entry' 
                            ? 'none' 
                            : 'transform 0.32s cubic-bezier(0.16, 1, 0.3, 1)',
                        animation: phase === 'impact' ? 'swordGlowPulse 2s ease-in-out infinite' : 'none'
                    }}
                >
                    <FantasySword />
                </div>

                {/* 2. RIGHT SWORD */}
                <div 
                    className="absolute z-10 transition-all"
                    style={{
                        transformOrigin: '50% 40%',
                        transform: phase === 'entry' 
                            ? 'translate(120vw, -80vh) rotate(35deg) scale(1.2)' 
                            : 'translate(12px, -8px) rotate(45deg) scale(1.1)',
                        transition: phase === 'entry' 
                            ? 'none' 
                            : 'transform 0.32s cubic-bezier(0.16, 1, 0.3, 1)',
                        animation: phase === 'impact' ? 'swordGlowPulse 2s ease-in-out infinite' : 'none'
                    }}
                >
                    <FantasySword isFlipped={true} />
                </div>

                {/* 3. COLLISION SPARKS & SHOCKWAVE (Origin at Center Crossing Point) */}
                {showSparks && (
                    <div className="absolute z-30 pointer-events-none flex items-center justify-center">
                        {/* Radial Flash Flare */}
                        <div 
                            className="absolute w-36 h-36 rounded-full bg-gradient-to-r from-amber-100 via-amber-300 to-yellow-500 blur-sm"
                            style={{ animation: 'flashBurst 0.35s ease-out forwards' }}
                        />

                        {/* Expanding Golden Shockwave Ring */}
                        <div 
                            className="absolute w-44 h-44 rounded-full border-4 border-amber-400"
                            style={{ animation: 'shockwaveExpand 0.5s cubic-bezier(0.1, 0.8, 0.3, 1) forwards' }}
                        />
                        
                        {/* Secondary Outer Shockwave */}
                        <div 
                            className="absolute w-44 h-44 rounded-full border-2 border-white/80"
                            style={{ animation: 'shockwaveExpand 0.4s cubic-bezier(0.1, 0.8, 0.3, 1) 0.05s forwards' }}
                        />

                        {/* Individual Sparks Ricocheting */}
                        {sparks.map(s => (
                            <div
                                key={s.id}
                                className="absolute rounded-full shadow-sm"
                                style={{
                                    width: `${s.size}px`,
                                    height: `${s.size}px`,
                                    backgroundColor: s.color,
                                    boxShadow: `0 0 10px ${s.color}`,
                                    '--tx': `${s.x}px`,
                                    '--ty': `${s.y}px`,
                                    animation: `sparkFly ${s.duration}s cubic-bezier(0.15, 0.9, 0.35, 1) ${s.delay}s forwards`
                                }}
                            />
                        ))}
                    </div>
                )}

                {/* 4. BANNER / TITLE (Slams into place as blades lock) */}
                {phase === 'impact' && (
                    <div 
                        className="absolute z-40 text-center flex flex-col items-center justify-center top-48 sm:top-52 px-4"
                        style={{ animation: 'bannerSlam 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}
                    >
                        {/* Eyebrow badge */}
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-950/80 border border-amber-500/60 shadow-[0_0_20px_rgba(245,158,11,0.3)] mb-2.5 backdrop-blur-md">
                            <span className="text-[11px] font-black uppercase tracking-[0.25em] text-amber-300">
                                ⚔️ Battle Commences ⚔️
                            </span>
                        </div>

                        {/* Main Title */}
                        <h1 className="text-3xl sm:text-5xl md:text-6xl font-black fantasy-font tracking-wider bg-gradient-to-b from-white via-amber-200 to-amber-500 bg-clip-text text-transparent drop-shadow-[0_4px_16px_rgba(245,158,11,0.7)]">
                            ROLL FOR INITIATIVE
                        </h1>

                        {/* Subtitle */}
                        <p className="text-xs sm:text-sm text-amber-200/90 font-medium tracking-wide mt-2 drop-shadow-md">
                            Steel clashes in the shadows. Ready your weapons!
                        </p>

                        {/* Subtle skip prompt */}
                        <span className="text-[10px] text-slate-500 mt-4 tracking-wider uppercase font-semibold">
                            Click or press Esc to skip
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default InitiativeClashOverlay;

