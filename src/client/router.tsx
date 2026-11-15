import {
  createBrowserRouter,
  Outlet,
  useMatches,
  type RouteObject,
} from 'react-router';
import { HomePage } from './pages/HomePage';
import { NotFound } from './pages/NotFound';
import { HostPage } from './pages/host/HostPage';
import { PlayerPage } from './pages/player/PlayerPage';

type Mode = 'projector' | 'phone';

// Each route says which type scale it uses; the layout applies it to everything below.
function AppLayout() {
  const mode =
    useMatches()
      .map((match) => (match.handle as { mode?: Mode } | undefined)?.mode)
      .filter(Boolean)
      .at(-1) ?? 'phone';
  return (
    <div className="wd-app" data-mode={mode}>
      <Outlet />
    </div>
  );
}

export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <HomePage />, handle: { mode: 'projector' } },
      {
        path: '/host/:roomId',
        element: <HostPage />,
        handle: { mode: 'projector' },
      },
      {
        path: '/room/:roomCode',
        element: <PlayerPage />,
        handle: { mode: 'phone' },
      },
      { path: '*', element: <NotFound />, handle: { mode: 'phone' } },
    ],
  },
];

export const createAppRouter = () => createBrowserRouter(routes);
