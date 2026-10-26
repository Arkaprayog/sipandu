import React from 'react';
import App from './App';
import { createRoot } from 'react-dom/client';
import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  const message = 'Elemen #root tidak ditemukan pada index.html SIPANDU.';
  document.body.textContent = message;
  throw new Error(message);
}

const root = createRoot(rootElement);
let appLoaded = false;

class StartupErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };

  static getDerivedStateFromError(error: unknown) {
    return {
      error: error instanceof Error
        ? [`${error.name}: ${error.message}`, error.stack || ''].filter(Boolean).join('\\n')
        : String(error),
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('SIPANDU crashed while rendering the application:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <main style={{ minHeight: '70vh', display: 'grid', placeItems: 'center', padding: 20, color: '#1f2937', background: '#fff7f7', fontFamily: 'system-ui,sans-serif' }}>
          <section role="alert" aria-live="assertive" style={{ boxSizing: 'border-box', width: '100%', maxWidth: 680, padding: 20, border: '1px solid #b91c1c', borderRadius: 14, background: '#fff', overflowWrap: 'anywhere' }}>
            <h1 style={{ margin: '0 0 8px', color: '#991b1b', fontSize: 20 }}>SIPANDU mengalami kesalahan saat dibuka</h1>
            <p style={{ margin: '8px 0', fontSize: 14, lineHeight: 1.5 }}>
              Modul utama berhasil diunduh, tetapi antarmuka mengalami kesalahan saat dirender. Data browser tidak dihapus.
            </p>
            <code style={{ display: 'block', whiteSpace: 'pre-wrap', padding: 10, background: '#fee2e2', borderRadius: 8, fontSize: 12 }}>{this.state.error.slice(0, 3000)}</code>
            <button type="button" onClick={() => window.location.reload()} style={{ marginTop: 14, padding: '10px 16px', border: 0, borderRadius: 10, background: '#166534', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
              Muat ulang aplikasi
            </button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}

const retryButton = () => (
  <button
    type="button"
    onClick={() => window.location.reload()}
    style={{
      marginTop: 14,
      padding: '10px 16px',
      border: 0,
      borderRadius: 10,
      background: '#166534',
      color: '#fff',
      fontWeight: 700,
      cursor: 'pointer',
    }}
  >
    Muat ulang aplikasi
  </button>
);

root.render(
  <main
    role="status"
    aria-live="polite"
    style={{
      minHeight: '70vh',
      display: 'grid',
      placeItems: 'center',
      padding: 24,
      color: '#ecfdf5',
      background: '#0b140c',
      fontFamily: 'system-ui, sans-serif',
      textAlign: 'center',
    }}
  >
    <div style={{ maxWidth: 420 }}>
      <div
        aria-hidden="true"
        style={{
          width: 38,
          height: 38,
          margin: '0 auto 18px',
          border: '3px solid rgba(110,231,183,.25)',
          borderTopColor: '#6ee7b7',
          borderRadius: '50%',
          animation: 'sipandu-spin 0.9s linear infinite',
        }}
      />
      <h1 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 800 }}>SIPANDU sedang dimuat</h1>
      <p style={{ margin: 0, color: '#a7f3d0', fontSize: 13, lineHeight: 1.6 }}>
        Menyiapkan antarmuka dan memeriksa modul aplikasi. Data browser tidak dihapus.
      </p>
      <style>{'@keyframes sipandu-spin{to{transform:rotate(360deg)}}'}</style>
    </div>
  </main>
);

const loadingTimer = window.setTimeout(() => {
  if (appLoaded) return;
  root.render(
    <main style={{ minHeight: '70vh', display: 'grid', placeItems: 'center', padding: 24, color: '#fff', background: '#0b140c', fontFamily: 'system-ui,sans-serif' }}>
      <section role="status" style={{ maxWidth: 520, textAlign: 'center' }}>
        <h1 style={{ color: '#fde68a', fontSize: 20, fontWeight: 800 }}>SIPANDU masih memuat</h1>
        <p style={{ color: '#d1d5db', fontSize: 13, lineHeight: 1.6 }}>
          Modul aplikasi belum selesai dimuat. Periksa koneksi internet; jika pesan tetap muncul, tekan muat ulang dan periksa URL aset yang gagal pada halaman diagnostik.
        </p>
        {retryButton()}
      </section>
    </main>
  );
}, 20000);

// The main application is bundled into the entry module. This deliberately avoids
// a second network request for App-[hash].js, which can fail when a custom domain
// serves a stale/mismatched deployment artifact.
window.setTimeout(() => {
  appLoaded = true;
  window.clearTimeout(loadingTimer);
  root.render(<StartupErrorBoundary><App /></StartupErrorBoundary>);
}, 40);
