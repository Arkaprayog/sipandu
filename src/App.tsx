import React, { useState, useEffect } from 'react';
import { PPKSRecord, ProfileUser, AppSettings } from './types';
import { initialPPKSList, initialProfileUser, initialAppSettings } from './data/initialData';
import { LoginPage } from './components/LoginPage';
import { Header } from './components/Header';
import { BottomNav, TabKey } from './components/BottomNav';
import { BerandaView } from './components/BerandaView';
import { DatabasePpksView } from './components/DatabasePpksView';
import { AsesmenView } from './components/AsesmenView';
import { FromAsesmenTerintegrasiView } from './components/FromAsesmenTerintegrasiView';
import { DokumenView } from './components/DokumenView';
import { EditProfileModal } from './components/EditProfileModal';
import { SettingsModal } from './components/SettingsModal';
import { NotificationsModal } from './components/NotificationsModal';
import { GoogleWorkspaceModal } from './components/GoogleWorkspaceModal';
import { onAuthStateChanged, signOut, getIdTokenResult } from 'firebase/auth';
import { auth } from './lib/firebase';

export default function App() {
  // Firebase Authentication is the source of truth; URL/localStorage flags cannot bypass login.
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [currentUserName, setCurrentUserName] = useState('');
  const [currentUserRole, setCurrentUserRole] = useState('');
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setAuthReady(false);
      setAuthError('');
      if (!user) {
        setIsAuthenticated(false);
        setCurrentUserName('');
        setCurrentUserRole('');
        setAuthReady(true);
        return;
      }
      try {
        const token = await getIdTokenResult(user, true);
        const role = token.claims.role;
        if (role !== 'owner' && role !== 'supervisor' && role !== 'pendamping') {
          setIsAuthenticated(false);
          setCurrentUserRole('');
          setAuthError('Akun berhasil dikenali, tetapi peran resmi belum ditetapkan. Hubungi administrator SIPANDU.');
          await signOut(auth);
        } else {
          setIsAuthenticated(true);
          setCurrentUserRole(role);
          setCurrentUserName(user.displayName || user.email || '');
        }
      } catch (error) {
        console.error('Gagal memverifikasi peran SIPANDU:', error);
        setIsAuthenticated(false);
        setCurrentUserRole('');
        setAuthError('Sesi tidak dapat diverifikasi. Silakan masuk kembali atau hubungi administrator.');
        await signOut(auth);
      } finally {
        setAuthReady(true);
      }
    });
    return unsubscribe;
  }, []);

  // App Navigation tab
  const [activeTab, setActiveTab] = useState<TabKey>('beranda');

  // Master Data in state (with localStorage caching)
  const [ppksList, setPpksList] = useState<PPKSRecord[]>(() => {
    const cached = localStorage.getItem('sipandu_ppks');
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {
        console.error('Failed to parse cached PPKS list', e);
      }
    }
    return initialPPKSList;
  });

  const [profile, setProfile] = useState<ProfileUser>(() => {
    const cached = localStorage.getItem('sipandu_profile');
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {
        console.error('Failed to parse cached profile', e);
      }
    }
    return initialProfileUser;
  });

  const [settings, setSettings] = useState<AppSettings>(() => {
    const cached = localStorage.getItem('sipandu_settings');
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {
        console.error('Failed to parse cached settings', e);
      }
    }
    return initialAppSettings;
  });

  // Modals state
  const [isEditProfileOpen, setIsEditProfileOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState<boolean>(false);
  const [isGoogleWorkspaceOpen, setIsGoogleWorkspaceOpen] = useState<boolean>(false);

  // Sync to local storage
  useEffect(() => {
    localStorage.setItem('sipandu_ppks', JSON.stringify(ppksList));
  }, [ppksList]);

  useEffect(() => {
    localStorage.setItem('sipandu_profile', JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    localStorage.setItem('sipandu_settings', JSON.stringify(settings));
  }, [settings]);

  // Auth Handlers
  const handleLogin = (user: string) => {
    // Firebase's auth-state observer updates the authenticated UI after sign-in.
    setCurrentUserName(user);
  };

  const handleLogout = async () => {
    if (window.confirm('Apakah Anda yakin ingin keluar dari aplikasi SIPANDU ODHIV?')) {
      await signOut(auth);
      setIsAuthenticated(false);
      setCurrentUserName('');
    }
  };

  // Data update handlers
  const handleUpdatePPKS = (updated: PPKSRecord) => {
    setPpksList((prev) =>
      prev.map((item) => (item.id === updated.id ? updated : item))
    );
  };

  const handleAddNewPPKS = (newPPKS: PPKSRecord) => {
    setPpksList((prev) => [newPPKS, ...prev]);
  };

  // Avoid showing protected UI until Firebase has resolved the current session.
  if (!authReady) {
    return <div className="min-h-screen flex items-center justify-center bg-[#0a140b] text-emerald-200">Memeriksa sesi SIPANDU…</div>;
  }

  // If not logged in, render Part 1: Landing Page / Login
  if (!isAuthenticated) {
    return (
      <>
        {authError && <div role="alert" className="fixed top-3 left-3 right-3 z-50 mx-auto max-w-lg rounded-lg border border-amber-500/50 bg-amber-950/95 p-3 text-sm text-amber-100">{authError}</div>}
        <LoginPage onLogin={handleLogin} />
      </>
    );
  }

  // Part 2: DASHBOARD
  return (
    <div className="min-h-screen w-full bg-[#0a140b] text-white flex flex-col justify-between selection:bg-emerald-600 selection:text-white overflow-x-hidden relative">
      {/* Background ambient lighting: deep moss green with subtle black vignetting and crimson outline aura */}
      <div className="fixed inset-0 bg-radial-[at_top_right] from-[#17301b]/80 via-[#0a140b] to-[#040905] pointer-events-none" />
      <div className="fixed -top-40 -left-40 w-96 h-96 rounded-full bg-rose-600/10 blur-3xl pointer-events-none" />
      <div className="fixed top-1/2 -right-40 w-96 h-96 rounded-full bg-emerald-600/10 blur-3xl pointer-events-none" />

      {/* Top Header: Selamat (waktu live), Profil Owner di pojok kiri atas, 3 Icon di pojok kanan atas */}
      <div className="relative z-20 app-header">
        <Header
          currentUser={currentUserName}
          profile={profile}
          unreadNotificationsCount={2}
          onOpenEditProfile={() => setIsEditProfileOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenNotifications={() => setIsNotificationsOpen(true)}
          onOpenGoogleWorkspace={() => setIsGoogleWorkspaceOpen(true)}
          onLogout={handleLogout}
        />
      </div>

      {/* Main Dashboard Content Area */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 pb-28">
        {activeTab === 'beranda' && (
          <BerandaView
            ppksList={ppksList}
            googleSpreadsheetUrl={settings.googleSpreadsheetUrl}
          />
        )}

        {activeTab === 'database-ppks' && (
          <DatabasePpksView
            ppksList={ppksList}
            onUpdatePPKS={handleUpdatePPKS}
            settings={settings}
          />
        )}

        {activeTab === 'asesmen' && (
          <AsesmenView
            ppksList={ppksList}
            onAddNewPPKS={handleAddNewPPKS}
            settings={settings}
          />
        )}

        {activeTab === 'from-asesmen-terintegrasi' && (
          <FromAsesmenTerintegrasiView
            ppksList={ppksList}
            onUpdatePPKS={handleUpdatePPKS}
          />
        )}

        {activeTab === 'dokumen' && <DokumenView />}
      </main>

      {/* Bottom Navigation Bar: BERANDA - DATABASE PPKS - ASESMEN - FROM ASESMEN TERINTEGRASI - DOKUMEN */}
      <BottomNav activeTab={activeTab} onSelectTab={setActiveTab} />

      {/* Modals */}
      <EditProfileModal
        isOpen={isEditProfileOpen}
        onClose={() => setIsEditProfileOpen(false)}
        profile={profile}
        onSave={(updated) => setProfile(updated)}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSave={(updated) => setSettings(updated)}
      />

      <NotificationsModal
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
      />

      <GoogleWorkspaceModal
        isOpen={isGoogleWorkspaceOpen}
        onClose={() => setIsGoogleWorkspaceOpen(false)}
        ppksList={ppksList}
        settings={settings}
        onUpdateSettings={(updated) => setSettings(updated)}
      />
    </div>
  );
}
