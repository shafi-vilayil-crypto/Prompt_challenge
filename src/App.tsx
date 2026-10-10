import { configured } from './lib/supabase';
import { Suspense, lazy } from 'react';
import Student, { Brand } from './pages/Student';

// The teacher screens (QR code, AI scoring) load only on /teacher, so students' phones download less.
const Teacher = lazy(() => import('./pages/Teacher'));

export default function App() {
  if (!configured) {
    return (
      <main className="page narrow">
        <Brand />
        <div className="card stack">
          <h2>Setup needed</h2>
          <p className="muted">
            Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> (in <code>.env</code> locally, or in
            Vercel → Settings → Environment Variables), then build again.
          </p>
        </div>
      </main>
    );
  }
  return window.location.pathname.replace(/\/+$/, '') === '/teacher' ? (
    <Suspense fallback={<main className="page narrow"><p className="muted">Loading…</p></main>}>
      <Teacher />
    </Suspense>
  ) : (
    <Student />
  );
}
