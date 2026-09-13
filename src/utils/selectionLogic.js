// src/utils/selectionLogic.js

/**
 * Determines the new selected token IDs based on the current state.
 * Mirrors the logic in TacticalMapView.handleSelectToken but extracted for isolated testing.
 *
 * @param {object} params
 * @param {string|null} params.draggedTokenId - ID of token currently being dragged (null if none).
 * @param {string} params.tokenId - The token that was clicked.
 * @param {boolean} params.isMulti - Whether Shift‑click (multi‑select) is active.
 * @param {string[]} params.selectedTokenIds - Current array of selected token IDs.
 * @returns {string[]} Updated array of selected token IDs.
 */
export function handleSelectToken({ draggedTokenId, tokenId, isMulti, selectedTokenIds }) {
  // If a drag operation is active, ignore selection changes.
  if (draggedTokenId) {
    return selectedTokenIds;
  }

  // Shift‑click toggles multi‑selection; otherwise single selection.
  if (isMulti) {
    return selectedTokenIds.includes(tokenId)
      ? selectedTokenIds.filter((id) => id !== tokenId)
      : [...selectedTokenIds, tokenId];
  }
  return [tokenId];
}

