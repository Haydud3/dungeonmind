import React, { useState } from 'react';
import Icon from '../Icon';
import { parseDndBeyondJson } from './dndBeyondParser';
import { enrichCharacter } from '../../utils/srdEnricher';

const DndBeyondImporter = ({ onImport, onCancel }) => {
    const [mode, setMode] = useState('url'); // 'url' or 'json'
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleImport = async () => {
        setIsLoading(true);
        setError(null);
        let characterData = null;

        try {
            if (mode === 'url') {
                const idMatch = inputValue.match(/\/characters\/(\d+)|^\d+$/);
                const characterId = idMatch ? (idMatch[1] || idMatch[0]) : inputValue.replace(/\D/g, '');

                if (!characterId) {
                    throw new Error("Invalid D&D Beyond URL or Character ID.");
                }

                const encodedUrl = encodeURIComponent(`https://character-service.dndbeyond.com/character/v5/character/${characterId}`);
                let response = await fetch(`https://corsproxy.io/?url=${encodedUrl}`).catch(() => null);

                if (!response || !response.ok) {
                    response = await fetch(`https://api.allorigins.win/raw?url=${encodedUrl}`).catch(() => null);
                }

                if (!response || !response.ok) {
                    throw new Error("Failed to fetch character. Make sure the sheet is public, or try Manual JSON mode.");
                }

                characterData = await response.json();
            } else {
                characterData = JSON.parse(inputValue);
            }

            // Parse using the local schema translator
            const parsedChar = parseDndBeyondJson(characterData);
            
            // Add Spells, Descriptions, and SRD info
            const enrichedChar = await enrichCharacter(parsedChar);
            
            await onImport(enrichedChar);
        } catch (err) {
            console.error(err);
            setError(err.message || "Failed to parse character data. Please check your input.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden relative">
            <div className="flex items-center justify-between p-4 border-b border-slate-700 bg-slate-800">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Icon name="download" className="text-blue-400" />
                    Import from D&D Beyond
                </h2>
                <button onClick={onCancel} className="text-slate-400 hover:text-white transition-colors">
                    <Icon name="x" size={20} />
                </button>
            </div>

            <div className="p-6 space-y-6">
                <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-700">
                    <button className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-bold rounded-md transition-colors ${mode === 'url' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`} onClick={() => setMode('url')}>
                        <Icon name="link" size={16} /> URL Link
                    </button>
                    <button className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-bold rounded-md transition-colors ${mode === 'json' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`} onClick={() => setMode('json')}>
                        <Icon name="file-json" size={16} /> Manual JSON
                    </button>
                </div>

                <div>
                    {mode === 'url' ? (
                        <div className="space-y-2">
                            <label className="text-xs uppercase font-bold text-slate-500">D&D Beyond Character URL</label>
                            <input type="text" placeholder="https://www.dndbeyond.com/characters/12345678" className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500" value={inputValue} onChange={(e) => setInputValue(e.target.value)} />
                            <p className="text-xs text-slate-500">Make sure your character sheet is set to "Public" on D&D Beyond.</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <label className="text-xs uppercase font-bold text-slate-500">Paste Character JSON</label>
                            <textarea placeholder='{"id": 12345678, "name": "...", ...}' className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white h-32 font-mono text-xs focus:outline-none focus:border-blue-500 resize-none" value={inputValue} onChange={(e) => setInputValue(e.target.value)} />
                            <p className="text-xs text-slate-500">Use this fallback if Cloudflare blocks the URL import. Add `/json` to the end of your DDB URL to get the raw JSON.</p>
                        </div>
                    )}
                </div>

                {error && <div className="bg-red-900/30 border border-red-800 text-red-400 p-3 rounded-lg text-sm font-medium flex gap-2"><Icon name="alert-triangle" size={18} className="shrink-0" /><span>{error}</span></div>}
            </div>

            <div className="p-4 border-t border-slate-700 bg-slate-800 flex justify-end gap-3">
                <button onClick={onCancel} className="px-4 py-2 text-sm font-bold text-slate-400 hover:text-white transition-colors">Cancel</button>
                <button onClick={handleImport} disabled={isLoading || !inputValue.trim()} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-colors flex items-center gap-2 shadow-lg">
                    {isLoading ? <Icon name="loader-2" size={16} className="animate-spin" /> : <Icon name="download" size={16} />}
                    {isLoading ? 'Importing...' : 'Import Character'}
                </button>
            </div>
        </div>
    );
};
export default DndBeyondImporter;