/**
 * dsh-paperclip client half: a single paperclip button in the composer's
 * input row. Click to pick files, drag-and-drop to attach (including whole
 * directories). Text files are read and inserted into the composer textarea
 * with a formatted header; binary files (zip, images, …) show metadata only.
 */
import { createElement, useCallback, useEffect, useRef, useState } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'

export const inject = ['slots', 'locale']

const ID = 'dsh-paperclip'
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB per file
const MAX_FILES = 50                   // allow more when a folder is dropped

const ACCEPT = [
  '.html', '.htm', '.js', '.ts', '.jsx', '.tsx',
  '.css', '.scss', '.sass', '.less',
  '.json', '.xml', '.yaml', '.yml',
  '.md', '.markdown', '.txt',
  '.py', '.java', '.c', '.cpp', '.h', '.hpp',
  '.go', '.rs', '.php', '.rb', '.sh', '.bat', '.ps1',
  '.sql', '.log', '.env', '.ini', '.cfg', '.conf',
  '.csv', '.tsv', '.svg',
  '.vue', '.svelte', '.astro',
  '.toml', '.lock', '.zip',
].join(',')

// ─── i18n ──────────────────────────────────────────────────────────────────
const ZH = {
  'btn.title': '上传文件（支持拖拽目录）',
  'btn.folder': '选择目录',
  'error.size': '文件超过 5MB 限制',
  'error.read': '读取文件失败',
  'error.many': '最多同时上传 50 个文件',
  'hint.drop': '松开以上传文件 / 目录',
  'meta.binary': '二进制内容已省略',
}

