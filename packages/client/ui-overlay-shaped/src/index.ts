/**
 * Overlay shaped board, node half. The browser half mounts `shell.overlay`
 * id `overlay-shaped` and declares `overlay-shaped.body`. Removing the
 * Loader row unloads both halves.
 * @module
 */

export {
  OVERLAY_SHAPED_BODY_SLOT, OVERLAY_SHAPED_PACKAGE_NAME,
} from './shaped.ts'
export {
  formatOverlayShapedHidden, OVERLAY_SHAPED_HIDDEN_FILE, parseOverlayShapedHidden,
  setOverlayShapedHiddenIds,
} from './hidden.ts'

/** Host plugin body — occupants are the browser half. */
export function apply(): void {}
