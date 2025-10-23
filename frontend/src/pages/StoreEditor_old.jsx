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
  Globe,
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

  useEffect(() => {
    fetchStore();
    fetchFilters();
  }, [storeId]);

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

      // Format: "Product - limit"
      if (trimmed.includes(' - ')) {
        const [product, limitStr] = trimmed.split(' - ');
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
      toast.error('Введите лимиты в формате: Товар - число');
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

  const handleDeleteLimit = async (productName, deleteFromAll = false) => {
    try {
      await axios.delete(
        `${API}/stores/${storeId}/limits/${encodeURIComponent(productName)}?apply_to_all=${deleteFromAll}`
      );
      toast.success(
        deleteFromAll
          ? 'Лимит удален из всех точек'
          : 'Лимит удален'
      );
      fetchStore();
    } catch (error) {
      toast.error('Ошибка удаления лимита');
    }
  };

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

  const handleProcessFile = async () => {
    if (!selectedFile) {
      toast.error('Выберите файл с остатками');
      return;
    }

    setProcessing(true);
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await axios.post(
        `${API}/process?store_id=${storeId}&filter_expressions=${encodeURIComponent(JSON.stringify(filterExpressions))}`,
        formData,
        {
          responseType: 'blob',
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      // Download file
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${store.name}_заказ.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();

      toast.success('Заказ сформирован и загружен');
      setSelectedFile(null);
    } catch (error) {
      console.error('Process error:', error);
      toast.error(error.response?.data?.detail || 'Ошибка обработки файла');
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
                data-testid="open-filters-btn"
                onClick={() => setFiltersDialogOpen(true)}
                variant="outline"
                className="border-indigo-200 hover:bg-indigo-50"
              >
                <Filter className="mr-2 h-4 w-4" />
                Фильтры ({filterExpressions.length})
              </Button>
              <Button
                data-testid="add-limits-btn"
                onClick={() => setLimitsDialogOpen(true)}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                <Plus className="mr-2 h-4 w-4" />
                Добавить лимиты
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
                Загрузите Excel файл с колонками "Товар" и "Остаток"
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
                disabled={!selectedFile || processing}
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

          {/* Limits Table */}
          <Card className="lg:col-span-2 bg-white/70 backdrop-blur-sm border-0 ring-1 ring-gray-200">
            <CardHeader>
              <CardTitle style={{ fontFamily: 'Manrope, sans-serif' }}>Лимиты точки</CardTitle>
              <CardDescription>
                Настройте лимиты для каждого товара
              </CardDescription>
            </CardHeader>
            <CardContent>
              {store.limits.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500 mb-4">Лимиты не настроены</p>
                  <Button onClick={() => setLimitsDialogOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Добавить лимиты
                  </Button>
                </div>
              ) : (
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead className="font-semibold">Товар</TableHead>
                        <TableHead className="font-semibold">Лимит</TableHead>
                        <TableHead className="w-24"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {store.limits.map((limit, index) => (
                        <TableRow key={index} data-testid={`limit-row-${index}`}>
                          <TableCell className="font-medium">{limit.product}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">
                              {limit.limit}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex space-x-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                data-testid={`delete-limit-${index}`}
                                onClick={() => handleDeleteLimit(limit.product, false)}
                                className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                data-testid={`delete-limit-all-${index}`}
                                onClick={() => handleDeleteLimit(limit.product, true)}
                                className="h-8 w-8 text-orange-500 hover:text-orange-700 hover:bg-orange-50"
                                title="Удалить из всех точек"
                              >
                                <Globe className="h-4 w-4" />
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

      {/* Add Limits Dialog */}
      <Dialog open={limitsDialogOpen} onOpenChange={setLimitsDialogOpen}>
        <DialogContent className="max-w-2xl" data-testid="add-limits-dialog">
          <DialogHeader>
            <DialogTitle>Добавить лимиты</DialogTitle>
            <DialogDescription>
              Введите лимиты в формате: Товар - число (каждый с новой строки)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Textarea
              data-testid="limits-textarea"
              placeholder="Пример:\nДарксайд 25 - 2\nКвазар X - 5\nМегаТор 100 - 10"
              value={newLimitsText}
              onChange={(e) => setNewLimitsText(e.target.value)}
              className="min-h-[200px] font-mono text-sm"
            />
            <div className="flex items-center space-x-2">
              <Switch
                id="apply-to-all"
                data-testid="apply-to-all-switch"
                checked={applyToAll}
                onCheckedChange={setApplyToAll}
              />
              <Label htmlFor="apply-to-all" className="cursor-pointer">
                Применить ко всем точкам
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLimitsDialogOpen(false)}>
              Отмена
            </Button>
            <Button data-testid="submit-limits-btn" onClick={handleAddLimits}>
              <Save className="mr-2 h-4 w-4" />
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                    <li className="mt-2">Примеры выражений:</li>
                    <li><code className="bg-blue-100 px-1 rounded">Заказ &gt; Лимиты / 3</code> - оставить только большие заказы</li>
                    <li><code className="bg-blue-100 px-1 rounded">Лимиты * 2</code> - удвоить лимиты</li>
                    <li><code className="bg-blue-100 px-1 rounded">Заказ != 1 or Лимиты != 2</code> - исключить заказы 1 при лимите 2</li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="filter-name">Название фильтра</Label>
                  <Input
                    id="filter-name"
                    data-testid="filter-name-input"
                    placeholder="Например: Удвоение лимитов"
                    value={newFilterName}
                    onChange={(e) => setNewFilterName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="filter-expression">Выражение</Label>
                  <Input
                    id="filter-expression"
                    data-testid="filter-expression-input"
                    placeholder="Например: Лимиты * 2"
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