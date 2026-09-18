// Utility to generate procedural, high-resolution SVG character and monster tokens
// Guaranteed offline / zero-network fallback when AI image generation is unavailable or rate-limited.

export const createProceduralToken = (char = {}) => {
    const name = char?.name || 'Creature';
    const rawType = (char?.type || char?.race || char?.class || 'Creature').toLowerCase();

    // Thematic color palettes & glyphs based on D&D 5e creature types and classes
    let primaryColor = '#8b5cf6'; // Purple
    let secondaryColor = '#4c1d95';
    let accentColor = '#c084fc';
    let glyph = '⚔️';

    if (rawType.includes('undead')) {
        primaryColor = '#10b981'; secondaryColor = '#064e3b'; accentColor = '#34d399'; glyph = '💀';
    } else if (rawType.includes('dragon') || rawType.includes('fiend') || rawType.includes('inferno')) {
        primaryColor = '#ef4444'; secondaryColor = '#7f1d1d'; accentColor = '#f87171'; glyph = '🔥';
    } else if (rawType.includes('aberration') || rawType.includes('flayer')) {
        primaryColor = '#a855f7'; secondaryColor = '#581c87'; accentColor = '#e9d5ff'; glyph = '👁️';
    } else if (rawType.includes('elemental') || rawType.includes('storm')) {
        primaryColor = '#06b6d4'; secondaryColor = '#164e63'; accentColor = '#67e8f9'; glyph = '⚡';
    } else if (rawType.includes('beast') || rawType.includes('wolf')) {
        primaryColor = '#f59e0b'; secondaryColor = '#78350f'; accentColor = '#fde68a'; glyph = '🐺';
    } else if (rawType.includes('construct') || rawType.includes('golem') || rawType.includes('clockwork')) {
        primaryColor = '#94a3b8'; secondaryColor = '#1e293b'; accentColor = '#e2e8f0'; glyph = '⚙️';
    } else if (rawType.includes('celestial') || rawType.includes('angel') || rawType.includes('paladin') || rawType.includes('cleric')) {
        primaryColor = '#eab308'; secondaryColor = '#713f12'; accentColor = '#fef08a'; glyph = '✨';
    } else if (rawType.includes('plant') || rawType.includes('treant') || rawType.includes('druid') || rawType.includes('ranger')) {
        primaryColor = '#22c55e'; secondaryColor = '#14532d'; accentColor = '#86efac'; glyph = '🌿';
    } else if (rawType.includes('fey') || rawType.includes('bard')) {
        primaryColor = '#ec4899'; secondaryColor = '#831843'; accentColor = '#fbcfe8'; glyph = '🌸';
    } else if (rawType.includes('wizard') || rawType.includes('sorcerer') || rawType.includes('warlock')) {
        primaryColor = '#6366f1'; secondaryColor = '#312e81'; accentColor = '#a5b4fc'; glyph = '🔮';
    } else if (rawType.includes('rogue') || rawType.includes('assassin') || rawType.includes('shadow')) {
        primaryColor = '#64748b'; secondaryColor = '#0f172a'; accentColor = '#cbd5e1'; glyph = '🗡️';
    } else {
        primaryColor = '#d97706'; secondaryColor = '#451a03'; accentColor = '#fcd34d'; glyph = '⚔️';
    }

    // Clean creature initials (up to 2 characters)
    const initials = name
        .replace(/[^a-zA-Z0-9 ]/g, '')
        .trim()
        .split(/\s+/)
        .map(w => w[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase() || '5E';

    const subtitle = (char?.type || char?.class || char?.race || 'CREATURE')
        .toString()
        .substring(0, 16)
        .toUpperCase();

    const crText = char?.cr !== undefined && char?.cr !== null ? `CR ${char.cr}` : '';

    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
  <defs>
    <radialGradient id="bgGrad" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${primaryColor}" stop-opacity="0.4"/>
      <stop offset="65%" stop-color="${secondaryColor}" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="#030712"/>
    </radialGradient>
    <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${accentColor}"/>
      <stop offset="50%" stop-color="${primaryColor}"/>
      <stop offset="100%" stop-color="${secondaryColor}"/>
    </linearGradient>
    <filter id="runeGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="5" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>

  <!-- Background Base -->
  <rect width="400" height="400" fill="#020617"/>
  <circle cx="200" cy="200" r="186" fill="url(#bgGrad)"/>

  <!-- Ornate Outer Runed Rings -->
  <circle cx="200" cy="200" r="182" fill="none" stroke="url(#ringGrad)" stroke-width="6" stroke-dasharray="16 6" opacity="0.85"/>
  <circle cx="200" cy="200" r="170" fill="none" stroke="${accentColor}" stroke-width="2" opacity="0.7"/>
  <circle cx="200" cy="200" r="132" fill="#020617" fill-opacity="0.65" stroke="${primaryColor}" stroke-width="1.5" stroke-dasharray="4 6"/>

  <!-- Center Fantasy Glyph Icon -->
  <text x="200" y="172" text-anchor="middle" dominant-baseline="middle" font-size="76" filter="url(#runeGlow)">${glyph}</text>

  <!-- Creature Initials -->
  <text x="200" y="254" text-anchor="middle" dominant-baseline="middle" font-family="'Cinzel', Georgia, serif" font-weight="bold" font-size="34" fill="#f8fafc" letter-spacing="4">${initials}</text>

  <!-- Creature Subtitle / Type -->
  <text x="200" y="292" text-anchor="middle" dominant-baseline="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="700" font-size="13" fill="${accentColor}" letter-spacing="2" opacity="0.95">${subtitle}</text>

  ${crText ? `<text x="200" y="325" text-anchor="middle" dominant-baseline="middle" font-family="monospace" font-weight="700" font-size="12" fill="#94a3b8" letter-spacing="1">${crText}</text>` : ''}
</svg>`.trim();

    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

