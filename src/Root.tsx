import App from './App';
import { useHashRoute } from './hooks/useHashRoute';

export function Root() {
  const route = useHashRoute();

  if (route === 'configurator') {
    return (
      <main className="flex h-full min-w-[1024px] items-center justify-center text-muted-foreground">配置向导</main>
    );
  }

  return <App />;
}
