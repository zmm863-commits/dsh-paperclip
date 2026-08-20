/**
 * dsh-paperclip client half: a single paperclip button in the composer's
 * input row. Click to pick files, drag-and-drop to attach (including whole
 * directories). Files are uploaded to the server with a progress bar, and
 * their names are listed in the composer textarea.
 */
import { createElement, useCallback, useEffect, useRef, useState } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'

export const inject = ['slots', 'locale']

const ID = 'dsh-paperclip'

// ─── i18n ──────────────────────────────────────────────────────────────────
const ZH = {
  'btn.title': '上传文件（支持拖拽目录）',
  'hint.drop': '松开以上传文件 / 目录',
  'uploading': '上传中 {current}/{total}',
}

const EN = {
  'btn.title': 'Upload file (drag dir ok)',
  'hint.drop': 'Release to upload',
  'uploading': 'Uploading {current}/{total}',
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const CSS = `
.dsh-pc-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border: 1px solid rgba(127,127,137,.35);
  background: transparent; color: inherit; border-radius: 999px;
  font-size: 14px; line-height: 1; cursor: pointer; opacity: .7;
  transition: opacity .12s ease, background-color .12s ease; flex-shrink: 0;
  position: relative;
}
.dsh-pc-btn:hover { opacity: 1; background: rgba(127,127,137,.12); }
.dsh-pc-btn[data-active="true"] { opacity: 1; background: rgba(77,107,254,.15); border-color: rgba(77,107,254,.5); }
.dsh-pc-btn:disabled { opacity: .4; cursor: default; }
.dsh-pc-progress {
  position: absolute; bottom: -2px; left: 0; height: 2px;
  background: rgba(77,107,254,.6); border-radius: 1px;
  transition: width .15s ease;
}
.dsh-pc-dropzone {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  background: rgba(77,107,254,.08); border: 2px dashed rgba(77,107,254,.4);
  border-radius: 12px; color: rgba(77,107,254,.8); font-size: 14px; font-weight: 500;
  pointer-events: none; z-index: 10; animation: dsh-pc-fadein .15s ease;
}
@keyframes dsh-pc-fadein {
  from { opacity: 0; transform: translateX(-50%) translateY(10px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
`

function injectStyle() {
  const tagId = ID + '/styles.css'
  if (typeof document !== 'undefined' && !document.querySelector('style[data-plugin-css="' + tagId + '"]')) {
    const tag = document.createElement('style')
    tag.dataset.plugin = ID
    tag.dataset.pluginCss = tagId
    tag.textContent = CSS
    document.head.appendChild(tag)
  }
}

// ─── Upload helper ─────────────────────────────────────────────────────────
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

async function uploadFile(file: File): Promise<string> {
  const contentBase64 = await fileToBase64(file)
  const filename = (file as any).webkitRelativePath || file.name
  const resp = await fetch('/api/paperclip/upload', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ filename, contentBase64 }),
  })
  if (!resp.ok) throw new Error(`upload failed: ${resp.status}`)
  const data = await resp.json()
  return data.name || filename
}

// ─── Insert into draft ─────────────────────────────────────────────────────
function insertText(text: string, inputActions?: { setDraft(text: string): void }) {
  const textarea = document.querySelector<HTMLTextAreaElement>('[data-composer-seat] textarea')
  if (inputActions?.setDraft) {
    const current = textarea?.value ?? ''
    inputActions.setDraft(current ? current.trimEnd() + '\n' + text.trimStart() : text)
  } else if (textarea) {
    const proto = Object.getPrototypeOf(textarea)
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value')
    const value = textarea.value ? textarea.value.trimEnd() + '\n' + text.trimStart() : text
    if (descriptor?.set) descriptor.set.call(textarea, value)
    else textarea.value = value
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    textarea.dispatchEvent(new Event('change', { bubbles: true }))
  }
}

// ─── Read dropped entries ─────────────────────────────────────────────────
function readEntry(entry: any, prefix = ''): Promise<File[]> {
  return new Promise((resolve) => {
    const path = prefix ? prefix + '/' + entry.name : entry.name
    if (entry.isFile) {
      entry.file((f: File) => {
        try { (f as any).webkitRelativePath = path } catch {}
        resolve([f])
      }, () => resolve([]))
    } else if (entry.isDirectory) {
      const f = new File([], entry.name, { type: 'httpd/unix-directory' } as any)
      try { (f as any).webkitRelativePath = path } catch {}
      resolve([f])
    } else {
      resolve([])
    }
  })
}

