import React, { useState } from 'react';
import { parseDndBeyondJson } from './dndBeyondParser';

// This is a placeholder for your actual character sheet display component
const CharacterSheetDisplay = ({ sheetData }) => (
  <pre>{JSON.stringify(sheetData, null, 2)}</pre>
);

function SheetContainer() {
  const [url, setUrl] = useState('');
  const [characterSheet, setCharacterSheet] = useState(null);
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
    setCharacterSheet(null);

    try {
      const response = await fetch(`https://character-service.dndbeyond.com/character/v5/character/${characterId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch character. Is the sheet public?');
      }
      const jsonData = await response.json();
      const parsedData = parseDndBeyondJson(jsonData);
      setCharacterSheet(parsedData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* UI elements from Phase 1 would go here */}
      <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="D&D Beyond URL" />
      <button onClick={handleImport} disabled={loading}>{loading ? 'Importing...' : 'Import'}</button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {characterSheet && <CharacterSheetDisplay sheetData={characterSheet} />}
    </div>
  );
}

export default SheetContainer;