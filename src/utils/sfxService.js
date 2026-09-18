// ==========================================
// Procedural Web Audio API SFX Service
// Zero external sound files needed. 100% offline & instant.
// ==========================================

let sfxAudioContext = null;

const getAudioContext = () => {
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return null;
        if (!sfxAudioContext) {
            sfxAudioContext = new AudioContextClass();
        }
        if (sfxAudioContext.state === 'suspended') {
            sfxAudioContext.resume().catch(() => {});
        }
        return sfxAudioContext;
    } catch (e) {
        return null;
    }
};

/**
 * Play procedural dice collision clatter
 */
export const playDiceClatter = (force = false) => {
    if (!force && localStorage.getItem('dm_sfx_dice') === 'false') return;
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
        const now = ctx.currentTime;
        const numClatters = 4 + Math.floor(Math.random() * 3); // 4-6 random clatters

        for (let i = 0; i < numClatters; i++) {
            const impactTime = now + (i * 0.052) + (Math.random() * 0.03);
            const bufferDuration = 0.045;
            const bufferSize = Math.floor(ctx.sampleRate * bufferDuration);
            const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let j = 0; j < bufferSize; j++) {
                data[j] = (Math.random() * 2 - 1) * Math.exp(-j / (bufferSize * 0.25));
            }

            const noiseSource = ctx.createBufferSource();
            noiseSource.buffer = buffer;

            const filter = ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(600 + Math.random() * 1200, impactTime);
            filter.Q.setValueAtTime(4.5, impactTime);

            const gain = ctx.createGain();
            const impactVolume = (0.28 - (i * 0.04)) * (0.8 + Math.random() * 0.4);
            gain.gain.setValueAtTime(Math.max(0.02, impactVolume), impactTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, impactTime + bufferDuration);

            noiseSource.connect(filter);
            filter.connect(gain);
            gain.connect(ctx.destination);

            noiseSource.start(impactTime);
            noiseSource.stop(impactTime + bufferDuration);
        }
    } catch (e) {
        // Safe failover
    }
};

/**
 * Play crystal turn notification chime (for combat turn transitions)
 */
export const playTurnChime = (force = false) => {
    if (!force && localStorage.getItem('dm_sfx_turn') === 'false') return;
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
        const now = ctx.currentTime;
        // Crystal bell chord: E5, G#5, B5 (E-major sparkle)
        const notes = [659.25, 830.61, 987.77, 1318.51];
        notes.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + idx * 0.06);

            gain.gain.setValueAtTime(0.08, now + idx * 0.06);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.06 + 0.8);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(now + idx * 0.06);
            osc.stop(now + idx * 0.06 + 0.85);
        });
    } catch (e) {
        // Safe failover
    }
};

/**
 * Play Critical Hit Fanfare
 */
export const playCritFanfare = (force = false) => {
    if (!force && localStorage.getItem('dm_sfx_dice') === 'false') return;
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
        const now = ctx.currentTime;
        // Ascending brassy triumph arpeggio: C5, E5, G5, C6
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'triangle';
            const noteStart = now + idx * 0.09;
            osc.frequency.setValueAtTime(freq, noteStart);

            const duration = idx === notes.length - 1 ? 0.9 : 0.25;
            gain.gain.setValueAtTime(0.12, noteStart);
            gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + duration);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(noteStart);
            osc.stop(noteStart + duration + 0.05);
        });
    } catch (e) {
        // Safe failover
    }
};

/**
 * Play metallic coin flip ringing
 */
export const playCoinFlip = (force = false) => {
    if (!force && localStorage.getItem('dm_sfx_dice') === 'false') return;
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
        const now = ctx.currentTime;
        const freqs = [2800, 3400, 5600];
        freqs.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now);
            osc.frequency.exponentialRampToValueAtTime(freq * 0.98, now + 1.2);

            const vol = 0.08 / (idx + 1);
            gain.gain.setValueAtTime(vol, now);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(now);
            osc.stop(now + 1.25);
        });
    } catch (e) {
        // Safe failover
    }
};

