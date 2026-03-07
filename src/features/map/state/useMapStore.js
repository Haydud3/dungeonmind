import { create } from 'zustand';

export const useMapStore = create((set, get) => ({
  // ========================================================
  // State
  // ========================================================

  // Raw data from the campaign
  mapData: {
    tokens: [],
    walls: [],
    lights: [],
    url: null,
    name: "No map",
    grid: { size: 50, offsetX: 0, offsetY: 0, visible: true, snap: true, nameplates: true },
    visionActive: true,
  },
  
  // Viewport state
  view: { x: 0, y: 0, scale: 1 },
  
  // Map asset and loading state
  mapReady: false,
  mapDimensions: { width: 0, height: 0 },
  
  // Interaction state
  activeTool: 'move',
  selectedTokenId: null,
  movingTokenId: null,
  isPanning: false,

  // ========================================================
  // Actions
  // ========================================================

  // Initializer
  loadMapData: (data) => set({ mapData: data || get().mapData }),

  // Viewport Actions
  setView: (view) => set({ view }),
  pan: (delta) => set((state) => ({ view: { ...state.view, x: state.view.x + delta.x, y: state.view.y + delta.y } })),
  zoom: (factor, center) => set((state) => {
    const newScale = Math.min(Math.max(0.1, state.view.scale * factor), 5.0);
    const worldX = (center.x - state.view.x) / state.view.scale;
    const worldY = (center.y - state.view.y) / state.view.scale;
    const newX = center.x - (worldX * newScale);
    const newY = center.y - (worldY * newScale);
    return { view: { x: newX, y: newY, scale: newScale } };
  }),

  // Asset Actions
  setMapReady: (isReady) => set({ mapReady: isReady }),
  setMapDimensions: (dimensions) => set({ mapDimensions: dimensions }),

  // Interaction Actions
  setActiveTool: (tool) => set({ activeTool: tool }),
  setSelectedTokenId: (id) => set({ selectedTokenId: id }),
  setMovingTokenId: (id) => set({ movingTokenId: id }),
  setIsPanning: (panning) => set({ isPanning: panning }),

  // Data update actions (will be called by campaign context updates)
  setTokens: (tokens) => set((state) => ({ mapData: { ...state.mapData, tokens } })),
  setWalls: (walls) => set((state) => ({ mapData: { ...state.mapData, walls } })),
  setLights: (lights) => set((state) => ({ mapData: { ...state.mapData, lights } })),

}));
