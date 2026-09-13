/**
 * D&D Beyond API Service
 * 
 * Provides a robust mechanism for fetching D&D Beyond characters.
 * Implements a multi-tier proxy fallback cascade to bypass CORS restrictions
 * when direct requests to character-service.dndbeyond.com fail.
 */

/**
 * Extracts a character ID from a URL, raw ID string, or API endpoint.
 * @param {string} input - The D&D Beyond URL or ID string.
 * @returns {string|null} - The extracted character ID, or null if invalid.
 */
export function extractDndBeyondId(input) {
  if (!input) return null;
  
  const trimmed = String(input).trim();
  
  // 1. Raw number
  if (/^\d+$/.test(trimmed)) {
    return trimmed;
  }
  
  // 2. Full or partial URL parsing
  try {
    // Matches patterns like:
    // https://www.dndbeyond.com/characters/12345
    // https://character-service.dndbeyond.com/character/v5/character/12345
    // dndbeyond.com/profile/User/characters/12345
    
    const match = trimmed.match(/characters?\/(\d+)/i) || trimmed.match(/character\/(\d+)/i);
    if (match && match[1]) {
      return match[1];
    }
  } catch (err) {
    console.warn("Failed to parse D&D Beyond ID:", err);
  }
  
  return null;
}

/**
 * Fetches a URL with a specified timeout.
 * @param {string} url 
 * @param {object} options 
 * @param {number} timeoutMs 
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

/**
 * Validates the parsed JSON to ensure it matches the expected D&D Beyond format.
 */
function validateDndBeyondData(data) {
  if (!data) throw new Error("Received empty response");
  
  if (data.errorCode === 403 || data.error === 'Forbidden') {
     throw new Error("This character is set to 'Private' on D&D Beyond. Please set it to 'Public' in the character settings.");
  }
  
  if (data.errorCode === 404 || data.error === 'Not Found' || (data.message && data.message.includes("not found"))) {
      throw new Error("Character not found. The ID might be incorrect or the character was deleted.");
  }

  // The actual character data is usually nested inside `data.data` or returned directly depending on the proxy
  // AllOrigins /get wrapper places it in `contents`
  const charData = data.contents ? JSON.parse(data.contents) : data;
  
  const actualData = charData.data ? charData.data : charData;

  if (!actualData || !actualData.name || !actualData.classes) {
      throw new Error("Received invalid character data format from D&D Beyond.");
  }

  return charData; // Return the standard { success: true, data: {...} } format
}

/**
 * Fetches character data from D&D Beyond using a proxy cascade.
 * 
 * Tier 1: Vite Dev Proxy (/dndbeyond-api)
 * Tier 2: CorsFix Proxy (https://proxy.corsfix.com)
 * Tier 3: CodeTabs Proxy (https://api.codetabs.com)
 * Tier 4: AllOrigins JSON Proxy (https://api.allorigins.win)
 * 
 * @param {string} characterIdOrUrl - The ID or URL of the character.
 * @returns {Promise<object>} - The parsed character JSON.
 */
export async function fetchDndBeyondCharacter(characterIdOrUrl) {
  const characterId = extractDndBeyondId(characterIdOrUrl);
  
  if (!characterId) {
    throw new Error("Invalid D&D Beyond URL or ID.");
  }

  const targetUrl = `https://character-service.dndbeyond.com/character/v5/character/${characterId}`;
  
  const proxies = [
    {
      name: "Vite Dev Proxy",
      url: `/dndbeyond-api/character/v5/character/${characterId}`,
      extract: (json) => json
    },
    {
      name: "CorsFix",
      url: `https://proxy.corsfix.com/?${targetUrl}`,
      extract: (json) => json
    },
    {
      name: "CodeTabs",
      url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`,
      extract: (json) => json
    },
    {
      name: "AllOrigins (JSON)",
      url: `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`,
      extract: (json) => json // validateDndBeyondData handles the .contents unpacking
    }
  ];

  let lastError = null;

  for (const proxy of proxies) {
    console.log(`[D&D Beyond Service] Attempting fetch via: ${proxy.name}`);
    
    try {
      const response = await fetchWithTimeout(proxy.url, {
        headers: {
          'Accept': 'application/json'
        }
      }, 6000); // 6s timeout per proxy

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const text = await response.text();
      if (!text || text.trim() === '') {
          throw new Error("Empty response body");
      }

      let data;
      try {
          data = JSON.parse(text);
      } catch (parseErr) {
          console.error(`[D&D Beyond Service] JSON Parse Error from ${proxy.name}:`, text.substring(0, 100));
          throw new Error("Invalid JSON returned from proxy");
      }

      const extractedData = proxy.extract(data);
      const validatedData = validateDndBeyondData(extractedData);
      
      console.log(`[D&D Beyond Service] Success via ${proxy.name}`);
      return validatedData;

    } catch (err) {
      console.warn(`[D&D Beyond Service] ${proxy.name} failed:`, err.message);
      
      // If it's a known semantic error (Private or Not Found), don't keep trying proxies.
      // Bubble it up immediately.
      if (err.message.includes("Private") || err.message.includes("Not Found")) {
          throw err;
      }
      
      lastError = err;
    }
  }

  console.error("[D&D Beyond Service] All proxies exhausted.");
  throw new Error(`Failed to fetch from D&D Beyond. Proxies may be down or the request is blocked. Last error: ${lastError?.message}`);
}

