'use client';
import { useEffect, useRef } from 'react';
import { Phone, PhoneOff, Video, Mic, MicOff, VideoOff, ScreenShare, ScreenShareOff, Users } from 'lucide-react';
import { useCall } from '@/context/Call';
import { Avatar } from './ui';
import { cn } from '@/lib/utils';

function Video_({ stream, muted, name, active, big }: { stream: MediaStream | null; muted?: boolean; name: string; active: boolean; big?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream || null; }, [stream]);
  const hasVideo = !!stream?.getVideoTracks().some((t) => t.enabled);
  return (
    <div className={cn('relative flex items-center justify-center overflow-hidden rounded-xl bg-[#0d1414]', big ? 'h-full w-full' : 'aspect-video')}>
      {hasVideo ? <video ref={ref} autoPlay playsInline muted={muted} className="h-full w-full object-cover" /> : <Avatar person={{ name }} size={big ? 88 : 56} />}
      <span className="absolute bottom-2 left-2 rounded bg-black/50 px-2 py-0.5 text-xs text-white">{name}</span>
      {!active && <span className="absolute right-2 top-2 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white/80">connecting...</span>}
    </div>
  );
}

export function CallOverlay() {
  const { call, incoming, peers, localStream, muted, cameraOff, sharing, canShare, accept, reject, leave, endForAll, toggleMic, toggleCam, toggleScreen } = useCall();

  if (incoming && !call) {
    return (
      <div className="fixed inset-x-0 top-4 z-[90] mx-auto w-[min(92vw,380px)] animate-[fadeIn_.15s_ease-out]">
        <div className="card flex items-center gap-3 p-4 shadow-2xl">
          <Avatar person={{ name: incoming.from.name, avatar: incoming.from.avatar }} size={44} />
          <div className="min-w-0 flex-1"><p className="truncate font-medium">{incoming.from.name}</p><p className="text-xs text-muted">Incoming {incoming.type} call{incoming.count > 2 ? ` - ${incoming.count} people` : ''}</p></div>
          <button onClick={reject} aria-label="Decline" className="flex h-10 w-10 items-center justify-center rounded-full bg-danger text-white hover:opacity-90"><PhoneOff size={18} /></button>
          <button onClick={accept} aria-label="Accept" className="flex h-10 w-10 items-center justify-center rounded-full bg-ok text-white hover:opacity-90"><Phone size={18} /></button>
        </div>
      </div>
    );
  }
  if (!call) return null;

  const total = peers.length + 1;
  const cols = total <= 1 ? 1 : total <= 4 ? 2 : total <= 9 ? 3 : 4;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-[#0a1113] text-white">
      <div className="flex items-center justify-between px-4 py-3 text-sm text-white/70">
        <span className="flex items-center gap-2"><Users size={15} />{call.title || (call.mode === 'group' ? 'Group call' : 'Call')} - {total} {total === 1 ? 'person' : 'people'}</span>
        <span className={cn('rounded-full px-2 py-0.5 text-xs', call.phase === 'connected' ? 'bg-ok/20 text-ok' : 'bg-accent/20 text-accent')}>{call.phase === 'connected' ? 'Connected' : 'Ringing...'}</span>
      </div>
      <div className="grid flex-1 gap-2 overflow-auto p-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {call.type === 'video' || sharing ? (
          <>
            <Video_ stream={localStream} muted name="You" active />
            {peers.map((p) => <Video_ key={p.socketId} stream={p.stream || null} name={p.name} active={p.state === 'connected'} />)}
          </>
        ) : (
          <>
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl bg-white/5 p-6"><Avatar person={{ name: 'You' }} size={64} />{muted && <MicOff size={14} className="text-danger" />}</div>
            {peers.map((p) => <div key={p.socketId} className="flex flex-col items-center justify-center gap-2 rounded-xl bg-white/5 p-6"><Avatar person={p} size={64} />{!p.audio && <MicOff size={14} className="text-danger" />}{p.state !== 'connected' && <span className="text-xs text-white/50">connecting...</span>}</div>)}
          </>
        )}
      </div>
      <div className="flex items-center justify-center gap-3 pb-8 pt-2">
        <button onClick={toggleMic} aria-label={muted ? 'Unmute' : 'Mute'} className={cn('flex h-12 w-12 items-center justify-center rounded-full', muted ? 'bg-white text-ink' : 'bg-white/15 hover:bg-white/25')}>{muted ? <MicOff size={20} /> : <Mic size={20} />}</button>
        <button onClick={toggleCam} aria-label={cameraOff ? 'Turn camera on' : 'Turn camera off'} className={cn('flex h-12 w-12 items-center justify-center rounded-full', cameraOff ? 'bg-white text-ink' : 'bg-white/15 hover:bg-white/25')}>{cameraOff ? <VideoOff size={20} /> : <Video size={20} />}</button>
        {canShare && <button onClick={toggleScreen} aria-label={sharing ? 'Stop sharing' : 'Share screen'} className={cn('flex h-12 w-12 items-center justify-center rounded-full', sharing ? 'bg-brand text-brand-ink' : 'bg-white/15 hover:bg-white/25')}>{sharing ? <ScreenShareOff size={20} /> : <ScreenShare size={20} />}</button>}
        <button onClick={leave} aria-label="Leave call" className="flex h-12 w-16 items-center justify-center rounded-full bg-danger hover:opacity-90"><PhoneOff size={20} /></button>
        {call.isHost && call.mode === 'group' && <button onClick={endForAll} className="btn-ghost !border-white/20 !bg-transparent !text-white/80 hover:!bg-white/10">End for everyone</button>}
      </div>
    </div>
  );
}
