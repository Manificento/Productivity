import { Route, Routes } from 'react-router-dom';
import { CognitionHome } from './CognitionHome';
import { NbackPage } from './NbackPage';
import { SchultePage } from './SchultePage';
import { StroopPage } from './StroopPage';
import { PvtPage } from './PvtPage';

export function CognitionPage() {
  return (
    <Routes>
      <Route index element={<CognitionHome />} />
      <Route path="pvt" element={<PvtPage />} />
      <Route path="nback" element={<NbackPage />} />
      <Route path="stroop" element={<StroopPage />} />
      <Route path="schulte" element={<SchultePage />} />
      <Route path="*" element={<CognitionHome />} />
    </Routes>
  );
}
