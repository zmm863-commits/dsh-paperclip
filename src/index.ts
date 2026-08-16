/**
 * dsh-paperclip host half: intentionally empty. The paperclip button is a
 * pure browser-side feature; this module exists only as the cordis plugin
 * anchor the bundle patch mounts.
 */
import type { Context } from '@deepseek-ai/cordis'

/** Plugin identity for cordis.yml rows. */
export const name = 'dsh-paperclip'

export function apply(_ctx: Context): void {
  // Nothing to do on the host.
}
