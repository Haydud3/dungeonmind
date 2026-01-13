import React from 'react';
import MapBoard from './MapBoard';

const WorldView = ({ data, role, updateMapState, updateCloud, user, apiKey, onDiceRoll, savePlayer }) => {
    return (
        // FIX: Changed from "h-full w-full" to "absolute inset-0"
        // This forces the VTT to fill the parent container on mobile devices
        // preventing the "Blank Screen" / 0-height issue.
        <div className="absolute inset-0 w-full h-full bg-slate-900">
            <MapBoard 
                data={data} 
                role={role} 
                updateMapState={updateMapState} 
                updateCloud={updateCloud} 
                user={user} 
                apiKey={apiKey}
                onDiceRoll={onDiceRoll} 
                savePlayer={savePlayer} 
            />
        </div>
    );
};

export default WorldView;