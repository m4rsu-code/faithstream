import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Navigate, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import { StudioDisplayOutput } from './Routes/Studio';
import Presentation from './Routes/Presentation';
import Settings from './Routes/Settings';

const savedTheme = localStorage.getItem('faithstream.theme');
const availableThemes = ['midnight', 'light', 'ocean', 'forest', 'plum'];
document.documentElement.dataset.theme = savedTheme && availableThemes.includes(savedTheme) ? savedTheme : 'midnight';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={null} />
          <Route path="/presentations" element={<Presentation />} />
          {/* Songbooks now live in the Presentations page. */}
          <Route path="/songbooks" element={<Navigate to="/presentations?view=songbooks" replace />} />
          <Route path="/settings" element={<Settings />} />
        </Route>       
        <Route path="/studio-output" element={<StudioDisplayOutput />} />
      </Routes>
    </HashRouter>
  </StrictMode>,
);
