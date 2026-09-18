import { Navigate, Route, Routes } from 'react-router-dom';
import { HashRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from './state/AuthContext.jsx';
import { EventProvider } from './state/EventContext.jsx';
import LoginScreen from './screens/LoginScreen.jsx';
import HomeScreen from './screens/HomeScreen.jsx';
import ParticipateScreen from './screens/ParticipateScreen.jsx';
import PlayScreen from './screens/PlayScreen.jsx';
import AdminScreen from './screens/AdminScreen.jsx';
import { Spinner } from './components/ui.jsx';
import { CONFIG_MISSING } from './firebase/config.js';

/**
 * HashRouter, deliberately: no hosting rewrite can ever break a deep link,
 * including on a friend's laptop, a phone hotspot or a static preview server.
 */

function RequireAuth({ children }) {
  const { user, authReady } = useAuth();
  if (CONFIG_MISSING) return <Navigate to='/' replace />;
  if (!authReady) return <Spinner label='VERIFYING SESSION…' />;
  if (!user) return <Navigate to='/' replace />;
  return children;
}

function Landing() {
  const { user, authReady, isAdmin } = useAuth();
  if (!authReady) return <Spinner label='VERIFYING SESSION…' />;
  if (user && isAdmin === true) return <Navigate to='/admin' replace />;
  if (user && isAdmin === false) return <Navigate to='/home' replace />;
  return <LoginScreen />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path='/' element={<Landing />} />
      <Route
        path='/home'
        element={
          <RequireAuth>
            <HomeScreen />
          </RequireAuth>
        }
      />
      <Route
        path='/participate'
        element={
          <RequireAuth>
            <ParticipateScreen />
          </RequireAuth>
        }
      />
      <Route
        path='/play/:activityId'
        element={
          <RequireAuth>
            <PlayScreen />
          </RequireAuth>
        }
      />
      <Route path='/admin' element={<AdminScreen />} />
      <Route path='*' element={<Navigate to='/' replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <EventProvider>
        <HashRouter>
          <AppRoutes />
        </HashRouter>
      </EventProvider>
    </AuthProvider>
  );
}
