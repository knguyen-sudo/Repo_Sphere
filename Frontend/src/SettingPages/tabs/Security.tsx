import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';

type SecuritySession = {
  id: string;
  device: string;
  location: string;
  startedAt: string;
  endedAt?: string;
};

type OAuthSecurityState = {
  connected: boolean;
  lastLogin: string;
  scopes: string[];
  activeSessions: SecuritySession[];
  previousSessions: SecuritySession[];
  requireReauth: boolean;
};

const MAX_PREVIOUS_SESSIONS = 20;

const formatNow = () => new Date().toLocaleString();

const getDeviceLabel = () => {
  if (typeof navigator === 'undefined') {
    return 'Unknown Device';
  }

  return navigator.userAgent;
};

const getLocationLabel = () => {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return timezone ? `Approx. ${timezone}` : 'Unknown location';
};

const buildCurrentSession = (): SecuritySession => ({
  id: `session-${Date.now()}`,
  device: getDeviceLabel(),
  location: getLocationLabel(),
  startedAt: formatNow(),
});

const normalizeState = (raw: unknown): OAuthSecurityState => {
  const fallbackActiveSession = [buildCurrentSession()];

  if (!raw || typeof raw !== 'object') {
    return {
      connected: true,
      lastLogin: formatNow(),
      scopes: ['read:user', 'repo'],
      activeSessions: fallbackActiveSession,
      previousSessions: [],
      requireReauth: false,
    };
  }

  const parsed = raw as Partial<OAuthSecurityState> & {
    sessions?: Array<{ device: string; location: string; date: string }>;
  };

  const migratedActive = Array.isArray(parsed.activeSessions)
    ? parsed.activeSessions
    : (parsed.sessions || []).map((s, index) => ({
        id: `legacy-active-${index}`,
        device: s.device,
        location: s.location,
        startedAt: s.date,
      }));

  return {
    connected: typeof parsed.connected === 'boolean' ? parsed.connected : true,
    lastLogin: typeof parsed.lastLogin === 'string' ? parsed.lastLogin : formatNow(),
    scopes: Array.isArray(parsed.scopes) ? parsed.scopes : ['read:user', 'repo'],
    activeSessions: migratedActive.length ? migratedActive : fallbackActiveSession,
    previousSessions: Array.isArray(parsed.previousSessions) ? parsed.previousSessions : [],
    requireReauth: typeof parsed.requireReauth === 'boolean' ? parsed.requireReauth : false,
  };
};

const defaultState: OAuthSecurityState = {
  connected: true,
  lastLogin: formatNow(),
  scopes: ['read:user', 'repo'],
  activeSessions: [buildCurrentSession()],
  previousSessions: [],
  requireReauth: false,
};

