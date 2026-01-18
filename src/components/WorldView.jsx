import React from 'react';
import MapBoard from './MapBoard';

const WorldView = ({ data, role, updateMapState, updateCloud, user, apiKey, onDiceRoll, savePlayer, activeTemplate, onClearTemplate, onInitiative }) => {
    return (
        /* Fix: Use absolute inset-0 to force full height on mobile/PWA */
        <div className="absolute inset-0 w-full h-full bg-slate-900 overflow-hidden">
             <MapBoard 
                data={data} 
                role={role} 
                updateMapState={updateMapState} 
                updateCloud={updateCloud} 
                user={user} 
                apiKey={apiKey}
                onDiceRoll={onDiceRoll} 
                savePlayer={savePlayer} 
                activeTemplate={activeTemplate}
                onClearTemplate={onClearTemplate}
                onInitiative={onInitiative}
            />
        </div>
    );
};

export default WorldView;