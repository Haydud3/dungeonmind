import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import Icon from './Icon';
import { storeChunkedMap } from '../utils/storageUtils';

const splitImage = (image) => {
    const width = image.width / 2;
    const height = image.height / 2;
    const panelNames = ["Top-Down Map", "Depth Map", "Albedo Map", "Axonometric View"];
    const panels = [];

    for (let i = 0; i < 4; i++) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        const x = (i % 2) * width;
        const y = Math.floor(i / 2) * height;
        ctx.drawImage(image, x, y, width, height, 0, 0, width, height);
        panels.push({
            name: panelNames[i],
            dataUrl: canvas.toDataURL()
        });
    }
    return panels;
};


const MapGenerator = ({ onGenerateMap }) => {
    const [panels, setPanels] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);

    const onDrop = useCallback(acceptedFiles => {
        const file = acceptedFiles[0];
        if (!file) return;

        setIsProcessing(true);
        setPanels([]);
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const generatedPanels = splitImage(img);
                setPanels(generatedPanels);
                setIsProcessing(false);
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'image/*': [] },
        multiple: false
    });

    const handleGenerateMap = async () => {
        if (!onGenerateMap || panels.length < 4) return;

        setIsProcessing(true);
        try {
            // Panel 3 is Albedo, Panel 2 is Depth
            const albedoPanel = panels[2];
            const depthPanel = panels[1];

            const albedoId = await storeChunkedMap(albedoPanel.dataUrl, "generated_albedo.png");
            const depthId = await storeChunkedMap(depthPanel.dataUrl, "generated_depth.png");

            onGenerateMap({
                backgroundUrl: albedoId,
                heightmapUrl: depthId,
            });

        } catch (err) {
            console.error("Failed to generate map", err);
            alert("Map generation failed.");
        }
        setIsProcessing(false);
    };

    return (
        <div className="p-4 text-slate-300">
            <div {...getRootProps()} className={`w-full h-48 border-2 border-dashed border-slate-600 rounded-lg flex items-center justify-center text-slate-500 cursor-pointer hover:border-amber-500 hover:text-amber-400 transition-colors ${isDragActive ? 'bg-slate-800 border-amber-500' : ''}`}>
                <input {...getInputProps()} />
                {isProcessing ? (
                    <div className="flex flex-col items-center">
                        <Icon name="loader" className="animate-spin mb-2" />
                        <span>Processing...</span>
                    </div>
                ) : (
                    <div className="flex flex-col items-center">
                        <Icon name="upload-cloud" size={32} className="mb-2" />
                        {isDragActive ?
                            <p>Drop the sheet here...</p> :
                            <p>Drop Master Sheet here, or click to select</p>
                        }
                    </div>
                )}
            </div>

            {panels.length > 0 && (
                <div className="mt-4">
                    <h4 className="text-sm font-bold mb-2">Generated Panels</h4>
                    <div className="grid grid-cols-2 gap-2">
                        {panels.map((panel, index) => (
                            <div key={index} className="border border-slate-700 rounded overflow-hidden">
                                <img src={panel.dataUrl} alt={panel.name} className="w-full h-full object-cover" />
                                <p className="text-xs bg-slate-800 p-1 text-center font-semibold">{panel.name}</p>
                            </div>
                        ))}
                    </div>
                    <button 
                        onClick={handleGenerateMap} 
                        disabled={isProcessing}
                        className="w-full mt-4 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded flex items-center justify-center gap-2"
                    >
                        {isProcessing ? <Icon name="loader" size={16} className="animate-spin" /> : <Icon name="check" size={16} />}
                        Generate 3D Map
                    </button>
                </div>
            )}
        </div>
    );
}

export default MapGenerator;
