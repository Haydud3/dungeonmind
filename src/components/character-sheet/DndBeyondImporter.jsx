import React, { useState } from 'react';
import { parseDndBeyondJson } from './dndBeyondParser';
import Icon from '../Icon';

const DndBeyondImporter = ({ onComplete, onCancel }) => {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleImport = async () => {
    const characterId = url.match(/\/characters\/(\d+)/)?.[1];
    if (!characterId) {
      setError('Invalid D&D Beyond URL. Please use the format: https://www.dndbeyond.com/characters/123456');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // NOTE: We are using a proxy configured in `vite.config.js` to bypass CORS.
      // The request is sent to our local server and forwarded to D&D Beyond.
      const response = await fetch(`/dndbeyond-api/character/v5/character/${characterId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch character (Status: ${response.status}). Is the sheet public and the URL correct?`);
      }
      const jsonData = await response.json();
      console.log("Raw D&D Beyond JSON Data:", jsonData); // Debugging: Log raw JSON
      const parsedData = parseDndBeyondJson(jsonData);
      console.log("Parsed Character Data:", parsedData); // Debugging: Log parsed data
      
      onComplete(parsedData);

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
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

        <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-700 text-xs text-slate-400 space-y-1 mb-4">
            <p className="font-bold text-slate-300">Instructions:</p>
            <p>1. Go to your character sheet on D&D Beyond.</p>
            <p>2. Click your character's name to open the sidebar.</p>
            <p>3. Under 'Description', change Privacy from 'Private' to 'Public'.</p>
            <p>4. Copy the URL and paste it below.</p>
        </div>

        <div className="space-y-4">
            <input 
                className="w-full bg-slate-900 border border-slate-700 rounded p-3 text-white text-sm focus:border-red-500 outline-none" 
                value={url} 
                onChange={e => setUrl(e.target.value)} 
                placeholder="https://www.dndbeyond.com/characters/123456789"
            />
            {error && <p className="text-xs text-red-400 bg-red-900/20 p-2 rounded border border-red-500/30">{error}</p>}
            <button onClick={handleImport} disabled={loading || !url} className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                {loading ? (
                    <><Icon name="loader-2" className="animate-spin"/> Importing...</>
                ) : (
                    <><Icon name="import"/> Import Character</>
                )}
            </button>
        </div>
    </div>
  );
};

export default DndBeyondImporter;