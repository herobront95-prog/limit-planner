# Инструкция по созданию портативной версии

Это руководство поможет создать standalone версию приложения, которая работает без интернета.

## Вариант 1: Python + встроенный MongoDB (Проще)

### Шаг 1: Подготовка файлов

1. Скачайте portable MongoDB:
   - Windows: https://www.mongodb.com/try/download/community
   - Выберите "ZIP Archive"
   - Распакуйте в папку `mongodb/`

2. Создайте build скрипт `build_portable.py`:

```python
import os
import shutil
import subprocess
from pathlib import Path

def build_frontend():
    """Build React frontend"""
    print("Building frontend...")
    os.chdir("frontend")
    subprocess.run(["yarn", "build"])
    os.chdir("..")

def copy_files():
    """Copy necessary files to dist folder"""
    print("Copying files...")
    
    dist = Path("dist")
    dist.mkdir(exist_ok=True)
    
    # Copy backend
    shutil.copytree("backend", dist / "backend", dirs_exist_ok=True)
    
    # Copy frontend build
    shutil.copytree("frontend/build", dist / "frontend", dirs_exist_ok=True)
    
    # Copy MongoDB
    shutil.copytree("mongodb", dist / "mongodb", dirs_exist_ok=True)
    
    # Create data folder
    (dist / "data").mkdir(exist_ok=True)

def create_launcher():
    """Create launcher script"""
    print("Creating launcher...")
    
    launcher = '''
import subprocess
import webbrowser
import time
import os
from pathlib import Path
import signal
import sys

processes = []

def cleanup():
    """Kill all processes on exit"""
    for proc in processes:
        try:
            proc.terminate()
        except:
            pass

def signal_handler(sig, frame):
    cleanup()
    sys.exit(0)

signal.signal(signal.SIGINT, signal_handler)

if __name__ == "__main__":
    print("="*50)
    print("  Планировщик Заказов")
    print("="*50)
    print("")
    print("Запуск приложения...")
    
    # Start MongoDB
    print("[1/3] Запуск базы данных...")
    mongo_proc = subprocess.Popen(
        ["mongodb/bin/mongod.exe", "--dbpath", "data", "--port", "27017"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    processes.append(mongo_proc)
    time.sleep(3)
    
    # Start Backend
    print("[2/3] Запуск сервера...")
    backend_proc = subprocess.Popen(
        ["python", "-m", "uvicorn", "backend.server:app", "--host", "127.0.0.1", "--port", "8001"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    processes.append(backend_proc)
    time.sleep(3)
    
    # Start Frontend server
    print("[3/3] Запуск интерфейса...")
    frontend_proc = subprocess.Popen(
        ["python", "-m", "http.server", "3000", "--directory", "frontend"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    processes.append(frontend_proc)
    time.sleep(2)
    
    # Open browser
    print("")
    print("✓ Приложение запущено!")
    print("")
    print("Открываю браузер...")
    webbrowser.open("http://localhost:3000")
    
    print("")
    print("Для выхода нажмите Ctrl+C или закройте это окно")
    print("")
    
    try:
        # Keep running
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nЗавершение работы...")
        cleanup()
'''
    
    with open("dist/start.py", "w", encoding="utf-8") as f:
        f.write(launcher)

def create_bat():
    """Create Windows batch file"""
    bat = '''
@echo off
title Order Planner
python start.py
pause
'''
    with open("dist/Запуск.bat", "w", encoding="utf-8") as f:
        f.write(bat)

if __name__ == "__main__":
    build_frontend()
    copy_files()
    create_launcher()
    create_bat()
    print("")
    print("✓ Портативная версия готова в папке 'dist'!")
    print("")
    print("Для запуска используйте: dist/Запуск.bat")
```

3. Запустите build:
```bash
python build_portable.py
```

### Шаг 2: Тестирование

1. Перейдите в папку `dist/`
2. Запустите `Запуск.bat`
3. Приложение откроется в браузере

### Шаг 3: Распространение

