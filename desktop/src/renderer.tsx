import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import { StudioDisplayOutput } from './Routes/Studio';

const savedTheme = localStorage.getItem('faithstream.theme');
const availableThemes = ['midnight', 'light', 'ocean', 'forest', 'plum'];
document.documentElement.dataset.theme = savedTheme && availableThemes.includes(savedTheme) ? savedTheme : 'midnight';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/studio-output" element={<StudioDisplayOutput />} />
        <Route path="/*" element={<Layout />} />
      </Routes>
    </HashRouter>
  </StrictMode>,
);
