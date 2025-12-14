import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Trash2, X, Save, Link2, Edit2 } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ProductMappings = () => {
  const navigate = useNavigate();
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [mappingToDelete, setMappingToDelete] = useState(null);
  const [mappingToEdit, setMappingToEdit] = useState(null);
  
  const [newMainProduct, setNewMainProduct] = useState('');
  const [newSynonymsText, setNewSynonymsText] = useState('');
  
  const [editMainProduct, setEditMainProduct] = useState('');
  const [editSynonymsText, setEditSynonymsText] = useState('');

  useEffect(() => {
    fetchMappings();
  }, []);

  const fetchMappings = async () => {
    try {
      const response = await axios.get(`${API}/product-mappings`);
      setMappings(response.data);
    } catch (error) {
      toast.error('Ошибка загрузки маппингов');
    } finally {
      setLoading(false);
    }
  };

  const parseSynonyms = (text) => {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  };

  const handleCreateMapping = async () => {
    if (!newMainProduct.trim()) {
      toast.error('Введите основное название товара');
      return;
    }

    const synonyms = parseSynonyms(newSynonymsText);
    if (synonyms.length === 0) {
      toast.error('Введите хотя бы один синоним');
      return;
    }

    try {
      await axios.post(`${API}/product-mappings`, {
        main_product: newMainProduct.trim(),
        synonyms,
      });
      toast.success('Маппинг создан');
      setNewMainProduct('');
      setNewSynonymsText('');
      setCreateDialogOpen(false);
      fetchMappings();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Ошибка создания маппинга');
    }
  };

  const handleOpenEdit = (mapping) => {
    setMappingToEdit(mapping);
    setEditMainProduct(mapping.main_product);
    setEditSynonymsText(mapping.synonyms.join('\n'));
    setEditDialogOpen(true);
  };

  const handleUpdateMapping = async () => {
    if (!mappingToEdit) return;

    if (!editMainProduct.trim()) {
      toast.error('Введите основное название товара');
      return;
    }

    const synonyms = parseSynonyms(editSynonymsText);

    try {
      await axios.put(`${API}/product-mappings/${mappingToEdit.id}`, {
        main_product: editMainProduct.trim(),
        synonyms,
      });
      toast.success('Маппинг обновлен');
      setEditDialogOpen(false);
      setMappingToEdit(null);
      fetchMappings();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Ошибка обновления маппинга');
    }
  };

  const handleDeleteMapping = async () => {
    try {
      await axios.delete(`${API}/product-mappings/${mappingToDelete.id}`);
      toast.success('Маппинг удален');
      setDeleteDialogOpen(false);
      setMappingToDelete(null);
      fetchMappings();
    } catch (error) {
      toast.error('Ошибка удаления маппинга');
    }
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
                data-testid="back-btn"
                onClick={() => navigate('/')}
                className="-ml-2"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Назад
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
                  Маппинг продуктов
                </h1>
                <p className="text-gray-600 mt-1">
                  Объединение синонимов товаров для суммирования остатков
                </p>
              </div>
            </div>
            <Button
              data-testid="create-mapping-btn"
              onClick={() => setCreateDialogOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              <Plus className="mr-2 h-4 w-4" />
              Добавить маппинг
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-6 py-8">
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          </div>
        ) : mappings.length === 0 ? (
          <Card className="text-center py-12 bg-white/60 backdrop-blur-sm">
            <CardContent>
              <Link2 className="h-16 w-16 mx-auto text-gray-400 mb-4" />
              <h3 className="text-xl font-semibold text-gray-700 mb-2">Нет маппингов</h3>
              <p className="text-gray-500 mb-4">
                Создайте маппинг для объединения синонимов товаров
              </p>
              <Button
                onClick={() => setCreateDialogOpen(true)}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                <Plus className="mr-2 h-4 w-4" />
                Добавить маппинг
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-white/70 backdrop-blur-sm border-0 ring-1 ring-gray-200">
            <CardHeader>
              <CardTitle style={{ fontFamily: 'Manrope, sans-serif' }}>
                Список маппингов ({mappings.length})
              </CardTitle>
              <CardDescription>
                При обработке заказа синонимы будут заменены на основное название, а остатки просуммированы
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="font-semibold">Основное название</TableHead>
                      <TableHead className="font-semibold">Синонимы</TableHead>
                      <TableHead className="w-24"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mappings.map((mapping) => (
                      <TableRow key={mapping.id} data-testid={`mapping-row-${mapping.id}`}>
                        <TableCell className="font-medium">
                          <div className="flex items-center space-x-2">
                            <Link2 className="h-4 w-4 text-indigo-500" />
                            <span>{mapping.main_product}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            {mapping.synonyms.map((synonym, idx) => (
                              <Badge
                                key={idx}
                                variant="secondary"
                                className="bg-gray-100 text-gray-700"
                              >
                                {synonym}
                              </Badge>
                            ))}
                            {mapping.synonyms.length === 0 && (
                              <span className="text-gray-400 text-sm">Нет синонимов</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              data-testid={`edit-mapping-${mapping.id}`}
                              onClick={() => handleOpenEdit(mapping)}
                              className="h-8 w-8 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              data-testid={`delete-mapping-${mapping.id}`}
                              onClick={() => {
                                setMappingToDelete(mapping);
                                setDeleteDialogOpen(true);
                              }}
                              className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* How it works */}
        <Card className="mt-6 bg-blue-50/50 border-blue-200">
          <CardHeader>
            <CardTitle className="text-blue-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
              Как это работает?
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-blue-800 space-y-2">
            <p>
              <strong>1.</strong> Создайте маппинг с основным названием товара и его синонимами.
            </p>
            <p>
              <strong>2.</strong> При обработке заказа система найдёт все синонимы в загруженных данных.
            </p>
            <p>
              <strong>3.</strong> Синонимы будут заменены на основное название, а их остатки просуммированы.
            </p>
            <p className="pt-2">
              <strong>Пример:</strong> Если у вас есть маппинг "Rocketman" → ["Рокетмен", "Rocket man"], 
              то при загрузке остатков "Рокетмен: 5" и "Rocket man: 3" они будут объединены в "Rocketman: 8".
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-lg" data-testid="create-mapping-dialog">
          <DialogHeader>
            <DialogTitle>Создать маппинг</DialogTitle>
            <DialogDescription>
              Укажите основное название товара и его синонимы
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="main-product">Основное название товара</Label>
              <Input
                id="main-product"
                data-testid="main-product-input"
                placeholder="Например: Rocketman"
                value={newMainProduct}
                onChange={(e) => setNewMainProduct(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="synonyms">Синонимы (каждый с новой строки)</Label>
              <textarea
                id="synonyms"
                data-testid="synonyms-input"
                className="w-full min-h-[120px] rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder={"Рокетмен\nRocket man\nРокет мен"}
                value={newSynonymsText}
                onChange={(e) => setNewSynonymsText(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Отмена
            </Button>
            <Button data-testid="submit-mapping-btn" onClick={handleCreateMapping}>
              <Save className="mr-2 h-4 w-4" />
              Создать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg" data-testid="edit-mapping-dialog">
          <DialogHeader>
            <DialogTitle>Редактировать маппинг</DialogTitle>
            <DialogDescription>
              Измените основное название или синонимы
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-main-product">Основное название товара</Label>
              <Input
                id="edit-main-product"
                data-testid="edit-main-product-input"
                value={editMainProduct}
                onChange={(e) => setEditMainProduct(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-synonyms">Синонимы (каждый с новой строки)</Label>
              <textarea
                id="edit-synonyms"
                data-testid="edit-synonyms-input"
                className="w-full min-h-[120px] rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                value={editSynonymsText}
                onChange={(e) => setEditSynonymsText(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Отмена
            </Button>
            <Button data-testid="update-mapping-btn" onClick={handleUpdateMapping}>
              <Save className="mr-2 h-4 w-4" />
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить маппинг?</AlertDialogTitle>
            <AlertDialogDescription>
              Вы уверены, что хотите удалить маппинг "{mappingToDelete?.main_product}"?
              Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              data-testid="confirm-delete-mapping"
              onClick={handleDeleteMapping}
              className="bg-red-600 hover:bg-red-700"
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ProductMappings;
