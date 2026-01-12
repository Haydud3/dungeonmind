import React from 'react';
import MapBoard from './MapBoard';

const WorldView = ({ data, role, updateMapState, updateCloud, user, apiKey, onDiceRoll }) => {
    return (
        <div className="h-full w-full">
            <MapBoard 
                data={data} 
                role={role} 
                updateMapState={updateMapState} 
                updateCloud={updateCloud} 
                user={user} 
                apiKey={apiKey}
                onDiceRoll={onDiceRoll} // PASS IT DOWN
            />
        </div>
    );
};

export default WorldView;