Сожмите папку `dist/` в ZIP архив. Пользователи должны:
1. Распаковать архив
2. Запустить `Запуск.bat`

**Требования для пользователя:**
- Python 3.11+ (установленный в системе)
- Любой современный браузер

---

## Вариант 2: PyInstaller + Electron (Полностью автономно)

Этот вариант создает полностью автономный .exe без требования Python.

### Шаг 1: Упаковка Backend

1. Установите PyInstaller:
```bash
pip install pyinstaller
```

2. Создайте spec файл `backend.spec`:
```python
# -*- mode: python ; coding: utf-8 -*-

block_cipher = None

a = Analysis(
    ['backend/server.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('backend/.env', '.'),
    ],
    hiddenimports=['uvicorn.logging', 'uvicorn.loops.auto', 'uvicorn.protocols.http.auto'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
```

3. Соберите:
```bash
pyinstaller backend.spec
```

### Шаг 2: Настройка Electron

1. Создайте Electron проект:
```bash
mkdir electron-app
cd electron-app
npm init -y
npm install electron electron-builder
```

2. Создайте `electron-main.js`:
```javascript
const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path');

let mainWindow;
let backendProcess;
let mongoProcess;

function startMongo() {
  const mongoPath = path.join(__dirname, 'resources', 'mongodb', 'bin', 'mongod.exe');
  const dataPath = path.join(app.getPath('userData'), 'data');
  
  mongoProcess = spawn(mongoPath, ['--dbpath', dataPath, '--port', '27017']);
}

function startBackend() {
  const backendPath = path.join(__dirname, 'resources', 'backend.exe');
  backendProcess = spawn(backendPath);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    },
    icon: path.join(__dirname, 'icon.png')
  });

  // Wait for backend to start
  setTimeout(() => {
    mainWindow.loadURL('http://localhost:3000');
  }, 3000);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', () => {
  startMongo();
  setTimeout(() => startBackend(), 2000);
  setTimeout(() => createWindow(), 4000);
});

app.on('window-all-closed', () => {
  if (mongoProcess) mongoProcess.kill();
  if (backendProcess) backendProcess.kill();
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
```

3. Обновите `package.json`:
```json
{
  "name": "order-planner",
  "version": "1.0.0",
  "main": "electron-main.js",
  "scripts": {
    "start": "electron .",
    "build": "electron-builder"
  },
  "build": {
    "appId": "com.orderplanner.app",
    "productName": "Order Planner",
    "win": {
      "target": "nsis",
      "icon": "icon.ico"
    },
    "extraResources": [
      {
        "from": "../dist/backend.exe",
        "to": "backend.exe"
      },
      {
        "from": "../mongodb",
        "to": "mongodb"
      },
      {
        "from": "../frontend/build",
        "to": "frontend"
      }
    ]
  }
}
```

4. Соберите Electron app:
```bash
npm run build
```

Результат: полностью автономный установщик в `electron-app/dist/`

---

## Вариант 3: Docker (Кроссплатформенный)

Создайте `docker-compose.yml`:

```yaml
version: '3.8'

services:
  mongodb:
    image: mongo:7
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db

  backend:
    build: ./backend
    ports:
      - "8001:8001"
    environment:
      - MONGO_URL=mongodb://mongodb:27017
      - DB_NAME=order_planner
    depends_on:
      - mongodb

  frontend:
    build: ./frontend
    ports:
      - "3000:80"
    depends_on:
      - backend

volumes:
  mongo_data:
```

Запуск:
```bash
docker-compose up
```

---

## Рекомендации

**Для личного использования:** Вариант 1 (Python + Batch файл)
- ✅ Простой
- ✅ Легко обновлять
- ⚠️ Требует Python

**Для распространения:** Вариант 2 (Electron)
- ✅ Полностью автономный
- ✅ Профессиональный установщик
- ✅ Не требует Python
- ⚠️ Большой размер (~150MB)

**Для серверного развертывания:** Вариант 3 (Docker)
- ✅ Кроссплатформенный
- ✅ Легко масштабировать
- ✅ Изолированная среда
- ⚠️ Требует Docker