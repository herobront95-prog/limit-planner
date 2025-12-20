import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { ArrowLeft, Package, TrendingUp, Search } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const StockHistoryPage = () => {
  const { storeId } = useParams();
  const navigate = useNavigate();
  const [store, setStore] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('week');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productHistory, setProductHistory] = useState(null);
  const [chartDialogOpen, setChartDialogOpen] = useState(false);

  useEffect(() => {
    fetchData();
  }, [storeId, period]);

  const fetchData = async () => {
    try {
      const [storeRes, historyRes] = await Promise.all([
        axios.get(`${API}/stores/${storeId}`),
        axios.get(`${API}/stores/${storeId}/stock-history?period=${period}`)
      ]);
      setStore(storeRes.data);
      setProducts(historyRes.data.products || []);
    } catch (error) {
      toast.error('Ошибка загрузки данных');
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const handleViewProduct = async (product) => {
    try {
      const response = await axios.get(
        `${API}/stores/${storeId}/stock-history/${encodeURIComponent(product)}?period=${period}`
      );
      setSelectedProduct(product);
      setProductHistory(response.data);
      setChartDialogOpen(true);
    } catch (error) {
      toast.error('Ошибка загрузки истории товара');
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit'
    });
  };

  const filteredProducts = products.filter(p =>
    p.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Simple chart component
  const SimpleChart = ({ data, label, color }) => {
    if (!data || data.length === 0) {
      return <div className="text-center text-gray-500 py-4">Нет данных</div>;
    }

    const values = data.map(d => d.stock || d.order || 0);
    const maxValue = Math.max(...values, 1);
    const minValue = Math.min(...values, 0);
    const range = maxValue - minValue || 1;

    return (
      <div className="space-y-2">
        <div className="text-sm font-medium text-gray-700">{label}</div>
        <div className="relative h-32 border rounded-lg bg-gray-50 p-2">
          <div className="absolute inset-0 p-2 flex items-end space-x-1">
            {data.map((item, index) => {
              const height = ((item.stock || item.order || 0) - minValue) / range * 100;
              return (
                <div
                  key={index}
                  className="flex-1 flex flex-col items-center justify-end"
                  title={`${formatDate(item.recorded_at || item.date)}: ${item.stock || item.order || 0}`}
                >
                  <div
                    className={`w-full rounded-t ${color}`}
                    style={{ height: `${Math.max(height, 5)}%` }}
                  />
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex justify-between text-xs text-gray-500">
          <span>{formatDate(data[0]?.recorded_at || data[0]?.date)}</span>
          <span>{formatDate(data[data.length - 1]?.recorded_at || data[data.length - 1]?.date)}</span>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <div className="border-b bg-white/80 backdrop-blur-sm shadow-sm">
        <div className="container mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                onClick={() => navigate(`/store/${storeId}`)}
                className="-ml-2"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Назад
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
                  Остатки — {store?.name}
                </h1>
                <p className="text-gray-600 mt-1">
                  История движения товаров
                </p>
              </div>
            </div>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">День</SelectItem>
                <SelectItem value="week">Неделя</SelectItem>
                <SelectItem value="month">Месяц</SelectItem>
                <SelectItem value="year">Год</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8">
        <Card className="bg-white/70 backdrop-blur-sm border-0 ring-1 ring-gray-200">
          <CardHeader>
            <CardTitle className="flex items-center justify-between" style={{ fontFamily: 'Manrope, sans-serif' }}>
              <div className="flex items-center">
                <Package className="mr-2 h-5 w-5 text-indigo-600" />
                Товары ({filteredProducts.length})
              </div>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Поиск товара..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </CardTitle>
            <CardDescription>
              Нажмите на товар для просмотра графика
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filteredProducts.length === 0 ? (
              <div className="text-center py-12">
                <Package className="h-16 w-16 mx-auto text-gray-300 mb-4" />
                <h3 className="text-xl font-semibold text-gray-700 mb-2">Нет данных об остатках</h3>
                <p className="text-gray-500">Данные появятся после загрузки остатков или формирования заявок</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredProducts.map((product) => (
                  <Card
                    key={product}
                    className="cursor-pointer hover:ring-2 hover:ring-indigo-300 transition-all"
                    onClick={() => handleViewProduct(product)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium truncate flex-1 mr-2">{product}</span>
                        <TrendingUp className="h-4 w-4 text-indigo-500 flex-shrink-0" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Product Chart Dialog */}
      <Dialog open={chartDialogOpen} onOpenChange={setChartDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span className="truncate pr-4">{selectedProduct}</span>
              <Select value={period} onValueChange={(v) => { setPeriod(v); handleViewProduct(selectedProduct); }}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">День</SelectItem>
                  <SelectItem value="week">Неделя</SelectItem>
                  <SelectItem value="month">Месяц</SelectItem>
                  <SelectItem value="year">Год</SelectItem>
                </SelectContent>
              </Select>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <SimpleChart
              data={productHistory?.stock_history || []}
              label="Остатки"
              color="bg-blue-500"
            />
            <SimpleChart
              data={productHistory?.order_history || []}
              label="Заказы"
              color="bg-green-500"
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StockHistoryPage;
