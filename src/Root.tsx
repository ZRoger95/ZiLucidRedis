import { Navigate, Route, Routes } from 'react-router';

import App from './App';
import { ConfiguratorPage } from './components/configurator/ConfiguratorPage';

export function Root() {
  return (
    <Routes>
      <Route path="/" element={<App />} />
      <Route path="/configurator" element={<ConfiguratorPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