const EN = {
  'btn.title': 'Upload file (drag dir ok)',
  'btn.folder': 'Select folder',
  'error.size': 'File exceeds 5MB limit',
  'error.read': 'Failed to read file',
  'error.many': 'Maximum 50 files at once',
  'hint.drop': 'Release to upload',
  'meta.binary': 'binary content omitted',
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function formatContent(name: string, size: number, content: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  const fence = ext === 'md' || ext === 'markdown' ? 'markdown' : ext
  return `\n📄 ${name} (${formatSize(size)})\n\`\`\`${fence}\n${content}\n\`\`\`\n`
}

const BINARY_EXTS = new Set(['.zip', '.gz', '.bz2', '.xz', '.7z', '.rar', '.tar', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.exe', '.dll', '.so', '.dylib', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.mp3', '.mp4', '.avi', '.mov', '.webm', '.wav', '.flac'])

function isBinaryByName(name: string): boolean {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
  return BINARY_EXTS.has(ext)
}

function isBinary(file: File): Promise<boolean> {
  if (isBinaryByName(file.name)) return Promise.resolve(true)
  return new Promise((resolve) => {
    const blob = file.slice(0, 512)
    const reader = new FileReader()
    reader.onload = () => {
      const bytes = new Uint8Array(reader.result as ArrayBuffer)
      for (let i = 0; i < bytes.length; i++) {
        if (bytes[i] === 0) { resolve(true); return }
      }
      resolve(false)
    }
    reader.onerror = () => resolve(false)
    reader.readAsArrayBuffer(blob)
  })
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

/**
 * Recursively read a FileSystemEntry (file or directory) into a flat File[]
 * so drag-and-drop of whole folders just works.
 */
function readEntry(entry: any, prefix = ''): Promise<File[]> {
  return new Promise((resolve) => {
    const path = prefix ? prefix + '/' + entry.name : entry.name
    if (entry.isFile) {
      entry.file((f: File) => {
        // attach the directory path so the UI can show it
        try { (f as any).webkitRelativePath = path } catch {}
        resolve([f])
      }, () => resolve([]))
    } else if (entry.isDirectory) {
      const reader = entry.createReader()
      reader.readEntries(async (entries: any[]) => {
        const out: File[] = []
        for (const e of entries) out.push(...await readEntry(e, path))
        resolve(out)
      }, () => resolve([]))
    } else {
      resolve([])
    }
  })
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const CSS = `
.dsh-pc-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid rgba(127,127,137,.35);
  background: transparent;
  color: inherit;
  border-radius: 999px;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  opacity: .7;
  transition: opacity .12s ease, background-color .12s ease;
  flex-shrink: 0;
}
.dsh-pc-btn:hover {
  opacity: 1;
  background: rgba(127,127,137,.12);
}
.dsh-pc-btn[data-active="true"] {
  opacity: 1;
  background: rgba(77,107,254,.15);
  border-color: rgba(77,107,254,.5);
}
.dsh-pc-error {
  position: fixed;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 16px;
  background: #ef4444;
  color: white;
  border-radius: 8px;
  font-size: 13px;
  z-index: 9999;
  animation: dsh-pc-fadein .2s ease;
}
@keyframes dsh-pc-fadein {
  from { opacity: 0; transform: translateX(-50%) translateY(10px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
.dsh-pc-dropzone {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(77,107,254,.08);
  border: 2px dashed rgba(77,107,254,.4);
  border-radius: 12px;
  color: rgba(77,107,254,.8);
  font-size: 14px;
  font-weight: 500;
  pointer-events: none;
  z-index: 10;
  animation: dsh-pc-fadein .15s ease;
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

// ─── Insert into draft ─────────────────────────────────────────────────────
// React-controlled textarea: writing .value directly is overwritten on the
// next render. Prefer the official inputActions.setDraft(); fall back to the
// native value setter + input/change events.
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
    textarea.scrollTop = textarea.scrollHeight
  }
}

// ─── Component ──────────────────────────────────────────────────────────────
interface PaperclipProps {
  t: (k: string) => string
  inputActions?: { setDraft(text: string): void }
}

function PaperclipButton({ t, inputActions }: PaperclipProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const dirInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  // keep the latest handler in a ref so the effect never needs to re-bind
  const handleFilesRef = useRef<(files: File[] | FileList) => Promise<void>>(() => Promise.resolve())

  const showError = useCallback((msg: string) => {
    setError(msg)
    setTimeout(() => setError(null), 3000)
  }, [])

  const handleFiles = useCallback(async (fileList: File[] | FileList) => {
    const files = Array.from(fileList).slice(0, MAX_FILES)
    if (files.length === 0) return

    let text = ''
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        showError(t('error.size') + ': ' + file.name)
        continue
      }
      try {
        // webkitRelativePath carries the directory structure when a folder
        // is selected / dropped; fall back to the bare name for flat files.
        const displayName = (file as any).webkitRelativePath || file.name
        if (await isBinary(file)) {
          text += `\n📄 ${displayName} (${formatSize(file.size)}) — ${t('meta.binary')}\n`
        } else {
          const content = await readFile(file)
          text += formatContent(displayName, file.size, content)
        }
      } catch {
        showError(t('error.read') + ': ' + file.name)
      }
    }
    if (text) insertText(text, inputActions)
  }, [showError, t, inputActions])

  // always point the ref at the latest closure
  handleFilesRef.current = handleFiles

  const handleClick = useCallback(() => {
    inputRef.current?.click()
  }, [])

  const handleDirClick = useCallback(() => {
    dirInputRef.current?.click()
  }, [])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) handleFiles(e.target.files)
  }, [handleFiles])

  // Drag & drop on the whole conversation scroll area (bigger drop zone).
  // webkitGetAsEntry() lets us recurse into dropped directories.
  useEffect(() => {
    const zone = document.querySelector<HTMLElement>('[data-conversation-scroll]')
      || document.querySelector<HTMLElement>('[data-composer-seat]')
    if (!zone) return

    let depth = 0

    const onDragEnter = (e: DragEvent) => {
      e.preventDefault()
      depth++
      if (depth === 1) setDragging(true)
    }
    const onDragOver = (e: DragEvent) => { e.preventDefault() }
    const onDragLeave = (e: DragEvent) => {
      e.preventDefault()
      depth--
      if (depth <= 0) { depth = 0; setDragging(false) }
    }
    const onDrop = async (e: DragEvent) => {
      e.preventDefault()
      depth = 0
      setDragging(false)

      const items = e.dataTransfer?.items
      if (!items || items.length === 0) return

      const files: File[] = []
      for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry?.()
        if (entry) {
          files.push(...await readEntry(entry))
        } else if (items[i].kind === 'file') {
          const f = items[i].getAsFile()
          if (f) files.push(f)
        }
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

  return createElement('span', { style: { position: 'relative', display: 'inline-flex' } },
    createElement('input', {
      ref: inputRef,
      type: 'file',
      multiple: true,
      accept: ACCEPT,
      style: { display: 'none' },
      onChange: handleInputChange,
    }),
    createElement('input', {
      ref: dirInputRef,
      type: 'file',
      webkitdirectory: '',
      style: { display: 'none' },
      onChange: handleInputChange,
    }),
    createElement('button', {
      type: 'button',
      className: 'dsh-pc-btn',
      title: t('btn.title'),
      'data-active': dragging ? 'true' : 'false',
      onClick: handleClick,
    }, '📎'),
    dragging && createElement('div', { className: 'dsh-pc-dropzone' }, t('hint.drop')),
    error && createElement('div', { className: 'dsh-pc-error' }, error),
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
