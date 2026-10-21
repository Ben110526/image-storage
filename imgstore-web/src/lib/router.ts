import { useEffect, useState } from 'react';

export type Route = 'upload' | 'library' | 'convert' | 'docs';

const VALID: Route[] = ['upload', 'library', 'convert', 'docs'];

function parseHash(): Route {
  const raw = window.location.hash.replace(/^#\/?/, '').split('/')[0].toLowerCase();
  return (VALID as string[]).includes(raw) ? (raw as Route) : 'upload';
}

/** Minimal hash router — no dependency, works on a plain static SPA with no
 * server-side route config. Routes: #/upload · #/library · #/convert · #/docs */
export function useHashRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(parseHash);

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = (r: Route) => {
    window.location.hash = `/${r}`;
  };

  return [route, navigate];
}
