import React, { useState } from 'react';
import Icon from '../Icon';
import { parseDndBeyondJson } from './dndBeyondParser';
import { enrichCharacter } from '../../utils/srdEnricher';
import { fetchDndBeyondCharacter } from '../../utils/dndBeyondService';

const DndBeyondImporter = ({ onImport, onCancel }) => {
    const [mode, setMode] = useState('url'); // 'url' or 'json'
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [failedCharId, setFailedCharId] = useState(null);
    const [copiedUrl, setCopiedUrl] = useState(false);

    const handleImport = async () => {
        setIsLoading(true);
        setError(null);
        setFailedCharId(null);
        let characterData = null;

        try {
            if (mode === 'url') {
                characterData = await fetchDndBeyondCharacter(inputValue);
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
            if (mode === 'url') {
                const idMatch = inputValue.match(/\/characters\/(\d+)|^\d+$/);
                const charId = idMatch ? (idMatch[1] || idMatch[0]) : inputValue.replace(/\D/g, '');
                if (charId) setFailedCharId(charId);
            }
        } finally {
            setIsLoading(false);
        }
    };

    const copyRawServiceUrl = () => {
        const id = failedCharId || 'YOUR_CHARACTER_ID';
        navigator.clipboard.writeText(`https://character-service.dndbeyond.com/character/v5/character/${id}`);
        setCopiedUrl(true);
        setTimeout(() => setCopiedUrl(false), 2000);
    };

    return (
        <div className="bg-slate-900/95 border border-amber-500/30 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.8)] w-full max-w-lg overflow-hidden relative backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200">
            {/* Header with Arcane/Amber Ambient Glow */}
            <div className="relative p-5 sm:p-6 border-b border-amber-500/20 bg-gradient-to-r from-amber-950/60 via-slate-900 to-indigo-950/60 flex items-center justify-between overflow-hidden">
                <div className="absolute -top-12 -left-12 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
                <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

                <div className="flex items-center gap-3.5 relative z-10">
                    <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner ring-1 ring-amber-500/20 shrink-0">
                        <Icon name="download" size={22} />
                    </div>
                    <div>
                        <h2 className="text-lg sm:text-xl font-black text-white fantasy-font tracking-wide">
                            Import from D&D Beyond
                        </h2>
                        <p className="text-xs text-slate-400 mt-0.5">
                            Port your character sheet, stats, spells & inventory
                        </p>
                    </div>
                </div>
                <button 
                    onClick={onCancel} 
                    className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800/80 transition-colors relative z-10"
                    title="Close"
                >
                    <Icon name="x" size={20} />
                </button>
            </div>

            <div className="p-5 sm:p-6 space-y-5">
                {/* Mode Segmented Controls */}
                <div className="flex bg-slate-950/80 rounded-xl p-1 border border-slate-800 shadow-inner">
                    <button 
                        className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 text-xs sm:text-sm font-bold rounded-lg transition-all ${
                            mode === 'url' 
                                ? 'bg-gradient-to-r from-amber-600 to-amber-500 text-slate-950 shadow-md shadow-amber-950/40' 
                                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                        }`} 
                        onClick={() => { setMode('url'); setError(null); }}
                    >
                        <Icon name="link" size={15} /> URL Link
                    </button>
                    <button 
                        className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 text-xs sm:text-sm font-bold rounded-lg transition-all ${
                            mode === 'json' 
                                ? 'bg-gradient-to-r from-amber-600 to-amber-500 text-slate-950 shadow-md shadow-amber-950/40' 
                                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                        }`} 
                        onClick={() => { setMode('json'); setError(null); }}
                    >
                        <Icon name="file-json" size={15} /> Manual JSON
                    </button>
                </div>

                {/* Input Fields */}
                <div>
                    {mode === 'url' ? (
                        <div className="space-y-3">
                            <label className="text-[11px] font-bold uppercase tracking-wider text-amber-400/90 flex items-center gap-1.5">
                                <Icon name="compass" size={13} className="text-amber-400" />
                                Character Sheet URL or ID
                            </label>
                            <div className="relative">
                                <input 
                                    type="text" 
                                    autoFocus
                                    placeholder="https://www.dndbeyond.com/characters/12345678" 
                                    className="w-full bg-slate-950/90 border border-slate-700/80 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition-all shadow-inner" 
                                    value={inputValue} 
                                    onChange={(e) => setInputValue(e.target.value)} 
                                    onKeyDown={(e) => e.key === 'Enter' && inputValue.trim() && !isLoading && handleImport()}
                                />
                                {inputValue && (
                                    <button
                                        type="button"
                                        onClick={() => setInputValue('')}
                                        className="absolute right-3 top-3 text-slate-500 hover:text-slate-300 transition-colors"
                                    >
                                        <Icon name="x" size={16} />
                                    </button>
                                )}
                            </div>

                            <div className="space-y-2">
                                <p className="text-xs text-slate-400 flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                                    Ensure your character privacy is set to <span className="text-amber-300 font-semibold">"Public"</span> on D&D Beyond.
                                </p>
                                
                                <details className="text-xs text-slate-400 group bg-slate-950/50 border border-slate-800 rounded-xl overflow-hidden transition-all">
                                    <summary className="cursor-pointer hover:text-amber-300 p-3 select-none outline-none flex items-center justify-between font-medium">
                                        <span className="flex items-center gap-1.5">
                                            <Icon name="help-circle" size={14} className="text-amber-400/80" />
                                            How do I set my character sheet to Public?
                                        </span>
                                        <Icon name="chevron-down" size={14} className="text-slate-500 group-open:rotate-180 transition-transform" />
                                    </summary>
                                    <div className="px-3.5 pb-3.5 pt-1 text-slate-300 space-y-1.5 border-t border-slate-800/80 leading-relaxed text-[11px]">
                                        <div className="flex items-start gap-2">
                                            <span className="w-4 h-4 rounded-full bg-slate-800 text-amber-400 font-bold flex items-center justify-center shrink-0 text-[10px]">1</span>
                                            <span>Open your character sheet on D&D Beyond.</span>
                                        </div>
                                        <div className="flex items-start gap-2">
                                            <span className="w-4 h-4 rounded-full bg-slate-800 text-amber-400 font-bold flex items-center justify-center shrink-0 text-[10px]">2</span>
                                            <span>Click your character's name at the top left to open the drawer.</span>
                                        </div>
                                        <div className="flex items-start gap-2">
                                            <span className="w-4 h-4 rounded-full bg-slate-800 text-amber-400 font-bold flex items-center justify-center shrink-0 text-[10px]">3</span>
                                            <span>Select <strong>"Character Settings"</strong>.</span>
                                        </div>
                                        <div className="flex items-start gap-2">
                                            <span className="w-4 h-4 rounded-full bg-slate-800 text-amber-400 font-bold flex items-center justify-center shrink-0 text-[10px]">4</span>
                                            <span>Under <strong>"Character Privacy"</strong>, select <strong>"Public"</strong>.</span>
                                        </div>
                                    </div>
                                </details>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <label className="text-[11px] font-bold uppercase tracking-wider text-amber-400/90 flex items-center gap-1.5">
                                    <Icon name="file-json" size={13} className="text-amber-400" />
                                    Paste Character JSON
                                </label>
                                <button
                                    type="button"
                                    onClick={copyRawServiceUrl}
                                    className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-1 transition-colors"
                                >
                                    <Icon name={copiedUrl ? "check" : "copy"} size={11} />
                                    {copiedUrl ? "Service URL Copied" : "Copy Service Link"}
                                </button>
                            </div>
                            <textarea 
                                autoFocus
                                placeholder='{"id": 12345678, "name": "...", "classes": [...], ...}' 
                                className="w-full bg-slate-950/90 border border-slate-700/80 rounded-xl p-3.5 text-white h-36 font-mono text-xs placeholder-slate-600 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 resize-none shadow-inner custom-scroll" 
                                value={inputValue} 
                                onChange={(e) => setInputValue(e.target.value)} 
                            />
                            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl text-xs text-slate-400 space-y-1.5">
                                <p className="leading-relaxed">
                                    Bypass D&D Beyond API rate limits or Cloudflare challenges by copying your character's raw JSON from:
                                </p>
                                <code className="text-amber-300 bg-slate-900 border border-amber-500/20 px-2.5 py-1.5 rounded-lg block break-all select-all font-mono text-[11px]">
                                    https://character-service.dndbeyond.com/character/v5/character/{failedCharId || 'YOUR_CHARACTER_ID'}
                                </code>
                            </div>
                        </div>
                    )}
                </div>

                {/* Error Banner with Guided Fallback */}
                {error && (
                    <div className="bg-red-950/40 border border-red-500/40 p-4 rounded-xl text-sm flex flex-col gap-3 shadow-inner animate-in fade-in duration-200">
                        <div className="flex items-start gap-2.5 text-red-300">
                            <Icon name="alert-triangle" size={18} className="shrink-0 text-red-400 mt-0.5" />
                            <div className="leading-relaxed text-xs">
                                <span className="font-bold text-red-200">Import Unsuccessful: </span>
                                {error}
                            </div>
                        </div>

                        {failedCharId && mode === 'url' && (
                            <div className="bg-slate-950/80 p-3.5 rounded-xl border border-red-900/40 flex flex-col gap-2.5 mt-1">
                                <p className="text-xs text-amber-200 font-bold flex items-center gap-1.5">
                                    <Icon name="shield-alert" size={14} className="text-amber-400" />
                                    D&D Beyond is blocking direct scrying. Manual import:
                                </p>
                                <ol className="text-xs text-slate-300 list-decimal list-inside space-y-1 leading-relaxed pl-1">
                                    <li>Click below to view your character's raw JSON in a new tab.</li>
                                    <li>Select all text (<kbd className="bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded text-[10px] text-amber-300">Ctrl+A</kbd> / <kbd className="bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded text-[10px] text-amber-300">Cmd+A</kbd>) and copy it.</li>
                                    <li>Switch to "Manual JSON" mode and paste it here.</li>
                                </ol>
                                <div className="flex flex-wrap gap-2 pt-1">
                                    <a 
                                        href={`https://character-service.dndbeyond.com/character/v5/character/${failedCharId}`} 
                                        target="_blank" 
                                        rel="noopener noreferrer" 
                                        className="bg-amber-600/30 hover:bg-amber-600/40 border border-amber-500/50 text-amber-200 px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow"
                                    >
                                        <Icon name="external-link" size={13} /> Open Raw Data
                                    </a>
                                    <button 
                                        type="button"
                                        onClick={() => { setMode('json'); setInputValue(''); setError(null); }} 
                                        className="bg-indigo-600/30 hover:bg-indigo-600/40 border border-indigo-500/50 text-indigo-200 px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow"
                                    >
                                        <Icon name="file-json" size={13} /> Switch to JSON Mode
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Modal Actions Footer */}
            <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950/90 flex items-center justify-end gap-3">
                <button 
                    type="button"
                    onClick={onCancel} 
                    className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-400 hover:text-white rounded-xl hover:bg-slate-800/60 transition-colors"
                >
                    Cancel
                </button>
                <button 
                    type="button"
                    onClick={handleImport} 
                    disabled={isLoading || !inputValue.trim()} 
                    className="px-6 py-2.5 bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 hover:from-amber-500 hover:to-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-black text-xs sm:text-sm rounded-xl shadow-lg shadow-amber-950/40 transition-all flex items-center gap-2 transform hover:-translate-y-0.5 active:translate-y-0"
                >
                    {isLoading ? <Icon name="loader-2" size={16} className="animate-spin text-slate-950" /> : <Icon name="download" size={16} className="text-slate-950" />}
                    <span>{isLoading ? 'Importing Character...' : 'Import Character'}</span>
                </button>
            </div>
        </div>
    );
};

export default DndBeyondImporter;