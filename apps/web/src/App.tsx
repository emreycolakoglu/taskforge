import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { HomePage } from './pages/HomePage';

export function App() {
  return (
    <BrowserRouter>
      <div style={{
        minHeight: '100vh',
        background: '#f5f5fa',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/board/:id" element={<HomePage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
