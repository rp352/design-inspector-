import { createRoot } from 'react-dom/client';
import { SidePanel } from './SidePanel';
import '../styles/tailwind.css';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<SidePanel />);
}
