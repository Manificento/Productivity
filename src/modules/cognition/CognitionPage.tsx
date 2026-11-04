import { Route, Routes } from 'react-router-dom';
import { CognitionHome } from './CognitionHome';
import { PvtPage } from './PvtPage';

export function CognitionPage() {
  return (
    <Routes>
      <Route index element={<CognitionHome />} />
      <Route path="pvt" element={<PvtPage />} />
      <Route path="*" element={<CognitionHome />} />
    </Routes>
  );
}
