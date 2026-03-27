import React, { useState, useEffect, useContext } from 'react';
import NewCampaignContext from './NewCampaignContext';
import { useCampaign } from './CampaignProvider'; // For getting the campaign code
import * as fb from '../firebase';
import { NEW_CAMPAIGN_STRUCTURE } from '../types/campaign';

const NewCampaignProvider = ({ children }) => {
    const { gameParams, user } = useCampaign();
    const [campaignData, setCampaignData] = useState(NEW_CAMPAIGN_STRUCTURE);
    const [isConnected, setIsConnected] = useState(true);

    useEffect(() => {
        if (!gameParams || gameParams.isOffline || !user) {
            return;
        }

        const campaignRef = fb.doc(fb.db, 'artifacts', fb.appId || 'dungeonmind', 'public', 'data', 'campaigns', gameParams.code);

        const unsubscribe = fb.onSnapshot(campaignRef, (doc) => {
            if (doc.exists()) {
                const data = doc.data();
                // Here you would perform a migration from the old data structure to the new one.
                // For now, we'll just set the data as is.
                setCampaignData(data);
                setIsConnected(!doc.metadata.fromCache);
            } else {
                // Handle case where campaign doesn't exist
                if (gameParams.role === 'dm') {
                    fb.setDoc(campaignRef, {
                        ...NEW_CAMPAIGN_STRUCTURE,
                        hostId: user.uid,
                        dmIds: [user.uid],
                        campaignInfo: {
                            ...NEW_CAMPAIGN_STRUCTURE.campaignInfo,
                            name: `${user.displayName}'s Campaign`,
                        }
                    });
                }
            }
        });

        return () => unsubscribe();
    }, [gameParams, user]);

    const value = {
        campaignData,
        isConnected,
    };

    return (
        <NewCampaignContext.Provider value={value}>
            {children}
        </NewCampaignContext.Provider>
    );
};

export const useNewCampaign = () => {
    const context = useContext(NewCampaignContext);
    if (!context) {
        throw new Error('useNewCampaign must be used within a NewCampaignProvider');
    }
    return context;
}

export default NewCampaignProvider;
