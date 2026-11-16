import React, { useEffect, useMemo, useRef, useState } from 'react';
import { TEAM_REGISTRATION_API } from '../lib/teamRegistration';

export interface FaceLivenessSession {
  challengeId: string;
  sessionId: string;
  region: string;
}

interface FaceLivenessFrameProps {
  session: FaceLivenessSession;
  idToken: string;
  onPassed: (proofToken: string) => void;
  onError: (message: string) => void;
}

const FRAME_ORIGIN = new URL(TEAM_REGISTRATION_API).origin;

export const FaceLivenessFrame: React.FC<FaceLivenessFrameProps> = ({
  session,
  idToken,
  onPassed,
  onError,
}) => {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [frameLoaded, setFrameLoaded] = useState(false);
  const nonce = useMemo(() => session.challengeId, [session.challengeId]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== FRAME_ORIGIN || event.source !== frameRef.current?.contentWindow) return;
      if (!event.data || typeof event.data !== 'object') return;
      const data = event.data as { type?: string; nonce?: string; proofToken?: string; message?: string };
      if (data.nonce !== nonce) return;
      if (data.type === 'sipandu:liveness:passed') {
        if (typeof data.proofToken === 'string' && /^[0-9a-f-]{36}\.[0-9a-f-]{36}$/i.test(data.proofToken)) {
          onPassed(data.proofToken);
        } else {
          onError('Bukti verifikasi wajah yang diterima tidak valid. Mulai sesi baru.');
        }
      } else if (data.type === 'sipandu:liveness:error') {
        onError(typeof data.message === 'string' ? data.message : 'Pemeriksaan wajah terhenti. Mulai sesi baru.');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [nonce, onError, onPassed]);

  useEffect(() => {
    if (!frameLoaded || !idToken || !frameRef.current?.contentWindow) return;
    frameRef.current.contentWindow.postMessage({
      type: 'sipandu:liveness:init',
      nonce,
      challengeId: session.challengeId,
      sessionId: session.sessionId,
      region: session.region,
      idToken,
    }, FRAME_ORIGIN);
  }, [frameLoaded, idToken, nonce, session]);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <iframe
        ref={frameRef}
        title="Pemeriksaan wajah hidup SIPANDU"
        src={`${TEAM_REGISTRATION_API}/liveness/ui`}
        onLoad={() => setFrameLoaded(true)}
        allow="camera"
        sandbox="allow-scripts allow-same-origin"
        referrerPolicy="no-referrer"
        className="block min-h-[420px] w-full border-0"
      />
    </div>
  );
};
