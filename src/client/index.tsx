/**
 * dsh-paperclip client half: a single paperclip button in the composer's
 * input row. Click to pick files, drag-and-drop to attach. Selected files are
 * read as text and inserted into the composer textarea with a formatted header.
 */
import { createElement, useCallback, useEffect, useRef, useState } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'

// ─── Injection ──────────────────────────────────────────────────────────────
export const inject = ['slots', 'locale']

// ─── Constants ──────────────────────────────────────────────────────────────
const ID = 'dsh-paperclip'
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB
const MAX_FILES = 10

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
  '.toml', '.lock',
].join(',')

// ─── i18n ───────────────────────────────────────────────────────────────────
const ZH = {
  'btn.title': '上传文件（支持拖拽）',
  'error.size': '文件超过 5MB 限制',
  'error.read': '读取文件失败',
  'error.many': '最多同时上传 10 个文件',
  'hint.drop': '松开以上传文件',
}

const EN = {
  'btn.title': 'Upload file (drag & drop ok)',
  'error.size': 'File exceeds 5MB limit',
  'error.read': 'Failed to read file',
  'error.many': 'Maximum 10 files at once',
  'hint.drop': 'Release to upload',
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function formatContent(name: string, size: number, content: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  const fence = ext === 'md' || ext === 'markdown' ? 'markdown' : ext
  return `\n📄 ${name} (${formatSize(size)})\n\`\`\`${fence}\n${content}\n\`\`\`\n`
}

function findTextarea(): HTMLTextAreaElement | null {
  return document.querySelector('[data-composer-seat] textarea')
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

// ─── File reading ───────────────────────────────────────────────────────────
function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

async function pickAndReadFiles(
  input: HTMLInputElement,
): Promise<Array<{ name: string; size: number; content: string }>> {
  const files = Array.from(input.files || []).slice(0, MAX_FILES)
  const results: Array<{ name: string; size: number; content: string }> = []
  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) continue
    try {
      const content = await readFile(file)
      results.push({ name: file.name, size: file.size, content })
    } catch { /* skip */ }
  }
  input.value = ''
  return results
}

// ─── Insert into textarea ───────────────────────────────────────────────────
function insertIntoTextarea(text: string) {
  const textarea = findTextarea()
  if (!textarea) return
  const current = textarea.value
  textarea.value = current ? current.trimEnd() + '\n' + text.trimStart() : text
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
  textarea.scrollTop = textarea.scrollHeight
}

// ─── Component ──────────────────────────────────────────────────────────────
function PaperclipButton({ t }: { t: (k: string) => string }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const showError = useCallback((msg: string) => {
    setError(msg)
    setTimeout(() => setError(null), 3000)
  }, [])

  const handleFiles = useCallback(async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).slice(0, MAX_FILES)
    if (files.length === 0) return

    let text = ''
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        showError(t('error.size') + ': ' + file.name)
        continue
      }
      try {
        const content = await readFile(file)
        text += formatContent(file.name, file.size, content)
      } catch {
        showError(t('error.read') + ': ' + file.name)
      }
    }
    if (text) insertIntoTextarea(text)
  }, [showError, t])

  const handleClick = useCallback(() => {
    inputRef.current?.click()
  }, [])

  const handleInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await handleFiles(e.target.files)
    }
  }, [handleFiles])

  // Drag & drop on composer
  useEffect(() => {
    const composer = document.querySelector('[data-composer-seat]')
    if (!composer) return

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
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        await handleFiles(e.dataTransfer.files)
      }
    }

    composer.addEventListener('dragenter', onDragEnter)
    composer.addEventListener('dragover', onDragOver)
    composer.addEventListener('dragleave', onDragLeave)
    composer.addEventListener('drop', onDrop)
    return () => {
      composer.removeEventListener('dragenter', onDragEnter)
      composer.removeEventListener('dragover', onDragOver)
      composer.removeEventListener('dragleave', onDragLeave)
      composer.removeEventListener('drop', onDrop)
    }
  }, [handleFiles])

  return createElement('span', { style: { position: 'relative', display: 'inline-flex' } },
    createElement('input', {
      ref: inputRef,
      type: 'file',
      multiple: true,
      accept: ACCEPT,
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
