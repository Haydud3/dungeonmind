/**
 * @typedef {Object} Campaign
 * @property {string} hostId - The UID of the user who created the campaign.
 * @property {string[]} dmIds - An array of UIDs for users with Dungeon Master privileges.
 * @property {Object.<string, {displayName: string, uid: string}>} activeUsers - A dictionary of currently active users in the campaign.
 * @property {string[]} bannedUsers - An array of UIDs for users who are banned from the campaign.
 * @property {Object} config - Campaign-wide configuration settings.
 * @property {string} config.edition - The D&D edition (e.g., '2014' for 5e).
 * @property {boolean} config.strictMode - Whether to enforce strict rules.
 * @property {CampaignInfo} campaignInfo - The descriptive information about the campaign.
 * @property {Object.<string, PlayerCharacter>} characters - A dictionary of all player characters in the campaign, keyed by character ID.
 * @property {Object.<string, NonPlayerCharacter>} npcs - A dictionary of all non-player characters, keyed by NPC ID.
 * @property {Object.<string, JournalEntry>} journal - A dictionary of all journal entries, keyed by entry ID.
 * @property {Object.<string, Handout>} handouts - A dictionary of all handouts, keyed by handout ID.
 * @property {Object.<string, GameMap>} maps - A dictionary of all maps in the campaign, keyed by map ID.
 * @property {string|null} activeMapId - The ID of the currently active map.
 * @property {CombatState} combat - The current state of combat.
 */

/**
 * @typedef {Object} CampaignInfo
 * @property {string} name - The name of the campaign.
 * @property {string} tone - The overall tone of the campaign (e.g., 'Heroic', 'Gritty').
 * @property {string} conflict - The central conflict of the campaign.
 * @property {string|null} description - A short description of the campaign.
 * @property {string|null} imageUrl - A URL for a cover image for the campaign.
 */

/**
 * @typedef {Object} PlayerCharacter
 * @property {string} id - The unique ID for the character.
 * @property {string} playerId - The UID of the player who owns this character.
 * @property {string} name - The character's name.
 * @property {string} class - The character's class.
 * @property {number} level - The character's level.
 * @property {string|null} bio - The character's biography.
 * @property {string|null} imageUrl - A URL for the character's portrait.
 * @property {Object} stats - The character's stats (e.g., strength, dexterity).
 */

/**
 * @typedef {Object} NonPlayerCharacter
 * @property {string} id - The unique ID for the NPC.
 * @property {string} name - The NPC's name.
 * @property {string|null} bio - The NPC's biography.
 * @property {string|null} imageUrl - A URL for the NPC's portrait.
 * @property {boolean} isHostile - Whether the NPC is hostile to the players.
 */

/**
 * @typedef {Object} JournalEntry
 * @property {string} id - The unique ID for the journal entry.
 * @property {string} title - The title of the journal entry.
 * @property {string} content - The content of the journal entry, can be HTML or markdown.
 * @property {string} authorId - The UID of the user who created the entry.
 * @property {string[]} visibleTo - An array of player UIDs who can see this entry. If empty, visible to all.
 * @property {number} timestamp - The timestamp when the entry was created.
 */

/**
 * @typedef {Object} Handout
 * @property {string} id - The unique ID for the handout.
 * @property {string} title - The title of the handout.
 * @property {string} type - The type of handout ('image', 'text', 'pdf').
 * @property {string} content - The content of the handout (e.g., URL for an image, text content).
 * @property {string[]} visibleTo - An array of player UIDs who can see this handout. If empty, visible to all.
 */

/**
 * @typedef {Object} GameMap
 * @property {string} id - The unique ID for the map.
 * @property {string} name - The name of the map.
 * @property {string} backgroundUrl - The URL for the map's background image.
 * @property {string|null} heightmapUrl - The URL for the map's heightmap image.
 * @property {number} scale - The scale of the map.
 * @property {number} gridSize - The size of the grid cells.
 * @property {Object.<string, Token>} tokens - A dictionary of tokens on this map, keyed by token ID.
 * @property {Object.<string, Wall>} walls - A dictionary of walls on this map, keyed by wall ID.
 * @property {Object[]} revealPaths - An array of paths that have been revealed to players.
 */

/**
 * @typedef {Object} Token
 * @property {string} id - The unique ID for the token.
 * @property {string|null} characterId - The ID of the character this token represents, if any.
 * @property {number} x - The x-coordinate of the token on the map.
 * @property {number} y - The y-coordinate of the token on the map (used for 2D height or 3D elevation).
 * @property {number} z - The z-coordinate of the token on the map (for 3D maps).
 * @property {number} rotation - The rotation of the token in degrees.
 * @property {number} size - The size of the token in grid units.
 * @property {string|null} imageUrl - A URL for the token's image, overrides the character's image.
 * @property {boolean} isHidden - Whether the token is hidden from players.
 * @property {number} elevationOffset - The offset from the terrain height for flying/crouching.
 */

/**
 * @typedef {Object} Wall
 * @property {string} id - The unique ID for the wall.
 * @property {Array<{x: number, y: number, z: number}>} points - An array of points that define the wall segments.
 */

/**
 * @typedef {Object} CombatState
 * @property {boolean} isActive - Whether combat is currently active.
 * @property {number} round - The current round of combat.
 * @property {string|null} activeCombatantId - The ID of the combatant whose turn it is.
 * @property {Combatant[]} combatants - An array of all combatants in the encounter.
 */

/**
 * @typedef {Object} Combatant
 * @property {string} id - The unique ID for the combatant in this combat.
 * @property {string} tokenId - The ID of the token this combatant is linked to.
 * @property {string} characterId - The ID of the character this combatant is.
 * @property {number} initiative - The combatant's initiative roll.
 * @property {boolean} isActive - Whether this is the active combatant.
 */

export const NEW_CAMPAIGN_STRUCTURE = {
  hostId: null,
  dmIds: [],
  activeUsers: {},
  bannedUsers: [],
  config: {
    edition: '2014',
    strictMode: true,
  },
  campaignInfo: {
    name: 'New Campaign',
    tone: 'Heroic',
    conflict: 'An ancient evil awakens',
    description: null,
    imageUrl: null,
  },
  characters: {},
  npcs: {},
  journal: {},
  handouts: {},
  maps: {},
  activeMapId: null,
  combat: {
    isActive: false,
    round: 1,
    activeCombatantId: null,
    combatants: [],
  },
};

export const INITIAL_TOKEN_STRUCTURE = {
    id: '',
    characterId: null,
    x: 0,
    y: 0,
    z: 0,
    rotation: 0,
    size: 1,
    imageUrl: null,
    isHidden: false,
    elevationOffset: 0
};
