import { Routes, Route, Navigate } from 'react-router-dom';
import RequireAuth from './auth/RequireAuth.jsx';
import ProjectLayout from './layout/ProjectLayout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Specs from './pages/Specs.jsx';
import DRs from './pages/DRs.jsx';
import VRs from './pages/VRs.jsx';
import Signatures from './pages/Signatures.jsx';
import Diagnostics from './pages/Diagnostics.jsx';
import Regressions from './pages/Regressions.jsx';
import ISO from './pages/ISO.jsx';
import Settings from './pages/Settings.jsx';
import Login from './pages/Login.jsx';
import Admin from './pages/Admin.jsx';
import ArtifactDetail from './pages/ArtifactDetail.jsx';
import HomeRedirect from './pages/HomeRedirect.jsx';
import ProjectSelection from './pages/ProjectSelection.jsx';
import ProjectCreate from './pages/ProjectCreate.jsx';
import Unauthorized from './pages/Unauthorized.jsx';
import Audit from './pages/Audit.jsx';
import SpecPilot from './pages/SpecPilot.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/unauthorized" element={<Unauthorized />} />

      <Route element={<RequireAuth />}>
        <Route index element={<HomeRedirect />} />
        <Route path="projects" element={<ProjectSelection />} />
        <Route path="projects/new" element={<ProjectCreate />} />

        <Route path="projects/:projectId" element={<ProjectLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="artifacts/:artifactId" element={<ArtifactDetail />} />
          <Route path="specs" element={<Specs />} />
          <Route path="specpilot" element={<SpecPilot />} />
          <Route path="drs" element={<DRs />} />
          <Route path="vrs" element={<VRs />} />
          <Route path="signatures" element={<Signatures />} />
          <Route path="signatures/:key" element={<Diagnostics />} />
          <Route path="regressions" element={<Regressions />} />
          <Route path="iso" element={<ISO />} />
          <Route path="settings" element={<Settings />} />
          <Route path="admin" element={<Admin />} />
          <Route path="audit" element={<Audit />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