// ─── Component ──────────────────────────────────────────────────────────────
interface PaperclipProps {
  t: (k: string) => string
  inputActions?: { setDraft(text: string): void }
}

function PaperclipButton({ t, inputActions }: PaperclipProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)
  const handleFilesRef = useRef<(files: File[] | FileList) => Promise<void>>(() => Promise.resolve())

  const handleFiles = useCallback(async (fileList: File[] | FileList) => {
    const files = Array.from(fileList).filter(f => f.size > 0 || f.name)
    if (files.length === 0) return
    setProgress({ current: 0, total: files.length })
    try {
      const names: string = []
      for (let i = 0; i < files.length; i++) {
        const name = await uploadFile(files[i])
        names.push('📄 ' + name)
        setProgress({ current: i + 1, total: files.length })
      }
      insertText(names.join('\n'), inputActions)
    } catch (err) {
      console.error('[dsh-paperclip] upload error:', err)
    } finally {
      setTimeout(() => setProgress(null), 800)
    }
  }, [inputActions])

  handleFilesRef.current = handleFiles

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) handleFiles(e.target.files)
  }, [handleFiles])

  useEffect(() => {
    const zone = document.querySelector<HTMLElement>('[data-conversation-scroll]')
      || document.querySelector<HTMLElement>('[data-composer-seat]')
    if (!zone) return

    let depth = 0
    const onDragEnter = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); depth++; if (depth === 1) setDragging(true) }
    const onDragOver = (e: DragEvent) => { e.preventDefault(); e.stopPropagation() }
    const onDragLeave = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); depth--; if (depth <= 0) { depth = 0; setDragging(false) } }
    const onDrop = async (e: DragEvent) => {
      e.preventDefault(); e.stopPropagation()
      depth = 0; setDragging(false)
      const items = e.dataTransfer?.items
      if (!items || items.length === 0) return
      const files: File[] = []
      for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry?.()
        if (entry) files.push(...await readEntry(entry))
        else if (items[i].kind === 'file') { const f = items[i].getAsFile(); if (f) files.push(f) }
      }
      if (files.length > 0) handleFilesRef.current(files)
    }

    zone.addEventListener('dragenter', onDragEnter)
    zone.addEventListener('dragover', onDragOver)
    zone.addEventListener('dragleave', onDragLeave)
    zone.addEventListener('drop', onDrop)
    return () => {
      zone.removeEventListener('dragenter', onDragEnter)
      zone.removeEventListener('dragover', onDragOver)
      zone.removeEventListener('dragleave', onDragLeave)
      zone.removeEventListener('drop', onDrop)
    }
  }, [])

  const pct = progress ? Math.round((progress.current / progress.total) * 100) : 0

  return createElement('span', { style: { position: 'relative', display: 'inline-flex' } },
    createElement('input', {
      ref: inputRef,
      type: 'file',
      multiple: true,
      style: { display: 'none' },
      onChange: handleInputChange,
    }),
    createElement('button', {
      type: 'button',
      className: 'dsh-pc-btn',
      title: progress ? t('uploading').replace('{current}', String(progress.current)).replace('{total}', String(progress.total)) : t('btn.title'),
      'data-active': dragging ? 'true' : 'false',
      disabled: !!progress,
      onClick: () => inputRef.current?.click(),
    }, progress ? `${pct}%` : '📎',
    progress && createElement('div', { className: 'dsh-pc-progress', style: { width: pct + '%' } })),
    dragging && createElement('div', { className: 'dsh-pc-dropzone' }, t('hint.drop')),
  )
}

// ─── Plugin entry ───────────────────────────────────────────────────────────
export function apply(ctx: ClientContext): void {
  injectStyle()
  let t = function (key: string) { return key }
  try {
    ctx.locale.register(ID, 'zh', ZH)
    ctx.locale.register(ID, 'en', EN)
    t = ctx.locale.bind(ID)
  } catch (error) {
    console.error(ID + ': locale registration failed: ' + String(error))
  }
  ctx.slots.inject('conversation.input.right', function () {
    return ctx.slots.register(
      { name: 'conversation.input.right', id: 'paperclip', order: 70, label: 'Paperclip' },
      function () { return createElement(PaperclipButton, { t }) },
    )
  })
}
