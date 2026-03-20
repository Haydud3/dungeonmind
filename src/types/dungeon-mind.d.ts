export interface Campaign {
  id: string;
  name: string;
  hostId: string;
  activeMapId: string | null;
}

export interface MapData {
  id:string;
  name: string;
  url: string; // URL for the map image
  grid: {
    size: number; // pixels per grid cell
    visible: boolean;
  };
  walls: Wall[];
  tokens: Token[];
}

export interface Token {
  id: string;
  characterId: string;
  x: number; // position in pixels
  y: number; // position in pixels
  image: string;
  name: string;
  size: number; // 1 for medium, 2 for large, etc.
  isVisible: boolean;
  controlledBy: string[]; // Array of user UIDs
}

export interface Wall {
  id: string;
  p1: { x: number, y: number };
  p2: { x: number, y: number };
  isDoor: boolean;
  isOpen: boolean;
}
