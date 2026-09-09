/**
 * Web Cursor-CLI overlay, node half. The PTY WebSocket lives in
 * `@deepseek-ai/dsh-cursor-agent-gateway`; this package only registers the
 * browser overlay.
 */

/** Host plugin body — PTY ownership is the gateway package. */
export function apply(): void {}
