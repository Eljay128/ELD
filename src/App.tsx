import { useEffect, useState } from 'react';
import { catalogStats } from './catalog/index.ts';
import { useStore } from './model/store.ts';
import { importPeer } from './model/store.ts';
import { ShareCodeError, clearInbound, decodeProfile, readInboundCode } from './model/share.ts';
import { MyProfile } from './components/MyProfile.tsx';
import { Peers } from './components/Peers.tsx';
import { CoffeeRun } from './components/CoffeeRun.tsx';
import { Share } from './components/Share.tsx';
import { Settings } from './components/Settings.tsx';
import { useToast } from './components/ui.tsx';

type Tab = 'me' | 'peers' | 'run' | 'share' | 'settings';

const TABS: { id: Tab; label: string }[] = [
  { id: 'me', label: 'My profile' },
  { id: 'peers', label: 'People' },
  { id: 'run', label: 'Coffee run' },
  { id: 'share', label: 'Share' },
  { id: 'settings', label: 'Settings' },
];

export default function App() {
  const state = useStore();
  const [tab, setTab] = useState<Tab>('me');
  const [toast, showToast] = useToast();

  // A share link handed to the app: import it, then clean the URL so a refresh
  // does not re-import and the code does not linger in browser history.
  //
  // This listens for `hashchange` as well as running on mount, because pasting
  // a share link into a tab that already has the app open is a same-document
  // navigation — React never remounts, and without this the link would silently
  // do nothing.
  useEffect(() => {
    const consume = () => {
      const inbound = readInboundCode();
      if (!inbound) return;
      try {
        const profile = decodeProfile(inbound);
        const { status, peer } = importPeer(profile, 'link');
        showToast(
          status === 'self'
            ? 'That link was your own profile.'
            : status === 'added'
              ? `Added ${peer.profile.name || 'a new peer'} from the link`
              : status === 'updated'
                ? `Updated ${peer.profile.name || 'a peer'} from the link`
                : `${peer.profile.name || 'That peer'} was already up to date`,
        );
        if (status !== 'self') setTab('peers');
      } catch (e) {
        showToast(e instanceof ShareCodeError ? e.message : 'That link did not contain a readable profile.');
      } finally {
        clearInbound();
      }
    };

    consume();
    window.addEventListener('hashchange', consume);
    return () => window.removeEventListener('hashchange', consume);
  }, [showToast]);

  const stats = catalogStats();

  return (
    <div className="app">
      <header className="topbar">
        <div className="brandmark">
          <span className="dot">☕</span>
          <span>Pourfolio</span>
          <small className="tiny">your order, shared</small>
        </div>
        <nav className="tabs" aria-label="Sections">
          {TABS.map((t) => (
            <button key={t.id} className="tab" aria-current={tab === t.id} onClick={() => setTab(t.id)}>
              {t.label}
              {t.id === 'peers' && state.peers.length > 0 && <span className="count">{state.peers.length}</span>}
              {t.id === 'run' && state.runSelection.length > 0 && <span className="count">{state.runSelection.length}</span>}
            </button>
          ))}
        </nav>
      </header>

      <main>
        {tab === 'me' && (
          <MyProfile me={state.me} peerCount={state.peers.length} onToast={showToast} onGoToShare={() => setTab('share')} />
        )}
        {tab === 'peers' && <Peers peers={state.peers} runSelection={state.runSelection} />}
        {tab === 'run' && <CoffeeRun me={state.me} peers={state.peers} runSelection={state.runSelection} />}
        {tab === 'share' && <Share me={state.me} onImported={showToast} />}
        {tab === 'settings' && <Settings state={state} stats={stats} onToast={showToast} />}
      </main>

      {toast}
    </div>
  );
}
