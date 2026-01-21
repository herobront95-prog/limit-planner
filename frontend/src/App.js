import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import Dashboard from '@/pages/Dashboard';
import StoreEditor from '@/pages/StoreEditor';
import StoreLimitsPage from '@/pages/StoreLimitsPage';
import ProductMappings from '@/pages/ProductMappings';
import GlobalStockPage from '@/pages/GlobalStockPage';
import OrderHistoryPage from '@/pages/OrderHistoryPage';
import StockHistoryPage from '@/pages/StockHistoryPage';
import './App.css';

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/store/:storeId" element={<StoreEditor />} />
          <Route path="/store/:storeId/limits" element={<StoreLimitsPage />} />
          <Route path="/store/:storeId/orders" element={<OrderHistoryPage />} />
          <Route path="/store/:storeId/stock" element={<StockHistoryPage />} />
          <Route path="/mappings" element={<ProductMappings />} />
          <Route path="/global-stock" element={<GlobalStockPage />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </div>
  );
}

export default App;