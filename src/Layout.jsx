import { Outlet } from 'react-router-dom';
import Header from './components/Header';

export default function Layout() {
  return (
    <div className="app-shell">
      <Header />
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
