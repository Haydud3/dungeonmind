import React from 'react';
import MapBoard from './MapBoard';

const WorldView = ({ data, role, updateMapState, updateCloud, user, apiKey, onDiceRoll, savePlayer }) => {
    return (
        <div className="h-full w-full">
            <MapBoard 
                data={data} 
                role={role} 
                updateMapState={updateMapState} 
                updateCloud={updateCloud} 
                user={user} 
                apiKey={apiKey}
                onDiceRoll={onDiceRoll} 
                savePlayer={savePlayer} // Pass this down
            />
        </div>
    );
};

export default WorldView;