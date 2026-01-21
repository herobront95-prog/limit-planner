import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Upload,
  Plus,
  Trash2,
  Download,
  Filter,
  X,
  Save,
  Package,
  History,
  Database,
  Search,
  Settings,
  Sparkles,
  RefreshCw,
  Ban,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const StoreEditor = () => {
  const { storeId } = useParams();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);


  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [limitsDialogOpen, setLimitsDialogOpen] = useState(false);
  const [filtersDialogOpen, setFiltersDialogOpen] = useState(false);
  const [newLimitsText, setNewLimitsText] = useState('');
  const [applyToAll, setApplyToAll] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [filterExpressions, setFilterExpressions] = useState([]);
  const [savedFilters, setSavedFilters] = useState([]);
  const [newFilterName, setNewFilterName] = useState('');
  const [newFilterExpression, setNewFilterExpression] = useState('');
  const [processing, setProcessing] = useState(false);
  const [pastedData, setPastedData] = useState('');
  const [uploadMethod, setUploadMethod] = useState('file'); // 'file' or 'paste' or 'global'
  const [useGlobalStock, setUseGlobalStock] = useState(false);
  const [hasGlobalStock, setHasGlobalStock] = useState(false);
  
  // New products (novelties) state
  const [newProducts, setNewProducts] = useState([]);
  const [newProductsLoading, setNewProductsLoading] = useState(false);
  const [newProductsSearchQuery, setNewProductsSearchQuery] = useState('');
  const [newProductLimits, setNewProductLimits] = useState({}); // { product: limitValue }
  
  // Blacklist state
  const [blacklist, setBlacklist] = useState([]);
  const [blacklistDialogOpen, setBlacklistDialogOpen] = useState(false);
  const [blacklistSearchQuery, setBlacklistSearchQuery] = useState('');

  useEffect(() => {
    fetchStore();
    fetchFilters();
    checkGlobalStock();
  }, [storeId]);

  const checkGlobalStock = async () => {
    try {
      const response = await axios.get(`${API}/global-stock/latest`);
      setHasGlobalStock(!!response.data);
    } catch (error) {
      setHasGlobalStock(false);
    }
  };

  const fetchStore = async () => {
    try {
      const response = await axios.get(`${API}/stores/${storeId}`);
      setStore(response.data);
    } catch (error) {
      toast.error('Ошибка загрузки точки');
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const fetchFilters = async () => {
    try {
      const response = await axios.get(`${API}/filters`);
      setSavedFilters(response.data);
    } catch (error) {
      console.error('Error fetching filters:', error);
    }
  };

  const parseLimitsInput = (text) => {
    const lines = text.split('\n');
    const limits = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Format: "Product :: limit"
      if (trimmed.includes(' :: ')) {
        const parts = trimmed.split(' :: ');
        const limitStr = parts.pop(); // Last part is limit
        const product = parts.join(' :: '); // Rest is product name
        const limit = parseInt(limitStr.trim());
        if (product.trim() && !isNaN(limit)) {
          limits.push({ product: product.trim(), limit });
        }
      }
    }

    return limits;
  };

  const handleAddLimits = async () => {
    const limits = parseLimitsInput(newLimitsText);

    if (limits.length === 0) {
      toast.error('Введите лимиты в формате: Товар :: число');
      return;
    }

    try {
      await axios.post(`${API}/stores/${storeId}/limits`, {
        limits,
        apply_to_all: applyToAll,
      });
      toast.success(
        applyToAll
          ? `Лимиты добавлены во все точки`
          : 'Лимиты добавлены'
      );
      setNewLimitsText('');
      setApplyToAll(false);
      setLimitsDialogOpen(false);
      fetchStore();
    } catch (error) {
      toast.error('Ошибка добавления лимитов');
    }
  };

  // Fetch new products (novelties) from Электро
  const fetchNewProducts = async () => {
    setNewProductsLoading(true);
    try {
      const response = await axios.get(`${API}/stores/${storeId}/new-products`);
      setNewProducts(response.data.new_products || []);
      setNewProductLimits({});
    } catch (error) {
      toast.error('Ошибка загрузки новинок');
    } finally {
      setNewProductsLoading(false);
    }
  };

  // Add a new product to limits
  const handleAddNewProductLimit = async (product) => {
    const limitValue = newProductLimits[product.product];
    if (!limitValue || isNaN(parseInt(limitValue)) || parseInt(limitValue) < 0) {
      toast.error('Введите корректное значение лимита');
      return;
    }

    try {
      await axios.post(`${API}/stores/${storeId}/limits`, {
        limits: [{ product: product.product, limit: parseInt(limitValue) }],
        apply_to_all: false,
      });
      toast.success('Лимит добавлен');
      // Remove from list and refresh store
      setNewProducts(newProducts.filter(p => p.product !== product.product));
      setNewProductLimits(prev => {
        const updated = { ...prev };
        delete updated[product.product];
        return updated;
      });
      fetchStore();
    } catch (error) {
      toast.error('Ошибка добавления лимита');
    }
  };

  // Add product to blacklist
  const handleAddToBlacklist = async (productName) => {
    try {
      await axios.post(`${API}/stores/${storeId}/blacklist/add`, {
        product: productName
      });
      toast.success('Добавлено в чёрный список');
      // Remove from new products list
      setNewProducts(newProducts.filter(p => p.product !== productName));
      // Add to local blacklist state
      setBlacklist(prev => [...prev, productName]);
    } catch (error) {
      toast.error('Ошибка добавления в чёрный список');
    }
  };

  // Remove product from blacklist
  const handleRemoveFromBlacklist = async (productName) => {
    try {
      await axios.post(`${API}/stores/${storeId}/blacklist/remove`, {
        product: productName
      });
      toast.success('Удалено из чёрного списка');
      // Remove from local blacklist state
      setBlacklist(prev => prev.filter(p => p !== productName));
    } catch (error) {
      toast.error('Ошибка удаления из чёрного списка');
    }
  };

  // Fetch blacklist
  const fetchBlacklist = async () => {
    try {
      const response = await axios.get(`${API}/stores/${storeId}/blacklist`);
      setBlacklist(response.data.products || []);
    } catch (error) {
      console.error('Error fetching blacklist:', error);
    }
  };

  // Open blacklist dialog
  const handleOpenBlacklist = () => {
    fetchBlacklist();
    setBlacklistDialogOpen(true);
  };

  // Filter blacklist by search
  const filteredBlacklist = blacklist.filter(p =>
    p.toLowerCase().includes(blacklistSearchQuery.toLowerCase())
  );

  // Filter new products by search
  const filteredNewProducts = newProducts.filter(p =>
    p.product.toLowerCase().includes(newProductsSearchQuery.toLowerCase())
  );

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (
        file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.type === 'application/vnd.ms-excel'
      ) {
        setSelectedFile(file);
        toast.success(`Файл ${file.name} загружен`);
      } else {
        toast.error('Пожалуйста, выберите Excel файл');
      }
    }
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
    if (file) {
      if (
        file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.type === 'application/vnd.ms-excel'
      ) {
        setSelectedFile(file);
        toast.success(`Файл ${file.name} загружен`);
      } else {
        toast.error('Пожалуйста, выберите Excel файл');
      }
    }
  };

  const parsePastedData = (text) => {
    try {
      const lines = text.trim().split('\n');
      if (lines.length === 0) {
        throw new Error('Нет данных');
      }

      const data = [];
      let skippedRows = 0;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) {
          skippedRows++;
          continue;
        }

        // Split by tab, semicolon, or multiple spaces
        const parts = line.split(/\t|;|  +/);
        
        if (parts.length >= 1) {
          const product = parts[0].trim();
          
          // Get stock value (second column)
          let stockStr = parts.length >= 2 ? parts[1].trim() : '';
          
          // Skip header row if detected
          if (i === 0 && product.toLowerCase().includes('товар')) {
            continue;
          }
          
          // Skip if product name is empty
          if (!product || product === '') {
            skippedRows++;
            continue;
          }
          
          // Parse stock - if empty or not a number, use 0
          let stock = 0;
          if (stockStr && stockStr !== '') {
            const parsed = parseFloat(stockStr);
            stock = isNaN(parsed) ? 0 : parsed;
          }
          
          data.push({ product, stock });
        } else {
          skippedRows++;
        }
      }

      if (skippedRows > 0) {
        console.log(`Пропущено строк: ${skippedRows}`);
      }

      return data;
    } catch (error) {
      throw new Error('Ошибка парсинга данных: ' + error.message);
    }
  };

  const handleProcessFile = async () => {
    // Check which method is being used
    if (uploadMethod === 'file' && !selectedFile && !useGlobalStock) {
      toast.error('Выберите файл с остатками');
      return;
    }

    // For global stock, seller request text is optional
    if (useGlobalStock && !hasGlobalStock) {
      toast.error('Общие остатки не загружены');
      return;
    }

    // If not using global stock and on paste tab, we need data
    if (!useGlobalStock && uploadMethod === 'paste') {
      toast.error('Включите галочку "Из общих остатков" для формирования заказа');
      return;
    }

    setProcessing(true);

    try {
      let response;

      if (useGlobalStock) {
        // Use global stock + optional seller request
        const sellerText = pastedData.trim();
        if (sellerText) {
          toast.info(`Формирование заказа + ${sellerText.split('\n').filter(l => l.trim()).length} позиций от продавца...`);
        } else {
          toast.info('Загрузка из общих остатков...');
        }
        
        response = await axios.post(
          `${API}/process-text`,
          {
            store_id: storeId,
            data: [],
            filter_expressions: filterExpressions,
            use_global_stock: true,
            seller_request: sellerText,  // Add seller request text
          },
          {
            responseType: 'blob',
          }
        );
      } else if (uploadMethod === 'file') {
        // Original file upload method
        const formData = new FormData();
        formData.append('file', selectedFile);

        response = await axios.post(
          `${API}/process?store_id=${storeId}&filter_expressions=${encodeURIComponent(JSON.stringify(filterExpressions))}`,
          formData,
          {
            responseType: 'blob',
            headers: {
              'Content-Type': 'multipart/form-data',
            },
          }
        );
      } else {
        // This shouldn't happen with current flow
        toast.error('Выберите метод загрузки');
        setProcessing(false);
        return;
      }

      // Create blob and download file
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      const filename = `${store.name}.xlsx`;
      link.download = filename;
      
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }, 100);

      toast.success(`Файл "${filename}" загружен`);
      setSelectedFile(null);
      setPastedData('');
    } catch (error) {
      console.error('Process error:', error);
      const errorMessage = error.response?.data?.detail || 'Ошибка обработки данных';
      toast.error(errorMessage);
    } finally {
      setProcessing(false);
    }
  };

  const handleSaveFilter = async () => {
    if (!newFilterName.trim() || !newFilterExpression.trim()) {
      toast.error('Заполните название и выражение фильтра');
      return;
    }

    try {
      await axios.post(`${API}/filters`, {
        name: newFilterName,
        expression: newFilterExpression,
      });
      toast.success('Фильтр сохранен');
      setNewFilterName('');
      setNewFilterExpression('');
      fetchFilters();
    } catch (error) {
      toast.error('Ошибка сохранения фильтра');
    }
  };

  const handleDeleteFilter = async (filterId) => {
    try {
      await axios.delete(`${API}/filters/${filterId}`);
      toast.success('Фильтр удален');
      fetchFilters();
    } catch (error) {
      toast.error('Ошибка удаления фильтра');
    }
  };

  const addFilterExpression = (expr) => {
    setFilterExpressions([...filterExpressions, expr]);
  };

  const removeFilterExpression = (index) => {
    setFilterExpressions(filterExpressions.filter((_, i) => i !== index));
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
                data-testid="back-btn"
                onClick={() => navigate('/')}
                className="-ml-2"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Назад
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
                  {store.name}
                </h1>
                <p className="text-gray-600 mt-1">{store.limits.length} лимитов настроено</p>
              </div>
            </div>
            <div className="flex space-x-3">
              <Button
                variant="outline"
                onClick={() => navigate(`/store/${storeId}/limits`)}
                className="border-purple-200 hover:bg-purple-50"
              >
                <Settings className="mr-2 h-4 w-4" />
                Лимиты ({store.limits.length})
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate(`/store/${storeId}/stock`)}
                className="border-blue-200 hover:bg-blue-50"
              >
                <Package className="mr-2 h-4 w-4" />
                Остатки
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate(`/store/${storeId}/orders`)}
                className="border-green-200 hover:bg-green-50"
              >
                <History className="mr-2 h-4 w-4" />
                История заявок
              </Button>
              <Button
                data-testid="open-filters-btn"
                onClick={() => setFiltersDialogOpen(true)}
                variant="outline"
                className="border-indigo-200 hover:bg-indigo-50"
              >
                <Filter className="mr-2 h-4 w-4" />
                Фильтры ({filterExpressions.length})
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Upload Section */}
          <Card className="lg:col-span-1 bg-white/70 backdrop-blur-sm border-0 ring-1 ring-gray-200">
            <CardHeader>
              <CardTitle className="flex items-center" style={{ fontFamily: 'Manrope, sans-serif' }}>
                <Upload className="mr-2 h-5 w-5 text-indigo-600" />
                Загрузка остатков
              </CardTitle>
              <CardDescription>
                Загрузите файл или вставьте данные
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Tabs for upload method */}
              <Tabs value={uploadMethod} onValueChange={setUploadMethod} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="file">Файл</TabsTrigger>
                  <TabsTrigger value="paste">Вставить</TabsTrigger>
                </TabsList>
                
                <TabsContent value="file" className="space-y-4 mt-4">
                  <div
                    data-testid="drop-zone"
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
                    <Upload
                      className={`h-12 w-12 mx-auto mb-3 ${
                        isDragging ? 'text-indigo-600' : 'text-gray-400'
                      }`}
                    />
                    <p className="text-sm text-gray-600 mb-1">
                      {selectedFile
                        ? selectedFile.name
                        : 'Перетащите файл сюда'}
                    </p>
                    <p className="text-xs text-gray-500">или нажмите для выбора</p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </TabsContent>

                <TabsContent value="paste" className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label>Заявка от продавца (будет добавлена в конец):</Label>
                    <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-800">
                      📝 Вставьте текст от продавца — каждая строка будет добавлена в конец заявки без фильтров и лимитов
                    </div>
                    <Textarea
                      placeholder={"Пример:\nТовар который нужно заказать\nЕщё один товар\nИ ещё"}
                      value={pastedData}
                      onChange={(e) => setPastedData(e.target.value)}
                      className="min-h-[200px] font-mono text-xs"
                      data-testid="paste-data-textarea"
                    />
                    {pastedData && (
                      <p className="text-xs text-gray-600">
                        Строк: {pastedData.split('\n').filter(l => l.trim()).length}
                      </p>
                    )}
                  </div>
                </TabsContent>
              </Tabs>

              {/* Use Global Stock Checkbox */}
              {hasGlobalStock && (
                <div className="flex items-center space-x-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <Checkbox
                    id="use-global-stock"
                    checked={useGlobalStock}
                    onCheckedChange={setUseGlobalStock}
                  />
                  <Label htmlFor="use-global-stock" className="cursor-pointer text-sm">
                    <div className="flex items-center">
                      <Database className="h-4 w-4 mr-2 text-green-600" />
                      Загрузить из общих остатков
                    </div>
                  </Label>
                </div>
              )}

              {filterExpressions.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Активные фильтры:</Label>
                  <div className="space-y-2">
                    {filterExpressions.map((expr, index) => (
                      <Badge
                        key={index}
                        variant="secondary"
                        className="w-full justify-between px-3 py-2 text-xs"
                      >
                        <span className="truncate">{expr}</span>
                        <X
                          className="h-3 w-3 cursor-pointer ml-2 flex-shrink-0"
                          onClick={() => removeFilterExpression(index)}
                        />
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <Button
                data-testid="process-file-btn"
                onClick={handleProcessFile}
                disabled={(!useGlobalStock && uploadMethod === 'file' && !selectedFile) || processing}
                className="w-full bg-green-600 hover:bg-green-700"
              >
                {processing ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Обработка...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Сформировать заказ
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* New Products (Novelties) Section */}
          <Card className="lg:col-span-2 bg-white/70 backdrop-blur-sm border-0 ring-1 ring-gray-200">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center" style={{ fontFamily: 'Manrope, sans-serif' }}>
                    <Sparkles className="mr-2 h-5 w-5 text-amber-500" />
                    Новинки
                    {newProducts.length > 0 && (
                      <Badge variant="secondary" className="ml-2 bg-amber-100 text-amber-700">
                        {filteredNewProducts.length}{newProductsSearchQuery && ` из ${newProducts.length}`}
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    Товары на Электро, которых нет в лимитах или лимит = 0
                  </CardDescription>
                </div>
                <div className="flex items-center space-x-2">
                  {newProducts.length > 0 && (
                    <div className="relative w-64">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        placeholder="Поиск..."
                        value={newProductsSearchQuery}
                        onChange={(e) => setNewProductsSearchQuery(e.target.value)}
                        className="pl-9 h-9"
                      />
                    </div>
                  )}
                  <Button
                    onClick={handleOpenBlacklist}
                    variant="outline"
                    className="border-gray-300 hover:bg-gray-50"
                  >
                    <Ban className="mr-2 h-4 w-4" />
                    Чёрный список
                    {blacklist.length > 0 && (
                      <Badge variant="secondary" className="ml-2 bg-gray-200 text-gray-700">
                        {blacklist.length}
                      </Badge>
                    )}
                  </Button>
                  <Button
                    onClick={fetchNewProducts}
                    disabled={newProductsLoading}
                    variant="outline"
                    className="border-amber-200 hover:bg-amber-50"
                  >
                    {newProductsLoading ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-amber-600 mr-2"></div>
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    Посмотреть изменения
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {newProducts.length === 0 ? (
                <div className="text-center py-12">
                  <Sparkles className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                  <p className="text-gray-500 mb-2">Нажмите "Посмотреть изменения"</p>
                  <p className="text-gray-400 text-sm">чтобы найти товары на Электро, которых нет в лимитах</p>
                </div>
              ) : filteredNewProducts.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500">Ничего не найдено по запросу "{newProductsSearchQuery}"</p>
                </div>
              ) : (
                <div className="rounded-lg border overflow-hidden max-h-[600px] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-gray-50 z-10">
                      <TableRow className="bg-gray-50">
                        <TableHead className="font-semibold">Товар</TableHead>
                        <TableHead className="font-semibold w-28 text-center">На Электро</TableHead>
                        <TableHead className="font-semibold w-28 text-center">Лимит</TableHead>
                        <TableHead className="w-24"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredNewProducts.map((product, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium text-sm">
                            {product.product}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                              {product.electro_stock}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              placeholder="0"
                              value={newProductLimits[product.product] || ''}
                              onChange={(e) => setNewProductLimits(prev => ({
                                ...prev,
                                [product.product]: e.target.value
                              }))}
                              className="w-20 h-8 text-center mx-auto"
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center space-x-1">
                              <Button
                                size="sm"
                                data-testid={`add-novelty-${index}`}
                                onClick={() => handleAddNewProductLimit(product)}
                                disabled={!newProductLimits[product.product]}
                                className="bg-emerald-600 hover:bg-emerald-700 h-8"
                                title="Добавить в лимиты"
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleAddToBlacklist(product.product)}
                                className="h-8 text-gray-400 hover:text-red-600 hover:bg-red-50"
                                title="Больше не показывать"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
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

      {/* Filters Dialog */}
      <Dialog open={filtersDialogOpen} onOpenChange={setFiltersDialogOpen}>
        <DialogContent className="max-w-3xl" data-testid="filters-dialog">
          <DialogHeader>
            <DialogTitle>Фильтры обработки</DialogTitle>
            <DialogDescription>
              Создавайте выражения для фильтрации позиций заказа
            </DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="use" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="use">Использовать</TabsTrigger>
              <TabsTrigger value="create">Создать новый</TabsTrigger>
            </TabsList>
            <TabsContent value="use" className="space-y-4">
              <div className="space-y-2">
                <Label>Доступные фильтры:</Label>
                {savedFilters.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">
                    Нет сохраненных фильтров
                  </p>
                ) : (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {savedFilters.map((filter) => (
                      <Card key={filter.id} className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h4 className="font-semibold text-sm">{filter.name}</h4>
                            <code className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded mt-1 inline-block">
                              {filter.expression}
                            </code>
                          </div>
                          <div className="flex space-x-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => addFilterExpression(filter.expression)}
                            >
                              Добавить
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteFilter(filter.id)}
                              className="text-red-500 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
              <div className="border-t pt-4">
                <Label className="mb-2 block">Активные фильтры:</Label>
                {filterExpressions.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-2">
                    Нет активных фильтров
                  </p>
                ) : (
                  <div className="space-y-2">
                    {filterExpressions.map((expr, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between bg-gray-50 p-3 rounded-lg"
                      >
                        <code className="text-sm">{expr}</code>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeFilterExpression(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
            <TabsContent value="create" className="space-y-4">
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-semibold text-sm mb-2 text-blue-900">Справка:</h4>
                  <ul className="text-xs text-blue-800 space-y-1">
                    <li><code className="bg-blue-100 px-1 rounded">Лимиты</code> - значение лимита товара</li>
                    <li><code className="bg-blue-100 px-1 rounded">Остаток</code> - остаток на складе</li>
                    <li><code className="bg-blue-100 px-1 rounded">Заказ</code> - рассчитанный заказ</li>
                    <li className="mt-2 font-semibold">Примеры фильтров:</li>
                    <li><code className="bg-blue-100 px-1 rounded">Заказ &gt;= 5</code> - оставить только заказы от 5 единиц</li>
                    <li><code className="bg-blue-100 px-1 rounded">Остаток &lt; Лимиты / 3</code> - заказывать если остаток меньше 1/3 лимита</li>
                    <li><code className="bg-blue-100 px-1 rounded">Заказ != 1 and Заказ != 2</code> - исключить мелкие заказы (1 или 2)</li>
                    <li><code className="bg-blue-100 px-1 rounded">Заказ &gt; Лимиты / 2</code> - заказывать только крупные партии</li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="filter-name">Название фильтра</Label>
                  <Input
                    id="filter-name"
                    data-testid="filter-name-input"
                    placeholder="Например: Минимум 5 единиц"
                    value={newFilterName}
                    onChange={(e) => setNewFilterName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="filter-expression">Выражение</Label>
                  <Input
                    id="filter-expression"
                    data-testid="filter-expression-input"
                    placeholder="Например: Заказ >= 5"
                    value={newFilterExpression}
                    onChange={(e) => setNewFilterExpression(e.target.value)}
                    className="font-mono"
                  />
                </div>
                <Button
                  data-testid="save-filter-btn"
                  onClick={handleSaveFilter}
                  className="w-full"
                >
                  <Save className="mr-2 h-4 w-4" />
                  Сохранить фильтр
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StoreEditor;
