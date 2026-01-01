import React, { useRef, useEffect, useState } from 'react';
import Icon from './Icon';

const MapBoard = ({ data, role, updateMapState }) => {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [brushSize, setBrushSize] = useState(40);
    const [mode, setMode] = useState('reveal'); 

    const mapUrl = data.campaign?.activeMap?.url;
    const revealPaths = data.campaign?.activeMap?.revealPaths || [];

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx || !containerRef.current) return;
        const resize = () => {
            const parent = containerRef.current;
            canvas.width = parent.clientWidth;
            canvas.height = parent.clientHeight;
            drawFog();
        };
        window.addEventListener('resize', resize);
        resize();
        return () => window.removeEventListener('resize', resize);
    }, [mapUrl]); 

    const drawFog = () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        revealPaths.forEach(path => {
            ctx.globalCompositeOperation = path.mode === 'shroud' ? 'source-over' : 'destination-out';
            ctx.lineWidth = path.size;
            ctx.strokeStyle = path.mode === 'shroud' ? 'black' : 'rgba(0,0,0,1)';
            ctx.beginPath();
            path.points.forEach((p, i) => {
                const x = p.x * canvas.width;
                const y = p.y * canvas.height;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();
        });
    };

    useEffect(() => { drawFog(); }, [revealPaths]);

    const getCoords = (e) => {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: (clientX - rect.left) / canvas.width, y: (clientY - rect.top) / canvas.height };
    };

    const startDraw = (e) => {
        if (role !== 'dm') return;
        setIsDrawing(true);
        const { x, y } = getCoords(e);
        updateMapState('start_path', { mode, size: brushSize, points: [{x, y}] });
    };

    const moveDraw = (e) => {
        if (!isDrawing || role !== 'dm') return;
        e.preventDefault(); 
        const { x, y } = getCoords(e);
        updateMapState('append_point', { x, y });
    };

    const endDraw = () => { setIsDrawing(false); };

    const handleUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => updateMapState('set_image', evt.target.result);
        reader.readAsDataURL(file);
    };

    return (
        <div className="flex flex-col h-full bg-slate-900 overflow-hidden relative">
            {role === 'dm' && (
                <div className="p-2 bg-slate-800 border-b border-slate-700 flex gap-4 items-center shrink-0 z-20">
                    <label className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded text-xs cursor-pointer flex items-center gap-2"><Icon name="upload" size={14}/> Upload Map<input type="file" accept="image/*" className="hidden" onChange={handleUpload}/></label>
                    <div className="h-6 w-px bg-slate-600"></div>
                    <button onClick={() => setMode('reveal')} className={`p-2 rounded ${mode==='reveal' ? 'bg-amber-600 text-white' : 'text-slate-400'}`}><Icon name="eraser" size={18}/></button>
                    <button onClick={() => setMode('shroud')} className={`p-2 rounded ${mode==='shroud' ? 'bg-slate-600 text-white' : 'text-slate-400'}`}><Icon name="brush" size={18}/></button>
                    <input type="range" min="10" max="100" value={brushSize} onChange={e=>setBrushSize(parseInt(e.target.value))} className="w-24 accent-amber-500"/>
                    <button onClick={() => updateMapState('clear_fog', null)} className="ml-auto text-red-400 text-xs hover:text-white">Reset Fog</button>
                </div>
            )}
            <div ref={containerRef} className="flex-1 relative overflow-hidden flex items-center justify-center bg-black">
                {mapUrl ? (<><img src={mapUrl} className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"/><canvas ref={canvasRef} className="absolute inset-0 w-full h-full fog-canvas" onMouseDown={startDraw} onMouseMove={moveDraw} onMouseUp={endDraw} onMouseLeave={endDraw} onTouchStart={startDraw} onTouchMove={moveDraw} onTouchEnd={endDraw}/></>) : (<div className="text-slate-500 flex flex-col items-center"><Icon name="map" size={48} className="mb-2 opacity-20"/><p>No Map Loaded</p></div>)}
            </div>
        </div>
    );
};

export default MapBoard;
