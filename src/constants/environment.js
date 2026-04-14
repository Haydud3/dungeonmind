export const ENV_SETTINGS = {
    day: {
        ambient: { color: '#ffffff', intensity: 0.8 },
        dir: { color: '#fffaed', intensity: 1.5, position: [0, 15, 20] },
        bg: '#1a1a2e',
        fog: null
    },
    night: {
        ambient: { color: '#4a4a65', intensity: 0.15 },
        dir: { color: '#a0a0ff', intensity: 0.3, position: [0, 10, 15] },
        bg: '#050510',
        fog: null
    },
    sunset: {
        ambient: { color: '#ffb380', intensity: 0.4 },
        dir: { color: '#ff7b00', intensity: 1.2, position: [-10, 5, 20] },
        bg: '#2d1b19',
        fog: { color: '#ffb380', near: 15, far: 60 }
    },
    fog: {
        ambient: { color: '#888899', intensity: 0.5 },
        dir: { color: '#aaaaaa', intensity: 0.5, position: [0, 10, 15] },
        bg: '#888899',
        fog: { color: '#888899', near: 5, far: 30 }
    },
    rain: {
        ambient: { color: '#555566', intensity: 0.4 },
        dir: { color: '#777788', intensity: 0.6, position: [0, 15, 20] },
        bg: '#1a1a22',
        fog: { color: '#555566', near: 10, far: 45 }
    }
};
