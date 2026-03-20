import React, { createContext, useContext, useEffect, useState } from 'react';
import { firestore } from '../firebase'; // Assuming you have this configured
import { doc, onSnapshot, updateDoc, arrayUnion, deleteField, serverTimestamp } from 'firebase/firestore';

const CampaignContext = createContext(null);

export const useCampaign = () => {
  return useContext(CampaignContext);
};

export const CampaignProvider = ({ campaignId, children }) => {
  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!campaignId) {
      setCampaign(null);
      setLoading(false);
      return;
    }

    const campaignRef = doc(firestore, 'campaigns', campaignId);

    const unsubscribe = onSnapshot(campaignRef, (doc) => {
      if (doc.exists()) {
        setCampaign({ id: doc.id, ...doc.data() });
      } else {
        console.error(`Campaign with id ${campaignId} not found.`);
        setCampaign(null);
      }
      setLoading(false);
    });

    // TODO: Add snapshot listeners for subcollections (maps, characters)

    return () => unsubscribe();
  }, [campaignId]);

  const updateTokenPosition = async (tokenId, x, y) => {
    const campaignRef = doc(firestore, 'campaigns', campaignId);
    await updateDoc(campaignRef, {
      [`activeMap.tokens.${tokenId}.x`]: x,
      [`activeMap.tokens.${tokenId}.y`]: y,
    });
  };

  const createWall = async (wall) => {
    const campaignRef = doc(firestore, 'campaigns', campaignId);
    await updateDoc(campaignRef, {
      'activeMap.walls': arrayUnion(wall),
    });
  };

  const deleteToken = async (tokenId) => {
    const campaignRef = doc(firestore, 'campaigns', campaignId);
    await updateDoc(campaignRef, {
      [`activeMap.tokens.${tokenId}`]: deleteField(),
    });
  };

  const toggleTokenVisibility = async (tokenId) => {
    const campaignRef = doc(firestore, 'campaigns', campaignId);
    const token = campaign.activeMap.tokens[tokenId];
    await updateDoc(campaignRef, {
      [`activeMap.tokens.${tokenId}.isVisible`]: !token.isVisible,
    });
  };

  const createPing = async (x, y) => {
    const campaignRef = doc(firestore, 'campaigns', campaignId);
    await updateDoc(campaignRef, {
      'activeMap.pings': arrayUnion({ x, y, timestamp: serverTimestamp() }),
    });
  };

  const value = {
    campaign,
    loading,
    updateTokenPosition,
    createWall,
    deleteToken,
    toggleTokenVisibility,
    createPing,
  };

  return (
    <CampaignContext.Provider value={value}>
      {children}
    </CampaignContext.Provider>
  );
};
