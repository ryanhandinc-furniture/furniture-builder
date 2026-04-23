import { useCallback, useRef, useState } from 'react';
import type { Plan } from '../types';

// Same pattern as api/client.ts — in dev, VITE_API_URL is undefined and Vite's
// proxy forwards /api/* to localhost:4000. In production on Vercel, this is
// set to the Render backend URL so the XHR upload hits the backend directly
// instead of the Vercel origin (which has no API routes and returns 405).
const API_BASE: string = import.meta.env.VITE_API_URL ?? '';

export function UploadView({ onUploaded }: { onUploaded: (plan: Plan) => void }) {
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(
    async (file: File) => {
      setError(null);
      setProgress(0);
      try {
        // We use XHR rather than fetch so we can display an upload progress bar.
        // Once the server finishes saving, it returns the Plan record; background
        // AI extraction proceeds asynchronously.
        const plan = await new Promise<Plan>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', `${API_BASE}/api/plans/upload`);
          xhr.upload.onprogress = (ev) => {
            if (ev.lengthComputable) {
              setProgress(Math.round((ev.loaded / ev.total) * 100));
            }
          };
          xhr.onload = () => {
            setProgress(100);
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const body = JSON.parse(xhr.responseText);
                resolve(body.plan as Plan);
              } catch (e) {
                reject(e);
              }
            } else {
              try {
                const body = JSON.parse(xhr.responseText);
                reject(new Error(body.error ?? `HTTP ${xhr.status}`));
              } catch {
                reject(new Error(`HTTP ${xhr.status}`));
              }
            }
          };
          xhr.onerror = () => reject(new Error('Network error'));
          const fd = new FormData();
          fd.append('file', file);
          xhr.send(fd);
        });
        onUploaded(plan);
      } catch (e) {
        setError((e as Error).message);
        setProgress(null);
      }
    },
    [onUploaded],
  );

  return (
    <div className="card" style={{ maxWidth: 680 }}>
      <h2>Upload an architectural plan</h2>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        Drop a PDF, PNG, or JPG. Multi-page PDFs are processed page-by-page.
        After upload, AI extraction runs automatically — you'll see status in
        the sidebar.
      </p>

      <div
        className={`dropzone ${dragging ? 'drag' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) upload(file);
        }}
        onClick={() => inputRef.current?.click()}
        style={{ cursor: 'pointer', marginTop: 16 }}
      >
        <div style={{ fontSize: 32 }}>⬆</div>
        <div style={{ fontWeight: 500 }}>Drop a plan here, or click to browse</div>
        <p>PDF, PNG, JPG (max 50 MB)</p>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
          }}
        />
      </div>

      {progress !== null && (
        <div style={{ marginTop: 20 }}>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
            {progress < 100
              ? `Uploading… ${progress}%`
              : 'Upload complete. AI analysis running.'}
          </div>
        </div>
      )}

      {error && (
        <div style={{ marginTop: 16, color: 'var(--danger)', fontSize: 13 }}>
          {error}
        </div>
      )}
    </div>
  );
}
