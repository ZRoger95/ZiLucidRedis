import { useEffect, useState } from 'react';

import { parseRoute, type Route } from '../lib/routes';

/** 与浏览器 URL 同步：hashchange 是 React 之外的系统，无法用事件处理器或渲染期派生代替。 */
export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));

  useEffect(() => {
    const update = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);

  return route;
}
