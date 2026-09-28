'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Pencil, Square, Circle, Type as TypeIcon, Eraser, Trash2, Save, MousePointer2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useSocket } from '@/context/Socket';
import { useApp } from '@/context/App';
import { useToast } from '@/context/Toast';
import { PageLoader } from '@/components/ui';
import { cn } from '@/lib/utils';

type Tool = 'pen' | 'line' | 'rect' | 'ellipse' | 'text' | 'eraser';
type El = { id: string; type: 'pen' | 'line' | 'rect' | 'ellipse' | 'text'; color: string; width: number; points?: number[][]; x?: number; y?: number; w?: number; h?: number; text?: string };
const COLORS = ['#15222B', '#C8443A', '#2F7FB8', '#1F8A5B', '#F2B632', '#7C3AED'];
const uid = () => Math.random().toString(36).slice(2, 10);

function draw(ctx: CanvasRenderingContext2D, el: El) {
  ctx.strokeStyle = el.color; ctx.fillStyle = el.color; ctx.lineWidth = el.width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (el.type === 'pen' && el.points?.length) { ctx.beginPath(); ctx.moveTo(el.points[0][0], el.points[0][1]); el.points.slice(1).forEach((p) => ctx.lineTo(p[0], p[1])); ctx.stroke(); }
  else if (el.type === 'line' && el.points?.length === 2) { ctx.beginPath(); ctx.moveTo(el.points[0][0], el.points[0][1]); ctx.lineTo(el.points[1][0], el.points[1][1]); ctx.stroke(); }
  else if (el.type === 'rect' && el.x !== undefined) { ctx.strokeRect(el.x, el.y!, el.w!, el.h!); }
  else if (el.type === 'ellipse' && el.x !== undefined) { ctx.beginPath(); ctx.ellipse(el.x + el.w! / 2, el.y! + el.h! / 2, Math.abs(el.w! / 2), Math.abs(el.h! / 2), 0, 0, Math.PI * 2); ctx.stroke(); }
  else if (el.type === 'text' && el.text) { ctx.font = `${14 + el.width * 3}px var(--font-body), sans-serif`; ctx.fillText(el.text, el.x!, el.y!); }
}

