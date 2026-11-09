/* CSV/TSV parsing, file reading and downloads. */

/** RFC-4180-ish parser. Picks tab or comma from the first line (pasted Sheets rows are tab-separated). */
export function parseDelimited(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] || ''
  const delim = firstLine.split('\t').length >= firstLine.split(',').length ? '\t' : ','
  const rows: string[][] = []
  let row: string[] = [], cell = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++ } else q = false } else cell += c
    } else if (c === '"' && cell === '') q = true
    else if (c === delim) { row.push(cell); cell = '' }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
    else if (c !== '\r') cell += c
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows
}

/** Build CSV text from a header and rows. */
export function toCSV(head: string[], rows: unknown[][]) {
  const q = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  return [head.map(q).join(','), ...rows.map(r => r.map(q).join(','))].join('\n')
}

/** Read a text file, handling the UTF-16 CSVs Meta Leads Center exports. */
export async function readTextFile(file: File) {
  const buf = new Uint8Array(await file.arrayBuffer())
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf.subarray(2))
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder('utf-16be').decode(buf.subarray(2))
  const t = new TextDecoder('utf-8').decode(buf)
  return t.charCodeAt(0) === 0xfeff ? t.slice(1) : t
}

/** Save a file to the user's computer. */
export function downloadFile(filename: string, data: Blob | string, type = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type: filename.endsWith('.csv') ? 'text/csv;charset=utf-8' : filename.endsWith('.json') ? 'application/json' : type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

/** Resize an uploaded image to a JPEG data URL (for the invoice logo). */
export function resizeImage(file: File, maxW = 756, quality = 0.88): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file)
    img.onload = () => {
      const w = Math.min(maxW, img.naturalWidth), h = Math.round(img.naturalHeight * w / img.naturalWidth)
      const c = document.createElement('canvas'); c.width = w; c.height = h
      const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Not an image')) }
    img.src = url
  })
}
