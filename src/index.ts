/**
 * dsh-paperclip host half: receives uploaded files from the browser and
 * persists them to a server directory so the agent can read them.
 *
 * Upload API:  POST /api/paperclip/upload  { filename, contentBase64 }
 * Response:    { path, name }
 */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'

export const name = 'dsh-paperclip'
export const inject = ['webServer']

const UPLOAD_DIR = '/root/软件/.paperclip-uploads'

if (!existsSync(UPLOAD_DIR)) {
  mkdirSync(UPLOAD_DIR, { recursive: true })
}

export function apply(ctx: Context): void {
  const handler: WebRoute['handler'] = async (req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'content-type': 'text/plain', allow: 'POST' })
      res.end()
      return
    }

    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk)
    const body = Buffer.concat(chunks).toString()

    let payload: { filename?: string; contentBase64?: string }
    try {
      payload = JSON.parse(body)
    } catch {
      res.writeHead(400, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'invalid JSON' }))
      return
    }

    const { filename, contentBase64 } = payload
    if (!filename || !contentBase64) {
      res.writeHead(400, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'filename and contentBase64 required' }))
      return
    }

    // Prevent path traversal (".."), but keep directory separators so the
    // uploaded folder structure is preserved under UPLOAD_DIR.
    const safeName = filename.replace(/\.\./g, '_')
    const filePath = join(UPLOAD_DIR, safeName)

    try {
      mkdirSync(dirname(filePath), { recursive: true })
      const content = Buffer.from(contentBase64, 'base64')
      writeFileSync(filePath, content)
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ path: filePath, name: filename }))
    } catch (err) {
      res.writeHead(500, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: String(err) }))
    }
  }

  ctx.effect(
    () => ctx.webServer.register({ kind: 'prefix', path: '/api/paperclip', handler }),
    'dsh-paperclip: upload route',
  )
}
