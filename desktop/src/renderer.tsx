import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Studio from './Routes/Studio';
import Presentation from './Routes/Presentation';
import Settings from './Routes/Settings';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Studio />} />
          <Route path="/presentations" element={<Presentation />} />
          <Route path="/settings" element={<Settings />} />
        </Route>       
      </Routes>
    </HashRouter>
  </StrictMode>,
);