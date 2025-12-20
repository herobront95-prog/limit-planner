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
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { toast } from 'sonner';
import { Plus, Store as StoreIcon, Trash2, Edit2, FileSpreadsheet, Link2, Check, X, Database } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const Dashboard = () => {
  const navigate = useNavigate();
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [storeToDelete, setStoreToDelete] = useState(null);
  const [newStoreName, setNewStoreName] = useState('');
  const [copyFromStoreId, setCopyFromStoreId] = useState('');
  const [editingStoreId, setEditingStoreId] = useState(null);
  const [editStoreName, setEditStoreName] = useState('');

  useEffect(() => {
    fetchStores();
  }, []);

  const fetchStores = async () => {
    try {
      const response = await axios.get(`${API}/stores`);
      setStores(response.data);
    } catch (error) {
      toast.error('Ошибка загрузки точек');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateStore = async () => {
    if (!newStoreName.trim()) {
      toast.error('Введите название точки');
      return;
    }

    try {
      await axios.post(`${API}/stores`, {
        name: newStoreName,
        copy_from_id: copyFromStoreId || null,
      });
      toast.success('Точка создана');
      setNewStoreName('');
      setCopyFromStoreId('');
      setCreateDialogOpen(false);
      fetchStores();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Ошибка создания точки');
    }
  };

  const handleDeleteStore = async () => {
    try {
      await axios.delete(`${API}/stores/${storeToDelete.id}`);
      toast.success('Точка удалена');
      setDeleteDialogOpen(false);
      setStoreToDelete(null);
      fetchStores();
    } catch (error) {
      toast.error('Ошибка удаления точки');
    }
  };

  const handleStartEditStoreName = (e, store) => {
    e.stopPropagation();
    setEditingStoreId(store.id);
    setEditStoreName(store.name);
  };

  const handleCancelEditStoreName = (e) => {
    if (e) e.stopPropagation();
    setEditingStoreId(null);
    setEditStoreName('');
  };

  const handleSaveStoreName = async (e) => {
    e.stopPropagation();
    if (!editStoreName.trim()) {
      toast.error('Введите название точки');
      return;
    }

    try {
      await axios.put(`${API}/stores/${editingStoreId}`, {
        name: editStoreName.trim(),
      });
      toast.success('Название обновлено');
      setEditingStoreId(null);
      setEditStoreName('');
      fetchStores();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Ошибка обновления');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <div className="border-b bg-white/80 backdrop-blur-sm shadow-sm">
        <div className="container mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900" style={{ fontFamily: 'Manrope, sans-serif' }}>
                Планировщик Заказов
              </h1>
              <p className="text-gray-600 mt-1">Управление торговыми точками и лимитами</p>
            </div>
            <div className="flex space-x-3">
              <Button 
                data-testid="mappings-btn"
                variant="outline"
                className="border-indigo-200 hover:bg-indigo-50"
                onClick={() => navigate('/mappings')}
              >
                <Link2 className="mr-2 h-4 w-4" />
                Маппинг продуктов
              </Button>
              <Button 
                variant="outline"
                className="border-green-200 hover:bg-green-50"
                onClick={() => navigate('/global-stock')}
              >
                <Database className="mr-2 h-4 w-4" />
                Загрузить общие остатки
              </Button>
              <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button 
                    data-testid="create-store-btn"
                    className="bg-indigo-600 hover:bg-indigo-700 shadow-md"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Создать точку
                  </Button>
                </DialogTrigger>
              <DialogContent data-testid="create-store-dialog">
                <DialogHeader>
                  <DialogTitle>Создать новую точку</DialogTitle>
                  <DialogDescription>
                    Введите название новой торговой точки
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="store-name">Название точки</Label>
                    <Input
                      id="store-name"
                      data-testid="store-name-input"
                      placeholder="Например: Магазин №1"
                      value={newStoreName}
                      onChange={(e) => setNewStoreName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="copy-from">Скопировать лимиты из (опционально)</Label>
                    <Select value={copyFromStoreId} onValueChange={setCopyFromStoreId}>
                      <SelectTrigger id="copy-from" data-testid="copy-from-select">
                        <SelectValue placeholder="Выберите точку" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Не копировать</SelectItem>
                        {stores.map((store) => (
                          <SelectItem key={store.id} value={store.id}>
                            {store.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                    Отмена
                  </Button>
                  <Button data-testid="create-store-submit" onClick={handleCreateStore}>
                    Создать
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-6 py-8">
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          </div>
        ) : stores.length === 0 ? (
          <Card className="text-center py-12 bg-white/60 backdrop-blur-sm">
            <CardContent>
              <FileSpreadsheet className="h-16 w-16 mx-auto text-gray-400 mb-4" />
              <h3 className="text-xl font-semibold text-gray-700 mb-2">Нет торговых точек</h3>
              <p className="text-gray-500 mb-4">Создайте первую точку для начала работы</p>
              <Button onClick={() => setCreateDialogOpen(true)} className="bg-indigo-600 hover:bg-indigo-700">
                <Plus className="mr-2 h-4 w-4" />
                Создать точку
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {stores.map((store) => (
              <Card 
                key={store.id} 
                data-testid={`store-card-${store.id}`}
                className="bg-white/70 backdrop-blur-sm hover:shadow-lg transition-all duration-300 border-0 ring-1 ring-gray-200 hover:ring-indigo-300 cursor-pointer group"
                onClick={() => editingStoreId !== store.id && navigate(`/store/${store.id}`)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="p-3 bg-indigo-100 rounded-lg group-hover:bg-indigo-200 transition-colors">
                        <StoreIcon className="h-6 w-6 text-indigo-600" />
                      </div>
                      <div>
                        {editingStoreId === store.id ? (
                          <div className="flex items-center space-x-2" onClick={(e) => e.stopPropagation()}>
                            <Input
                              value={editStoreName}
                              onChange={(e) => setEditStoreName(e.target.value)}
                              className="h-8 w-40"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleSaveStoreName(e);
                                } else if (e.key === 'Escape') {
                                  handleCancelEditStoreName(e);
                                }
                              }}
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-green-600"
                              onClick={handleSaveStoreName}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={handleCancelEditStoreName}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <div 
                            className="flex items-center group/name cursor-pointer"
                            onClick={(e) => handleStartEditStoreName(e, store)}
                          >
                            <CardTitle className="text-xl" style={{ fontFamily: 'Manrope, sans-serif' }}>
                              {store.name}
                            </CardTitle>
                            <Edit2 className="h-3 w-3 ml-2 text-gray-400 opacity-0 group-hover/name:opacity-100 transition-opacity" />
                          </div>
                        )}
                        <CardDescription className="mt-1">
                          {store.limits.length} лимитов
                        </CardDescription>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      data-testid={`delete-store-${store.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setStoreToDelete(store);
                        setDeleteDialogOpen(true);
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between text-sm text-gray-600">
                    <span>Создано: {new Date(store.created_at).toLocaleDateString('ru-RU')}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить точку?</AlertDialogTitle>
            <AlertDialogDescription>
              Вы уверены, что хотите удалить точку "{storeToDelete?.name}"?
              Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              data-testid="confirm-delete-store"
              onClick={handleDeleteStore}
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

export default Dashboard;