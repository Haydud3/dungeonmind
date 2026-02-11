import { create } from 'zustand';

export const useExtensionStore = create((set) => ({
    hasExtension: false,
    isMobile: /iPhone|iPad|iPod|Android/i.test(navigator.userAgent),
    // User preference to use Iframe vs Native Sheet
    portalEnabled: localStorage.getItem('dm_portal_active') === 'true',
    
    setHasExtension: (val) => set({ hasExtension: val }),
    setPortalEnabled: (val) => {
        localStorage.setItem('dm_portal_active', val);
        set({ portalEnabled: val });
    }
}));