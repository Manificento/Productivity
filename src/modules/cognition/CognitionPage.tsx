import { Route, Routes } from 'react-router-dom';
import { CognitionHome } from './CognitionHome';
import { NbackPage } from './NbackPage';
import { PvtPage } from './PvtPage';

export function CognitionPage() {
  return (
    <Routes>
      <Route index element={<CognitionHome />} />
      <Route path="pvt" element={<PvtPage />} />
      <Route path="nback" element={<NbackPage />} />
      <Route path="*" element={<CognitionHome />} />
    </Routes>
  );
}
