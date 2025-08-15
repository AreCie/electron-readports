const { app, BrowserWindow, ipcMain } = require('electron');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const path = require('path');

let mainWindow;
let currentPort = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    title: '串口读取工具',
    icon: path.join(__dirname, 'assets', 'icon.ico')
  });

  mainWindow.loadFile('src/index.html');

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (currentPort && currentPort.isOpen) {
    currentPort.close();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// 获取可用串口列表
ipcMain.handle('get-serial-ports', async () => {
  try {
    const ports = await SerialPort.list();
    return ports.map(port => ({
      path: port.path,
      manufacturer: port.manufacturer || '未知',
      serialNumber: port.serialNumber || '未知',
      vendorId: port.vendorId || '未知',
      productId: port.productId || '未知'
    }));
  } catch (error) {
    console.error('获取串口列表失败:', error);
    return [];
  }
});

// 打开串口
ipcMain.handle('open-serial-port', async (event, portPath, baudRate) => {
  try {
    if (currentPort && currentPort.isOpen) {
      currentPort.close();
    }

    currentPort = new SerialPort({
      path: portPath,
      baudRate: parseInt(baudRate),
      autoOpen: false
    });

    const parser = currentPort.pipe(new ReadlineParser({ delimiter: '\n' }));

    return new Promise((resolve, reject) => {
      currentPort.open((err) => {
        if (err) {
          reject(err);
          return;
        }

        parser.on('data', (data) => {
          mainWindow.webContents.send('serial-data', {
            timestamp: new Date().toLocaleString(),
            data: data.toString().trim()
          });
        });

        currentPort.on('error', (err) => {
          mainWindow.webContents.send('serial-error', err.message);
        });

        resolve({ success: true, message: '串口连接成功' });
      });
    });
  } catch (error) {
    return { success: false, message: error.message };
  }
});

// 关闭串口
ipcMain.handle('close-serial-port', async () => {
  try {
    if (currentPort && currentPort.isOpen) {
      currentPort.close();
      return { success: true, message: '串口已关闭' };
    }
    return { success: true, message: '串口未打开' };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

// 发送数据到串口
ipcMain.handle('send-serial-data', async (event, data) => {
  try {
    if (currentPort && currentPort.isOpen) {
      currentPort.write(data + '\n');
      return { success: true, message: '数据发送成功' };
    }
    return { success: false, message: '串口未连接' };
  } catch (error) {
    return { success: false, message: error.message };
  }
});
