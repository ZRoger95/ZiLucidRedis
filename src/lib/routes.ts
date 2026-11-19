export type Route = 'checkup' | 'configurator';

const CONFIGURATOR_PATH = '/configurator';

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '').replace(/\/+$/, '');
  return path === CONFIGURATOR_PATH ? 'configurator' : 'checkup';
}

export function routeHash(route: Route): string {
  return route === 'configurator' ? '#/configurator' : '';
}

export function navigate(route: Route): void {
  window.location.hash = routeHash(route);
}
