import App from './App';
import { ConfiguratorPage } from './components/configurator/ConfiguratorPage';
import { useHashRoute } from './hooks/useHashRoute';

export function Root() {
  const route = useHashRoute();

  if (route === 'configurator') {
    return <ConfiguratorPage />;
  }

  return <App />;
}
