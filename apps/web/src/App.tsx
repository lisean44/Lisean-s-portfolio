import { useMemo, useRef, useState } from 'react'
import './index.css'

type ImageItem = {
  id: string
  name: string
  file?: File
  src: string
}

type ProcessOption = 'auto' | 'denoise' | 'color' | 'details'

function App() {
  const [original, setOriginal] = useState<ImageItem | null>(null)
  const [processed, setProcessed] = useState<ImageItem | null>(null)
  const [processing, setProcessing] = useState(false)
  const [operation, setOperation] = useState<ProcessOption>('auto')
  const [format, setFormat] = useState<'png' | 'jpeg'>('png')
  const [brightness, setBrightness] = useState(1)
  const [contrast, setContrast] = useState(1)
  const [saturation, setSaturation] = useState(1)
  const [gamma, setGamma] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [slider, setSlider] = useState(50)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [outputName, setOutputName] = useState('enhanced')
  const [bgBlur, setBgBlur] = useState(0)
  const [resizeWidth, setResizeWidth] = useState<number | ''>('')
  const [resizeHeight, setResizeHeight] = useState<number | ''>('')
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const panRef = useRef<{ dragging: boolean; startX: number; startY: number; originX: number; originY: number }>({ dragging: false, startX: 0, startY: 0, originX: 0, originY: 0 })

  const canProcess = useMemo(() => !!original && !processing, [original, processing])

  function onPick() {
    inputRef.current?.click()
  }

  function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    const file = files[0]
    if (!['image/jpeg', 'image/png', 'image/jpg'].includes(file.type)) {
      setError('Only JPG and PNG are supported')
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      setError('File too large (max 20MB)')
      return
    }
    const url = URL.createObjectURL(file)
    setOriginal({ id: crypto.randomUUID(), name: file.name, file, src: url })
    setProcessed(null)
    setError(null)
  }

  async function runProcess(endpoint: string, bodyBuilder: (fd: FormData) => void) {
    if (!original?.file) return
    setProcessing(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('image', original.file)
      bodyBuilder(fd)
      const res = await fetch(endpoint, { method: 'POST', body: fd })
      if (!res.ok) throw new Error('Processing failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      setProcessed({ id: crypto.randomUUID(), name: original.name, src: url })
    } catch (e: any) {
      setError(e.message || 'Failed')
    } finally {
      setProcessing(false)
    }
  }

  function onEnhance() {
    runProcess('/api/adjust', (fd) => {
      fd.append('operation', operation)
      fd.append('format', format)
      fd.append('brightness', String(brightness))
      fd.append('contrast', String(contrast))
      fd.append('saturation', String(saturation))
      fd.append('gamma', String(gamma))
      if (bgBlur > 0) fd.append('backgroundBlur', String(bgBlur))
      if (resizeWidth) fd.append('resizeWidth', String(resizeWidth))
      if (resizeHeight) fd.append('resizeHeight', String(resizeHeight))
    })
  }

  function onDownload() {
    if (!processed) return
    const link = document.createElement('a')
    link.href = processed.src
    const base = outputName || (processed.name || 'enhanced').replace(/\.[^.]+$/, '')
    link.download = `${base}_enhanced.${format === 'jpeg' ? 'jpg' : 'png'}`
    link.click()
  }

  async function onDownloadComparison() {
    if (!original || !processed) return
    // draw side-by-side on canvas
    const imgA = new Image(); imgA.src = original.src
    const imgB = new Image(); imgB.src = processed.src
    await Promise.all([
      new Promise((r) => (imgA.onload = () => r(null))),
      new Promise((r) => (imgB.onload = () => r(null))),
    ])
    const width = Math.max(imgA.width, imgB.width)
    const height = Math.max(imgA.height, imgB.height)
    const canvas = document.createElement('canvas')
    canvas.width = width * 2
    canvas.height = height
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(imgA, 0, 0, width, height)
    ctx.drawImage(imgB, width, 0, width, height)
    const link = document.createElement('a')
    link.href = canvas.toDataURL('image/png')
    const base = outputName || 'comparison'
    link.download = `${base}_before_after.png`
    link.click()
  }

  function onDrop(ev: React.DragEvent<HTMLDivElement>) {
    ev.preventDefault()
    onFiles(ev.dataTransfer.files)
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-6xl mx-auto">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">AI Image Enhancer</h1>
            <p className="text-sm text-gray-600">Upload and enhance photos up to 20MB (JPG/PNG).</p>
          </div>
          <div className="flex gap-2 items-center">
            <input value={outputName} onChange={(e) => setOutputName(e.target.value)} placeholder="Output name" className="px-2 py-1 border rounded-md w-40" />
            <button onClick={onDownload} disabled={!processed} className="px-4 py-2 rounded-md bg-primary-600 text-white disabled:opacity-50">Download</button>
            <button onClick={onDownloadComparison} disabled={!processed} className="px-4 py-2 rounded-md bg-gray-800 text-white disabled:opacity-50">Download Before/After</button>
          </div>
        </header>

        <div className="grid md:grid-cols-5 gap-6">
          <div className="md:col-span-3">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              className="border-2 border-dashed border-gray-300 rounded-xl p-6 bg-white shadow-sm flex flex-col items-center justify-center min-h-[220px]"
            >
              <input ref={inputRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => onFiles(e.target.files)} />
              <p className="text-gray-700 mb-2">Drag & drop or</p>
              <button onClick={onPick} className="px-4 py-2 rounded-md bg-gradient-to-r from-primary-500 to-primary-600 text-white">Browse</button>
              <p className="text-xs text-gray-500 mt-2">JPG, JPEG, PNG up to 20MB</p>
            </div>

            {original && (
              <div className="mt-6 bg-white rounded-xl shadow-sm p-4">
                <h2 className="font-semibold mb-3">Preview</h2>
                <div className="relative overflow-hidden rounded-lg">
                  <div
                    className="relative"
                    style={{
                      transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                      transformOrigin: 'center center',
                      cursor: zoom > 1 ? 'grab' : 'default',
                    }}
                    onMouseDown={(e) => {
                      if (zoom <= 1) return
                      panRef.current.dragging = true
                      panRef.current.startX = e.clientX
                      panRef.current.startY = e.clientY
                      panRef.current.originX = pan.x
                      panRef.current.originY = pan.y
                    }}
                    onMouseMove={(e) => {
                      if (!panRef.current.dragging) return
                      setPan({
                        x: panRef.current.originX + (e.clientX - panRef.current.startX),
                        y: panRef.current.originY + (e.clientY - panRef.current.startY),
                      })
                    }}
                    onMouseUp={() => (panRef.current.dragging = false)}
                    onMouseLeave={() => (panRef.current.dragging = false)}
                  >
                    <img src={original.src} className="max-h-[480px] w-full object-contain select-none" />
                    {processed && (
                      <div className="absolute inset-0" style={{ width: `${slider}%`, overflow: 'hidden' }}>
                        <img src={processed.src} className="max-h-[480px] w-full object-contain select-none" />
                      </div>
                    )}
                    {processed && (
                      <div className="absolute inset-y-0" style={{ left: `${slider}%` }}>
                        <div className="w-0.5 bg-primary-600 h-full"></div>
                      </div>
                    )}
                  </div>
                  {processed && (
                    <div className="mt-3 space-y-2">
                      <input type="range" min={0} max={100} value={slider} onChange={(e) => setSlider(Number(e.target.value))} className="w-full" />
                      <div className="flex items-center gap-2">
                        <span className="text-sm w-20">Zoom</span>
                        <input type="range" min={1} max={4} step={0.1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="flex-1" />
                        <button className="px-2 py-1 border rounded" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}>Reset</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="md:col-span-2 space-y-4">
            <div className="bg-white rounded-xl shadow-sm p-4">
              <h3 className="font-semibold mb-3">Enhancement</h3>
              <div className="grid grid-cols-2 gap-3">
                <button disabled={!canProcess} className="px-3 py-2 rounded-md bg-gray-100" onClick={() => setOperation('auto')}>Auto Enhance</button>
                <button disabled={!canProcess} className="px-3 py-2 rounded-md bg-gray-100" onClick={() => setOperation('denoise')}>Remove Noise</button>
                <button disabled={!canProcess} className="px-3 py-2 rounded-md bg-gray-100" onClick={() => setOperation('color')}>Color Correction</button>
                <button disabled={!canProcess} className="px-3 py-2 rounded-md bg-gray-100" onClick={() => setOperation('details')}>Detail Recovery</button>
                <button disabled={!canProcess} className="px-3 py-2 rounded-md bg-gray-100" onClick={() => setOperation('portrait')}>AI Portrait Retouch</button>
                <button disabled={!canProcess} className="px-3 py-2 rounded-md bg-gray-100" onClick={() => setOperation('upscale2x')}>Upscale 2x</button>
              </div>

              <div className="mt-4 flex items-center gap-3">
                <select className="border rounded-md px-2 py-1" value={format} onChange={(e) => setFormat(e.target.value as any)}>
                  <option value="png">PNG</option>
                  <option value="jpeg">JPG</option>
                </select>
                <button disabled={!canProcess} onClick={onEnhance} className="px-4 py-2 rounded-md bg-gradient-to-r from-primary-500 to-primary-600 text-white">
                  {processing ? 'Enhancing…' : 'Run'}
                </button>
              </div>
              {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
            </div>

            <div className="bg-white rounded-xl shadow-sm p-4">
              <h3 className="font-semibold mb-3">Adjustments</h3>
              <div className="space-y-3">
                <LabeledRange label="Brightness" min={0} max={2} step={0.01} value={brightness} onChange={setBrightness} />
                <LabeledRange label="Contrast" min={0} max={2} step={0.01} value={contrast} onChange={setContrast} />
                <LabeledRange label="Saturation" min={0} max={2} step={0.01} value={saturation} onChange={setSaturation} />
                <LabeledRange label="Gamma" min={0.1} max={3} step={0.01} value={gamma} onChange={setGamma} />
                <LabeledRange label="Background Blur" min={0} max={10} step={0.1} value={bgBlur} onChange={setBgBlur} />
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm w-16">Width</span>
                    <input className="border rounded px-2 py-1 w-full" type="number" placeholder="px" value={resizeWidth} onChange={(e) => setResizeWidth(e.target.value === '' ? '' : Number(e.target.value))} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm w-16">Height</span>
                    <input className="border rounded px-2 py-1 w-full" type="number" placeholder="px" value={resizeHeight} onChange={(e) => setResizeHeight(e.target.value === '' ? '' : Number(e.target.value))} />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-4">
              <h3 className="font-semibold mb-3">Batch Enhance</h3>
              <BatchEnhance />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function LabeledRange(props: { label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span>{props.label}</span>
        <span>{props.value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="w-full"
      />
    </div>
  )
}

function BatchEnhance() {
  const [files, setFiles] = useState<FileList | null>(null)
  const [results, setResults] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  async function run() {
    if (!files || files.length === 0) return
    const fd = new FormData()
    Array.from(files).forEach((f) => fd.append('images', f))
    fd.append('operation', 'auto')
    setBusy(true)
    try {
      const res = await fetch('/api/batch/enhance', { method: 'POST', body: fd })
      const json = await res.json()
      setResults(json.results?.map((r: any) => r.dataUrl) || [])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <input type="file" accept="image/png,image/jpeg" multiple onChange={(e) => setFiles(e.target.files)} />
      <button className="ml-2 px-3 py-2 rounded-md bg-primary-600 text-white disabled:opacity-50" onClick={run} disabled={!files || busy}>{busy ? 'Processing…' : 'Run'}</button>
      {results.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mt-3">
          {results.map((src, i) => (
            <img key={i} src={src} className="w-full h-32 object-cover rounded" />
          ))}
        </div>
      )}
    </div>
  )
}

export default App
