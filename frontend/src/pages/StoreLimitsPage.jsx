import { useState, useEffect } from 'react';
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
import { toast } from 'sonner';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  Globe,
  Edit2,
  Check,
  X,
  Search,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const StoreLimitsPage = () => {
  const { storeId } = useParams();
  const navigate = useNavigate();

  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [limitsDialogOpen, setLimitsDialogOpen] = useState(false);
  const [newLimitsText, setNewLimitsText] = useState('');
  const [applyToAll, setApplyToAll] = useState(false);
  const [editingLimit, setEditingLimit] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [editingLimitName, setEditingLimitName] = useState(null);
  const [editNameValue, setEditNameValue] = useState('');
  const [limitsSearchQuery, setLimitsSearchQuery] = useState('');

  // Filter limits (no sorting for faster loading)
  const filteredLimits = store?.limits?.filter(limit => 
    limit.product.toLowerCase().includes(limitsSearchQuery.toLowerCase())
  ) || [];

  useEffect(() => {
    fetchStore();
  }, [storeId]);

  const fetchStore = async () => {
    try {
      const response = await axios.get(`${API}/stores/${storeId}`);
      setStore(response.data);
    } catch (error) {
      toast.error('Ошибка загрузки данных');
    } finally {
      setLoading(false);
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
        const limitStr = parts.pop();
        const product = parts.join(' :: ');
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

  const handleStartEdit = (productName, currentLimit) => {
    setEditingLimit(productName);
    setEditValue(currentLimit.toString());
  };

  const handleCancelEdit = () => {
    setEditingLimit(null);
    setEditValue('');
  };

  const handleSaveEdit = async (productName) => {
    const newLimit = parseInt(editValue);
    if (isNaN(newLimit) || newLimit < 0) {
      toast.error('Введите корректное число');
      return;
    }

    try {
      await axios.post(
        `${API}/stores/${storeId}/limit/update`,
        { product_name: productName, new_limit: newLimit }
      );
      toast.success('Лимит обновлен');
      setEditingLimit(null);
      setEditValue('');
      fetchStore();
    } catch (error) {
      toast.error('Ошибка обновления лимита');
    }
  };

  const handleStartEditLimitName = (productName) => {
    setEditingLimitName(productName);
    setEditNameValue(productName);
  };

  const handleCancelEditLimitName = () => {
    setEditingLimitName(null);
    setEditNameValue('');
  };

  const handleSaveLimitName = async (oldProductName) => {
    if (!editNameValue.trim()) {
      toast.error('Введите название товара');
      return;
    }

    if (editNameValue.trim() === oldProductName) {
      handleCancelEditLimitName();
      return;
    }

    try {
      await axios.post(
        `${API}/stores/${storeId}/limit/rename`,
        { product_name: oldProductName, new_name: editNameValue.trim() }
      );
      toast.success('Название обновлено');
      handleCancelEditLimitName();
      fetchStore();
    } catch (error) {
      toast.error('Ошибка обновления названия');
    }
  };

  const handleDeleteLimit = async (productName, deleteFromAll = false) => {
    try {
      await axios.post(
        `${API}/stores/${storeId}/limit/delete`,
        { product_name: productName, apply_to_all: deleteFromAll }
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
                  Лимиты: {store?.name}
                </h1>
                <p className="text-gray-600 mt-1">{store?.limits?.length || 0} лимитов настроено</p>
              </div>
            </div>
            <Button
              onClick={() => setLimitsDialogOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              <Plus className="mr-2 h-4 w-4" />
              Добавить лимиты
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8">
        <Card className="bg-white/70 backdrop-blur-sm border-0 ring-1 ring-gray-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle style={{ fontFamily: 'Manrope, sans-serif' }}>
                  Лимиты точки ({filteredLimits.length}{limitsSearchQuery && ` из ${store?.limits?.length}`})
                </CardTitle>
                <CardDescription>
                  Нажмите на лимит для редактирования
                </CardDescription>
              </div>
              <div className="relative w-80">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Поиск по названию..."
                  value={limitsSearchQuery}
                  onChange={(e) => setLimitsSearchQuery(e.target.value)}
                  className="pl-9 h-10"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {store?.limits?.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500 mb-4">Лимиты не настроены</p>
                <Button onClick={() => setLimitsDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Добавить лимиты
                </Button>
              </div>
            ) : filteredLimits.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">Ничего не найдено по запросу "{limitsSearchQuery}"</p>
              </div>
            ) : (
              <div className="rounded-lg border overflow-hidden max-h-[calc(100vh-300px)] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-gray-50 z-10">
                    <TableRow className="bg-gray-50">
                      <TableHead className="font-semibold">Товар</TableHead>
                      <TableHead className="font-semibold w-32">Лимит</TableHead>
                      <TableHead className="w-32"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLimits.map((limit, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">
                          {editingLimitName === limit.product ? (
                            <div className="flex items-center space-x-2">
                              <Input
                                value={editNameValue}
                                onChange={(e) => setEditNameValue(e.target.value)}
                                className="h-8 flex-1 min-w-[200px]"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleSaveLimitName(limit.product);
                                  } else if (e.key === 'Escape') {
                                    handleCancelEditLimitName();
                                  }
                                }}
                              />
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-green-600"
                                onClick={() => handleSaveLimitName(limit.product)}
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={handleCancelEditLimitName}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <span 
                              className="cursor-pointer hover:text-indigo-600 hover:underline"
                              onClick={() => handleStartEditLimitName(limit.product)}
                              title="Нажмите для редактирования"
                            >
                              {limit.product}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {editingLimit === limit.product ? (
                            <div className="flex items-center space-x-2">
                              <Input
                                type="number"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                className="w-20 h-8"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleSaveEdit(limit.product);
                                  } else if (e.key === 'Escape') {
                                    handleCancelEdit();
                                  }
                                }}
                              />
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-green-600"
                                onClick={() => handleSaveEdit(limit.product)}
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={handleCancelEdit}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <Badge
                              variant="outline"
                              className="bg-indigo-50 text-indigo-700 border-indigo-200 cursor-pointer hover:bg-indigo-100 transition-colors"
                              onClick={() => handleStartEdit(limit.product, limit.limit)}
                            >
                              {limit.limit}
                              <Edit2 className="h-3 w-3 ml-2" />
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteLimit(limit.product, false)}
                              className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
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

      {/* Add Limits Dialog */}
      <Dialog open={limitsDialogOpen} onOpenChange={setLimitsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Добавить лимиты</DialogTitle>
            <DialogDescription>
              Введите лимиты в формате: Товар :: число (каждый с новой строки)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Textarea
              placeholder="Пример:
Дарксайд 25 :: 2
Квазар X :: 5
МегаТор 100 :: 10"
              value={newLimitsText}
              onChange={(e) => setNewLimitsText(e.target.value)}
              className="min-h-[200px] font-mono text-sm"
            />
            <div className="flex items-center space-x-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <Switch
                id="apply-to-all"
                checked={applyToAll}
                onCheckedChange={setApplyToAll}
              />
              <Label htmlFor="apply-to-all" className="cursor-pointer">
                Добавить во все точки (не заменит существующие лимиты)
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLimitsDialogOpen(false)}>
              Отмена
            </Button>
            <Button onClick={handleAddLimits}>
              <Save className="mr-2 h-4 w-4" />
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StoreLimitsPage;
