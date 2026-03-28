import React from 'react';
import SheetContainer from './character-sheet/SheetContainer';
import { useCharacterStore } from '../stores/useCharacterStore';
import { useNewCampaign } from '../contexts/NewCampaignProvider';

const SideSheet = ({ characterId, onClose, role, onDiceRoll }) => {
    const { campaign: data, user, updateCampaign } = useNewCampaign();
    
    const isOwner = data.players?.some(p => String(p.id) === String(characterId) && p.ownerId === user?.uid);
    const addLogEntry = useCharacterStore((state) => state.addLogEntry);

    const handleSave = (char) => {
        const isPc = data.players?.some(p => String(p.id) === String(char.id));
        if (isPc) {
            const newPlayers = data.players.map(p => p.id === char.id ? char : p);
            updateCampaign({ players: newPlayers });
        } else {
            const newNpcs = (data.npcs || []).map(n => String(n.id) === String(char.id) ? char : n);
            updateCampaign({ npcs: newNpcs });
        }
    };

    return (
        <div className="absolute top-0 right-0 bottom-0 w-[550px] bg-slate-900 border-l border-slate-700 shadow-2xl z-[80] flex flex-col animate-in slide-in-from-right duration-300">
            <SheetContainer 
                characterId={characterId}
                data={data}
                onClose={onClose}
                onBack={onClose}
                onSave={handleSave}
                role={role}
                onDiceRoll={onDiceRoll}
                onLogAction={(msg) => addLogEntry({ message: msg, id: Date.now() })}
                isOwner={isOwner}
            />
        </div>
    );
};

export default SideSheet;
