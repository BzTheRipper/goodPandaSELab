import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Button, Icon } from '../ui/index.js';
import styles from './QrScanner.module.css';

/**
 * Camera QR scanner for hub staff. Reads the customer's QR and returns the secret token.
 * Falls back to manual entry in AdminPickup when no camera is available.
 */
export default function QrScanner({ onScan, busy }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const frameRef = useRef(null);
  const [state, setState] = useState('idle'); // idle | starting | scanning | error
  const [message, setMessage] = useState('');

  const stop = () => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    const stream = videoRef.current?.srcObject;
    stream?.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setState('idle');
  };

  const start = async () => {
    setState('starting');
    setMessage('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setState('scanning');

      const tick = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
          if (code?.data) {
            let token = null;
            try {
              const parsed = JSON.parse(code.data);
              token = parsed.token;
            } catch {
              token = code.data;
            }
            if (/^[a-f\d]{32}$/i.test(token || '')) {
              stop();
              onScan(token);
              return;
            }
            setMessage('That QR does not look like a GoodPanda pickup code.');
          }
        }
        frameRef.current = requestAnimationFrame(tick);
      };
      frameRef.current = requestAnimationFrame(tick);
    } catch (err) {
      setState('error');
      setMessage(err?.name === 'NotAllowedError' ? 'Camera access was blocked. Enter the code manually instead.' : 'No camera available. Enter the code manually instead.');
    }
  };

  useEffect(() => stop, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={styles.wrap}>
      <div className={styles.viewport} data-active={state === 'scanning'}>
        <video ref={videoRef} playsInline muted className={styles.video} />
        <canvas ref={canvasRef} className={styles.canvas} />
        {state !== 'scanning' && (
          <span className={styles.placeholder}>
            <Icon name="camera" size={28} />
            {state === 'starting' ? 'Starting camera…' : 'Camera ready to scan'}
          </span>
        )}
        {state === 'scanning' && <span className={styles.scanLine} aria-hidden="true" />}
      </div>
      {message && <p className={styles.message}>{message}</p>}
      <div className={styles.actions}>
        {state === 'scanning' ? (
          <Button variant="secondary" icon="x" onClick={stop}>
            Stop camera
          </Button>
        ) : (
          <Button variant="secondary" icon="camera" onClick={start} disabled={busy || state === 'starting'}>
            Scan customer QR
          </Button>
        )}
      </div>
    </div>
  );
}
