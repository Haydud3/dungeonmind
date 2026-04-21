import React, { useState } from 'react';
import { parseDndBeyondJson } from './dndBeyondParser';
import Icon from '../Icon';

const DndBeyondImporter = ({ onImport, onCancel }) => {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('url'); // 'url' or 'json'

  const handleImportUrl = async () => {
    const characterId = input.match(/\/characters\/(\d+)/)?.[1] || input.match(/^\d+$/)?.[0];
    if (!characterId) {
      setError('Invalid D&D Beyond URL. Please use the format: https://www.dndbeyond.com/characters/123456');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const encodedUrl = encodeURIComponent(`https://character-service.dndbeyond.com/character/v5/character/${characterId}`);
      let response = await fetch(`https://corsproxy.io/?url=${encodedUrl}`).catch(() => null);
      
      if (!response || !response.ok) {
          response = await fetch(`https://api.allorigins.win/raw?url=${encodedUrl}`).catch(() => null);
      }

      if (!response || !response.ok) {
        throw new Error(`Failed to fetch character. D&D Beyond's security might be blocking the request. Please use the "Manual JSON Paste" tab instead.`);
      }
      const jsonData = await response.json();
      console.log("Raw D&D Beyond JSON Data:", jsonData);
      const parsedData = parseDndBeyondJson(jsonData);
      console.log("Parsed Character Data:", parsedData);
      onImport(parsedData);

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleImportJson = () => {
      try {
          const jsonData = JSON.parse(input);
          const parsedData = parseDndBeyondJson(jsonData);
          onImport(parsedData);
      } catch (err) {
          setError("Invalid JSON format. Please ensure you copied the entire page content.");
      }
  };

  return (
    <div className="bg-slate-800 p-6 rounded-xl border border-slate-600 shadow-xl animate-in slide-in-from-top-2 w-full max-w-lg">
        <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Icon name="download-cloud" className="text-red-500"/>
                Import from D&D Beyond
            </h3>
            <button onClick={onCancel} className="text-slate-400 hover:text-white"><Icon name="x"/></button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4 border-b border-slate-700 pb-2">
            <button onClick={() => { setActiveTab('url'); setInput(''); setError(''); }} className={`px-4 py-2 rounded text-sm font-bold transition-colors ${activeTab === 'url' ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-white'}`}>Auto URL Import</button>
            <button onClick={() => { setActiveTab('json'); setInput(''); setError(''); }} className={`px-4 py-2 rounded text-sm font-bold transition-colors ${activeTab === 'json' ? 'bg-red-600 text-white' : 'text-slate-400 hover:text-white'}`}>Manual JSON Paste</button>
        </div>

        {activeTab === 'url' ? (
            <>
                <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-700 text-xs text-slate-400 space-y-1 mb-4">
                    <p className="font-bold text-slate-300">Instructions:</p>
                    <p>1. Go to your character sheet on D&D Beyond.</p>
                    <p>2. Under 'Description', change Privacy to 'Public'.</p>
                    <p>3. Copy the URL and paste it below.</p>
                    <p className="text-amber-500 mt-2 font-bold">Note: D&D Beyond frequently blocks automatic imports. If this fails, use the Manual JSON Paste tab.</p>
                </div>
                <div className="space-y-4">
                    <input 
                        className="w-full bg-slate-900 border border-slate-700 rounded p-3 text-white text-sm focus:border-red-500 outline-none" 
                        value={input} 
                        onChange={e => setInput(e.target.value)} 
                        placeholder="https://www.dndbeyond.com/characters/123456789"
                    />
                    {error && <p className="text-xs text-red-400 bg-red-900/20 p-2 rounded border border-red-500/30">{error}</p>}
                    <button onClick={handleImportUrl} disabled={loading || !input} className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                        {loading ? <><Icon name="loader-2" className="animate-spin"/> Importing...</> : <><Icon name="import"/> Import via URL</>}
                    </button>
                </div>
            </>
        ) : (
            <>
                <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-700 text-xs text-slate-400 space-y-1 mb-4">
                    <p className="font-bold text-slate-300">Instructions:</p>
                    <p>1. Open your character sheet on D&D Beyond.</p>
                    <p>2. Add <b>/json</b> to the end of the URL and press Enter. <br/><span className="opacity-70">(e.g. dndbeyond.com/characters/123456/json)</span></p>
                    <p>3. Copy all the text on that page and paste it below.</p>
                </div>
                <div className="space-y-4">
                    <textarea 
                        className="w-full bg-slate-900 border border-slate-700 rounded p-3 text-white text-sm focus:border-red-500 outline-none h-32 resize-none font-mono" 
                        value={input} 
                        onChange={e => setInput(e.target.value)} 
                        placeholder='{&#10;  "id": 123456,&#10;  "character": { ... }&#10;}'
                    />
                    {error && <p className="text-xs text-red-400 bg-red-900/20 p-2 rounded border border-red-500/30">{error}</p>}
                    <button onClick={handleImportJson} disabled={loading || !input} className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                        <Icon name="file-json"/> Import JSON
                    </button>
                </div>
            </>
        )}
    </div>
  );
};

export default DndBeyondImporter;