import React, { useState } from 'react';

export const AIPromptGenerator = ({ defaultScene = "" }) => {
    const [scene, setScene] = useState(defaultScene);
    const [copied, setCopied] = useState(false);

    const promptText = `[FORMAT REQUIREMENT]: Generate a unified, single, four-panel composite image on a neutral dark background, presented as a technical 'Multi-Asset Master Sheet' for game development. This sheet must contain four clearly labeled, aligned panels that reference the exact same underlying scene layout, objects, and textures.

[SCENE DESCRIPTION]: ${scene || "The scene is a complex multi-chamber cavern dungeon. It features two main large, carved stone-floored chambers connected by wide steps. The eastern chamber (left) contains a large pit and an ancient carved skull relief wall. The western chamber (right) features standing pillars and rubble. Items include: three canvas tents, many barrels and crates, two split tables, a small wooden boat, scattered broken column segments, and multiple skeletal remains. The overall art style is detailed but cleanly textured digital painting, with complex stone patterns on the floors."}

[SPECIFIC PANEL INSTRUCTIONS]:
Panel 1 (Top-Left): High-Fidelity orthographic Top-Down Map. Full color and texture with standard, flattened, baked lighting as a reference, but very clean.
Panel 2 (Top-Right): Grayscale Precision Depth Map. A strict height field of Panel 1. Pure black must represent the lowest elevation, like the floor of the pit. Pure white must represent the absolute maximum elevation, like the tips of the columns. Intermediate greys define the walls and the slope of the steps. Floor texture details are rendered as subtle displacement noise.
Panel 3 (Bottom-Left): Flattened, Shadowless Albedo (Texture) Map. This map contains the exact color patterns and textures of Panel 1 (the floor stone, the barrel wood) but with all dynamic and harsh 'baked-in' shadows entirely removed. It is viewed under perfectly flat, ambient white light, optimized for projection onto a model.
Panel 4 (Bottom-Right): Clean Axonometric Reconstruction View. An oblique 45-degree, elevated view of the scene from the southeast. This view shows how the albedo texture maps to the depth-generated geometry, serving as a visual reference for object scaling, relationship, and placement.

[CONSISTENCY CLAUSE]: The specific patterns of the floor tiles, the relative positions and damage of every barrel, tent, and pillar must align perfectly across all four panels. If a pillar is broken in one panel, it must be identical in its depth and axonometric panels.`;

    const handleCopy = () => {
        navigator.clipboard.writeText(promptText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="p-4 bg-gray-800 text-white rounded-lg shadow border border-gray-700 max-w-2xl">
            <h3 className="text-xl font-bold mb-2 text-indigo-400">Master Asset Sheet Generator</h3>
            <p className="text-sm text-gray-400 mb-4">
                Describe your scene, then copy the prompt to paste into Midjourney, DALL-E, or Stable Diffusion.
            </p>
            
            <textarea 
                className="w-full h-24 p-2 bg-gray-900 border border-gray-600 rounded text-sm mb-4 text-gray-200"
                placeholder="Describe your scene here..."
                value={scene}
                onChange={(e) => setScene(e.target.value)}
            />

            <div className="relative">
                <textarea 
                    className="w-full h-48 p-3 bg-black border border-indigo-900 rounded text-xs font-mono text-gray-300 mb-4"
                    readOnly
                    value={promptText}
                />
                <button 
                    onClick={handleCopy}
                    className={`absolute bottom-6 right-4 px-4 py-2 rounded font-bold transition-all shadow-lg ${copied ? 'bg-green-500 hover:bg-green-400 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
                >
                    {copied ? '✓ Copied to Clipboard' : '📋 Copy Full Prompt'}
                </button>
            </div>
        </div>
    );
};