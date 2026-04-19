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
        fog: null,
        effects: {
            colorGrading: { brightness: -0.1, contrast: 0.1, saturation: -0.2 }
        }
    },
    sunset: {
        ambient: { color: '#ffb380', intensity: 0.4 },
        dir: { color: '#ff7b00', intensity: 1.2, position: [-10, 5, 20] },
        bg: '#2d1b19',
        fog: { color: '#ffb380', near: 15, far: 60 },
        effects: {
            bloom: { intensity: 0.5, luminanceThreshold: 0.4 },
            colorGrading: { saturation: 0.2, brightness: 0.05 }
        }
    },
    fog: {
        ambient: { color: '#888899', intensity: 0.5 },
        dir: { color: '#aaaaaa', intensity: 0.5, position: [0, 10, 15] },
        bg: '#888899',
        fog: { color: '#888899', near: 5, far: 30 },
        effects: {
            colorGrading: { saturation: -0.3, contrast: -0.1 }
        }
    },
    rain: {
        ambient: { color: '#555566', intensity: 0.4 },
        dir: { color: '#777788', intensity: 0.6, position: [0, 15, 20] },
        bg: '#1a1a22',
        fog: { color: '#555566', near: 10, far: 45 },
        particles: 'rain',
        effects: {
            colorGrading: { saturation: -0.2, brightness: -0.05 }
        }
    },
    snow: {
        ambient: { color: '#e0e5ff', intensity: 0.7 },
        dir: { color: '#ffffff', intensity: 1.0, position: [0, 15, 20] },
        bg: '#d0d5e0',
        fog: { color: '#d0d5e0', near: 5, far: 40 },
        particles: 'snow',
        effects: {
            bloom: { intensity: 0.3, luminanceThreshold: 0.7 },
            colorGrading: { saturation: -0.1, brightness: 0.1 }
        }
    },
    ash: {
        ambient: { color: '#403030', intensity: 0.5 },
        dir: { color: '#ff6644', intensity: 0.8, position: [10, 5, 10] },
        bg: '#221111',
        fog: { color: '#221111', near: 10, far: 35 },
        particles: 'ash',
        effects: {
            bloom: { intensity: 0.4, luminanceThreshold: 0.5 },
            colorGrading: { saturation: -0.1, contrast: 0.1, hue: -0.1 }
        }
    },
    spores: {
        ambient: { color: '#204030', intensity: 0.4 },
        dir: { color: '#44ffaa', intensity: 0.6, position: [-5, 10, 15] },
        bg: '#0a1510',
        fog: { color: '#0a1510', near: 15, far: 50 },
        particles: 'spores',
        effects: {
            bloom: { intensity: 1.5, luminanceThreshold: 0.2 },
            colorGrading: { saturation: 0.3, contrast: 0.1 }
        }
    },
    swamp: {
        ambient: { color: '#334433', intensity: 0.4 },
        dir: { color: '#aaccaa', intensity: 0.5, position: [0, 15, 20] },
        bg: '#1a221a',
        fog: { color: '#334433', near: 10, far: 30 },
        effects: {
            colorGrading: { brightness: -0.1, contrast: 0.1, saturation: -0.4 }
        }
    }
};