export const Security = () => {
  const [connected, setConnected] = useState(defaultState.connected);
  const [lastLogin, setLastLogin] = useState(defaultState.lastLogin);
  const [scopes, setScopes] = useState<string[]>(defaultState.scopes);
  const [activeSessions, setActiveSessions] = useState(defaultState.activeSessions);
  const [previousSessions, setPreviousSessions] = useState(defaultState.previousSessions);
  const [requireReauth, setRequireReauth] = useState(defaultState.requireReauth);
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('oauthSecurityState');
    if (saved) {
      try {
        const parsed = normalizeState(JSON.parse(saved));
        setConnected(parsed.connected);
        setLastLogin(parsed.lastLogin);
        setScopes(parsed.scopes);
        setActiveSessions(parsed.activeSessions);
        setPreviousSessions(parsed.previousSessions);
        setRequireReauth(parsed.requireReauth);
      } catch (e) {
        console.warn('Failed to parse OAuth security state:', e);
      }
    }

    setHydrated(true);
  }, []);

  const persist = (state: OAuthSecurityState) => {
    localStorage.setItem('oauthSecurityState', JSON.stringify(state));
  };

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    persist({ connected, lastLogin, scopes, activeSessions, previousSessions, requireReauth });
  }, [connected, lastLogin, scopes, activeSessions, previousSessions, requireReauth, hydrated]);

  const archiveActiveSessions = () => {
    const archivedAt = formatNow();
    const endedSessions = activeSessions.map((session) => ({
      ...session,
      endedAt: archivedAt,
    }));

    if (!endedSessions.length) {
      return;
    }

    setPreviousSessions((current) => [...endedSessions, ...current].slice(0, MAX_PREVIOUS_SESSIONS));
    setActiveSessions([]);
  };

  const handleRevokeAccess = async () => {
    setLoading(true);
    try {
      await new Promise((r) => setTimeout(r, 300));
      setConnected(false);
      setScopes([]);
      archiveActiveSessions();
      toast.success('GitHub access revoked. Reconnect to continue using GitHub OAuth.');
    } catch (error) {
      toast.error('Could not revoke GitHub access right now.');
    } finally {
      setLoading(false);
    }
  };

  const handleReconnect = async () => {
    setLoading(true);
    try {
      await new Promise((r) => setTimeout(r, 300));
      const now = formatNow();
      setConnected(true);
      setLastLogin(now);
      setScopes(['read:user', 'repo']);
      setActiveSessions((current) => (current.length ? current : [buildCurrentSession()]));
      toast.success('GitHub reconnected successfully.');
    } catch (error) {
      toast.error('Reconnection failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogoutAll = () => {
    archiveActiveSessions();
    toast.info('Logged out of all sessions. You will need to sign back in.');
  };

  const toggleRequireReauth = () => {
    const next = !requireReauth;
    setRequireReauth(next);
    toast.success(next ? 'Require re-authentication enabled' : 'Require re-authentication disabled');
  };

  const handleSaveSettings = () => {
    persist({ connected, lastLogin, scopes, activeSessions, previousSessions, requireReauth });
    toast.success('Security settings saved.');
  };

  return (
    <div className="Security-content">
      <div className="section-intro">
        <h2>Security Settings</h2>
        <p>Manage your GitHub OAuth security settings and login sessions.</p>
      </div>

      <div className="security-row">
        <h3>GitHub OAuth Status</h3>
        <p>Status: <strong>{connected ? 'Connected' : 'Disconnected'}</strong></p>
        <p>Last login: {lastLogin}</p>
        <p>Scopes: {scopes.length ? scopes.join(', ') : 'None'}</p>

        <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
          {connected ? (
            <button className="btn-spacing" onClick={handleRevokeAccess} disabled={loading}>Revoke GitHub Access</button>
          ) : (
            <button className="btn-spacing" onClick={handleReconnect} disabled={loading}>Reconnect GitHub</button>
          )}
          <button className="btn-spacing" onClick={handleLogoutAll} disabled={loading}>Logout All Sessions</button>
        </div>
      </div>

      <div className="security-row" style={{ marginTop: '24px' }}>
        <h3>Protection Options</h3>
        <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <input type="checkbox" checked={requireReauth} onChange={toggleRequireReauth} />
          Require GitHub re-authentication for sensitive operations
        </label>
      </div>

      <div className="security-row" style={{ marginTop: '24px' }}>
        <h3>Active Sessions</h3>
        {activeSessions.length ? (
          <ul style={{ marginTop: '8px' }}>
            {activeSessions.map((session) => (
              <li key={session.id} style={{ marginBottom: '6px' }}>
                {session.device} · {session.location} · Started: {session.startedAt}
              </li>
            ))}
          </ul>
        ) : (
          <p>No active sessions.</p>
        )}
      </div>

      <div className="security-row" style={{ marginTop: '24px' }}>
        <h3>Previous Sessions</h3>
        {previousSessions.length ? (
          <ul style={{ marginTop: '8px' }}>
            {previousSessions.map((session) => (
              <li key={session.id} style={{ marginBottom: '6px' }}>
                {session.device} · {session.location} · Started: {session.startedAt} · Ended: {session.endedAt || 'Unknown'}
              </li>
            ))}
          </ul>
        ) : (
          <p>No previous sessions yet.</p>
        )}
      </div>

      <div className="button-row" style={{ marginTop: '26px', display: 'flex', gap: '8px' }}>
        <button className="btn-spacing" onClick={handleSaveSettings} disabled={loading}>Save Settings</button>
        <button className="btn-spacing" onClick={() => window.location.reload()}>Reset (Refresh)</button>
      </div>
    </div>
  );
};

