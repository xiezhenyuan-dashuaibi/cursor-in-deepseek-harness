/**
 * Overlay desktop board, node half. The browser half mounts `shell.overlay`
 * id `overlay-desktop` and declares `overlay-desktop.body`. Removing the
 * Loader row unloads both halves.
 * @module
 */

export {
  OVERLAY_DESKTOP_BODY_SLOT, OVERLAY_DESKTOP_PACKAGE_NAME,
} from './desktop.ts'

/** Host plugin body — the occupant is the browser half. */
export function apply(): void {}