export default function WhiteboardRoom() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { socket } = useSocket();
  const { can } = useApp();
  const toast = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const els = useRef<Map<string, El>>(new Map());
  const drawing = useRef<El | null>(null);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(3);
  const [ready, setReady] = useState(false);
  const [canDraw, setCanDraw] = useState(false);
  const [name, setName] = useState('');
  const [cursors, setCursors] = useState<Map<string, { name: string; x: number; y: number }>>(new Map());
  const [dpr] = useState(() => (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1));

  const repaint = useCallback(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d')!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, c.width, c.height);
    els.current.forEach((el) => draw(ctx, el));
  }, [dpr]);

  const resize = useCallback(() => {
    const c = canvasRef.current, wrap = wrapRef.current; if (!c || !wrap) return;
    c.width = wrap.clientWidth * dpr; c.height = wrap.clientHeight * dpr;
    c.style.width = wrap.clientWidth + 'px'; c.style.height = wrap.clientHeight + 'px';
    repaint();
  }, [dpr, repaint]);

  useEffect(() => {
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [resize]);

  useEffect(() => {
    if (!socket) return;
    let alive = true;
    (async () => {
      try {
        // full document (including `elements`, which the list endpoint omits) so the canvas can be repainted
        const meta = await api.get(`/whiteboards/${id}`);
        if (!alive) return;
        setName(meta.data.name);
        els.current = new Map((meta.data.elements || []).map((el: El) => [el.id, el]));
        repaint();
      } catch (e) { toast((e as Error).message, 'error'); router.push('/whiteboard'); return; }
      socket.emit('wb:join', { boardId: id }, (res: any) => {
        if (!alive) return;
        if (!res?.ok) { toast(res?.error || 'Could not open this board', 'error'); router.push('/whiteboard'); return; }
        setCanDraw(res.canDraw); setReady(true);
      });
    })();
    return () => { alive = false; socket.emit('wb:leave', { boardId: id }); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, id]);

  useEffect(() => {
    if (!socket) return;
    const onLive = ({ from, element }: any) => { if (from !== socket.id) { els.current.set(element.id, element); repaint(); } };
    const onCommit = ({ element }: any) => { els.current.set(element.id, element); repaint(); };
    const onRemove = ({ elementId }: any) => { els.current.delete(elementId); repaint(); };
    const onClear = () => { els.current.clear(); repaint(); };
    const onCursor = ({ from, name, x, y }: any) => setCursors((m) => new Map(m).set(from, { name, x, y }));
    const onUser = ({ socketId }: any) => setCursors((m) => { const n = new Map(m); n.delete(socketId); return n; });
    socket.on('wb:live', onLive); socket.on('wb:commit', onCommit); socket.on('wb:remove', onRemove); socket.on('wb:clear', onClear); socket.on('wb:cursor', onCursor); socket.on('wb:user', onUser);
    return () => { socket.off('wb:live', onLive); socket.off('wb:commit', onCommit); socket.off('wb:remove', onRemove); socket.off('wb:clear', onClear); socket.off('wb:cursor', onCursor); socket.off('wb:user', onUser); };
  }, [socket, repaint]);

  const pos = (e: React.PointerEvent) => { const r = canvasRef.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as [number, number]; };

  function pointerDown(e: React.PointerEvent) {
    if (!canDraw) return;
    const [x, y] = pos(e);
    if (tool === 'text') {
      const text = prompt('Text:'); if (!text) return;
      const el: El = { id: uid(), type: 'text', color, width, x, y, text };
      els.current.set(el.id, el); repaint(); socket?.emit('wb:commit', { boardId: id, element: el });
      return;
    }
    if (tool === 'eraser') { eraseAt(x, y); return; }
    drawing.current = { id: uid(), type: tool as any, color, width, points: [[x, y]], x, y, w: 0, h: 0 };
    (e.target as Element).setPointerCapture(e.pointerId);
  }
  function pointerMove(e: React.PointerEvent) {
    const [x, y] = pos(e);
    socket?.emit('wb:cursor', { boardId: id, x, y });
    if (tool === 'eraser' && e.buttons === 1) { eraseAt(x, y); return; }
    if (!drawing.current) return;
    const el = drawing.current;
    if (el.type === 'pen') el.points!.push([x, y]);
    else if (el.type === 'line') el.points = [el.points![0], [x, y]];
    else { el.w = x - el.x!; el.h = y - el.y!; }
    els.current.set(el.id, el); repaint();
    socket?.emit('wb:live', { boardId: id, element: el });
  }
  function pointerUp() {
    if (!drawing.current) return;
    const el = drawing.current; drawing.current = null;
    if (['rect', 'ellipse'].includes(el.type) && el.w! < 0) { el.x! += el.w!; el.w = Math.abs(el.w!); }
    if (['rect', 'ellipse'].includes(el.type) && el.h! < 0) { el.y! += el.h!; el.h = Math.abs(el.h!); }
    socket?.emit('wb:commit', { boardId: id, element: el });
  }
  function eraseAt(x: number, y: number) {
    for (const [key, el] of els.current) {
      const hit = el.type === 'pen' || el.type === 'line' ? el.points?.some((p) => Math.hypot(p[0] - x, p[1] - y) < 12) : el.x !== undefined && x > el.x - 6 && x < el.x + (el.w || 0) + 6 && y > el.y! - 6 && y < el.y! + (el.h || 0) + 6;
      if (hit) { els.current.delete(key); repaint(); socket?.emit('wb:remove', { boardId: id, elementId: key }); break; }
    }
  }
  async function clearAll() { if (confirm('Clear the whole board? This cannot be undone.')) { els.current.clear(); repaint(); socket?.emit('wb:clear', { boardId: id }); } }
  async function saveSnapshot() {
    try { await api.put(`/whiteboards/${id}/elements`, { elements: [...els.current.values()] }); toast('Board saved'); } catch (e) { toast((e as Error).message, 'error'); }
  }

  const Btn = ({ t, icon: I }: { t: Tool; icon: any }) => <button aria-label={t} aria-pressed={tool === t} onClick={() => setTool(t)} className={cn('flex h-9 w-9 items-center justify-center rounded-lg', tool === t ? 'bg-brand text-brand-ink' : 'hover:bg-surface2')}><I size={17} /></button>;

  return (
    <div className="-m-4 flex h-[calc(100%+2rem)] flex-col sm:-m-6 sm:h-[calc(100%+3rem)] lg:-m-8 lg:h-[calc(100%+4rem)]">
      <div className="flex items-center gap-2 border-b border-line bg-surface px-3 py-2">
        <button onClick={() => router.push('/whiteboard')} className="btn-quiet !p-2" aria-label="Back"><ArrowLeft size={17} /></button>
        <span className="mr-2 truncate text-sm font-medium">{name}</span>
        {canDraw && <>
          <div className="flex items-center gap-0.5 rounded-lg border border-line p-0.5">
            <Btn t="pen" icon={Pencil} /><Btn t="line" icon={MousePointer2} /><Btn t="rect" icon={Square} /><Btn t="ellipse" icon={Circle} /><Btn t="text" icon={TypeIcon} /><Btn t="eraser" icon={Eraser} />
          </div>
          <div className="flex items-center gap-1">{COLORS.map((c) => <button key={c} onClick={() => setColor(c)} aria-label={c} className={cn('h-6 w-6 rounded-full', color === c && 'ring-2 ring-ink ring-offset-1 ring-offset-surface')} style={{ background: c }} />)}</div>
          <input type="range" min={1} max={10} value={width} onChange={(e) => setWidth(+e.target.value)} className="w-20" aria-label="Brush size" />
        </>}
        <div className="ml-auto flex gap-2">{canDraw && <button className="btn-quiet !py-1.5 text-sm" onClick={clearAll}><Trash2 size={14} />Clear</button>}<button className="btn-ghost !py-1.5 text-sm" onClick={saveSnapshot}><Save size={14} />Save</button></div>
      </div>
      <div ref={wrapRef} className="relative flex-1 overflow-hidden bg-[repeating-linear-gradient(0deg,transparent,transparent_23px,rgb(var(--line))_24px),repeating-linear-gradient(90deg,transparent,transparent_23px,rgb(var(--line))_24px)]">
        {!ready && <div className="absolute inset-0 flex items-center justify-center bg-surface"><PageLoader /></div>}
        <canvas ref={canvasRef} className={cn('absolute inset-0 h-full w-full', canDraw ? tool === 'eraser' ? 'cursor-cell' : 'cursor-crosshair' : 'cursor-not-allowed')}
          onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerLeave={pointerUp} />
        {[...cursors].map(([sid, c]) => <div key={sid} className="pointer-events-none absolute z-10 -translate-x-0.5 -translate-y-0.5" style={{ left: c.x, top: c.y }}><div className="h-2.5 w-2.5 rounded-full bg-brand" /><span className="ml-2 -mt-1 whitespace-nowrap rounded bg-ink px-1.5 py-0.5 text-[10px] text-bg">{c.name}</span></div>)}
        {ready && !canDraw && <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-surface px-3 py-1 text-xs text-muted shadow">View only - your role cannot draw</p>}
      </div>
    </div>
  );
}
