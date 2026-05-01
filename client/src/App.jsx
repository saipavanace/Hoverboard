import { Routes, Route } from 'react-router-dom';
import AppLayout from './layout/AppLayout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Specs from './pages/Specs.jsx';
import DRs from './pages/DRs.jsx';
import VRs from './pages/VRs.jsx';
import Signatures from './pages/Signatures.jsx';
import Diagnostics from './pages/Diagnostics.jsx';
import Regressions from './pages/Regressions.jsx';
import ISO from './pages/ISO.jsx';
import Settings from './pages/Settings.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="specs" element={<Specs />} />
        <Route path="drs" element={<DRs />} />
        <Route path="vrs" element={<VRs />} />
        <Route path="signatures" element={<Signatures />} />
        <Route path="signatures/:key" element={<Diagnostics />} />
        <Route path="regressions" element={<Regressions />} />
        <Route path="iso" element={<ISO />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
