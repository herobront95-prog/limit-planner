import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { ArrowLeft, Upload, Database, Clock, Check, Calendar } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const GlobalStockPage = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [latestStock, setLatestStock] = useState(null);
  const [history, setHistory] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [stockDate, setStockDate] = useState(() => {
    // Default to today's date in YYYY-MM-DD format
    const today = new Date();
    return today.toISOString().split('T')[0];
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [latestRes, historyRes] = await Promise.all([
        axios.get(`${API}/global-stock/latest`),
        axios.get(`${API}/global-stock/history`)
      ]);
      setLatestStock(latestRes.data);
      setHistory(historyRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (file) => {
    if (!file) return;

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      toast.error('Пожалуйста, выберите Excel файл');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      // Pass selected date as query parameter
      const response = await axios.post(
        `${API}/global-stock/upload?stock_date=${stockDate}`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      toast.success(`Загружено ${response.data.products_count} товаров для ${response.data.stores_found.length} точек (дата: ${formatDateShort(stockDate)})`);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Ошибка загрузки файла');
    } finally {
      setUploading(false);
    }
  };

  const formatDateShort = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    handleFileSelect(file);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <div className="border-b bg-white/80 backdrop-blur-sm shadow-sm">
        <div className="container mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                onClick={() => navigate('/')}
                className="-ml-2"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Назад
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
                  Общие остатки
                </h1>
                <p className="text-gray-600 mt-1">
                  Загрузка остатков для всех точек одним файлом
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Upload Section */}
          <Card className="bg-white/70 backdrop-blur-sm border-0 ring-1 ring-gray-200">
            <CardHeader>
              <CardTitle className="flex items-center" style={{ fontFamily: 'Manrope, sans-serif' }}>
                <Upload className="mr-2 h-5 w-5 text-indigo-600" />
                Загрузить остатки
              </CardTitle>
              <CardDescription>
                Excel файл с колонками: Товар, Точка1, Точка2, ...
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-300 ${
                  isDragging
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-gray-300 hover:border-indigo-400 bg-gray-50'
                }`}
              >
                {uploading ? (
                  <div className="flex flex-col items-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-3"></div>
                    <p className="text-sm text-gray-600">Загрузка...</p>
                  </div>
                ) : (
                  <>
                    <Database className={`h-12 w-12 mx-auto mb-3 ${isDragging ? 'text-indigo-600' : 'text-gray-400'}`} />
                    <p className="text-sm text-gray-600 mb-1">
                      Перетащите Excel файл сюда
                    </p>
                    <p className="text-xs text-gray-500">или нажмите для выбора</p>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => handleFileSelect(e.target.files?.[0])}
                className="hidden"
              />

              {/* Format help */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-semibold text-sm mb-2 text-blue-900">Формат файла:</h4>
                <div className="text-xs text-blue-800 font-mono bg-white/50 p-2 rounded">
                  <div className="grid grid-cols-4 gap-2 border-b pb-1 mb-1 font-bold">
                    <span>Товар</span>
                    <span>9ка</span>
                    <span>ЮЗ</span>
                    <span>Х3</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <span>Товар 1</span>
                    <span>5</span>
                    <span>3</span>
                    <span>8</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <span>Товар 2</span>
                    <span>10</span>
                    <span>0</span>
                    <span>2</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Latest Upload Info */}
          <Card className="bg-white/70 backdrop-blur-sm border-0 ring-1 ring-gray-200">
            <CardHeader>
              <CardTitle className="flex items-center" style={{ fontFamily: 'Manrope, sans-serif' }}>
                <Clock className="mr-2 h-5 w-5 text-indigo-600" />
                Последняя загрузка
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                </div>
              ) : latestStock ? (
                <div className="space-y-4">
                  <div className="flex items-center space-x-2 text-green-600">
                    <Check className="h-5 w-5" />
                    <span className="font-medium">Остатки загружены</span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <p><span className="text-gray-500">Дата:</span> {formatDate(latestStock.uploaded_at)}</p>
                    <p><span className="text-gray-500">Товаров:</span> {Object.keys(latestStock.data || {}).length}</p>
                    <p><span className="text-gray-500">Точки:</span> {latestStock.store_columns?.join(', ')}</p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Database className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <p>Остатки ещё не загружались</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* History Table */}
        <Card className="mt-6 bg-white/70 backdrop-blur-sm border-0 ring-1 ring-gray-200">
          <CardHeader>
            <CardTitle style={{ fontFamily: 'Manrope, sans-serif' }}>
              История загрузок
            </CardTitle>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                История пуста
              </div>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="font-semibold">Дата загрузки</TableHead>
                      <TableHead className="font-semibold">Точки</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((item, index) => (
                      <TableRow key={item.id || index}>
                        <TableCell>{formatDate(item.uploaded_at)}</TableCell>
                        <TableCell>{item.store_columns?.join(', ')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default GlobalStockPage;
