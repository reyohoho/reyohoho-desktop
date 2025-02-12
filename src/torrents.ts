import fetch from 'cross-fetch';
import { app, BrowserWindow, dialog, shell, screen, Menu } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import prompt from 'custom-electron-prompt';
import Store from 'electron-store';
import { AppConfig } from './main.js'

const APP_NAME = `ReYohoho Torrents ${app.getVersion()}`;

app.commandLine.appendSwitch('disable-site-isolation-trials');
let mainWindow: BrowserWindow | null = null;
let appConfig: AppConfig | null = null;
const store = new Store({});
let userToken: string | null = null;
const menu = Menu.buildFromTemplate([
  {
    label: 'Настройки',
    submenu: [
      {
        label: 'Сменить путь к плееру',
        click: () => {
          changePlayerPath();
        }
      }
    ]
  }
]);

if (!AbortSignal.timeout) {
  AbortSignal.timeout = function timeout(ms: number): AbortSignal {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), ms);
    return ctrl.signal;
  };
}

function changePlayerPath(): void {
  let initialPath = '';
  let hintPath = '';
  let fileFilters;
  if (process.platform === 'win32') {
    fileFilters = [
      { name: 'Executable Files', extensions: ['exe'] },
      { name: 'All Files', extensions: ['*'] }
    ]
    initialPath = 'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe';
    hintPath = 'Укажите путь к VLC.exe или к mpc-hc64.exe';
  } else {
    fileFilters = [
      { name: 'All Files', extensions: ['*'] }
    ]
    initialPath = '/usr/bin/';
    hintPath = 'Укажите путь к бинарнику VLC';
  }

  dialog.showOpenDialog(mainWindow!, {
    title: hintPath,
    defaultPath: initialPath,
    filters: fileFilters,
    properties: ['openFile']
  }).then(result => {
    if (!result.canceled && result.filePaths.length > 0) {
      initialPath = result.filePaths[0];
      store.set('vlc_path', initialPath);
    }
  }).catch(err => {
    console.error('Ошибка при выборе файла:', err);
    mainWindow?.setTitle(APP_NAME + ` Ошибка при выборе файла: ${err}`);
  });
}

export async function createTorrentsWindow(kpTitle: string, config: AppConfig, token: string): Promise<void> {
  appConfig = config;
  userToken = token;

  mainWindow = new BrowserWindow({
    width: screen.getPrimaryDisplay().workAreaSize.width,
    height: screen.getPrimaryDisplay().workAreaSize.height,
    darkTheme: true,
    backgroundColor: "#000",
    icon: 'icon.png',
    show: false,
    webPreferences: {
      contextIsolation: false,
      webSecurity: false,
      devTools: false,
    }
  });
  mainWindow.once('ready-to-show', () => {
    mainWindow?.maximize();
    mainWindow?.show();
    mainWindow?.focus();
  });

  mainWindow?.loadFile("loader.html");

  mainWindow.setTitle(APP_NAME + ' Loading ....');

  mainWindow.webContents.on('did-start-loading', () => {
    mainWindow?.setTitle(APP_NAME + ' Loading ....');
  });

  mainWindow.webContents.on('did-stop-loading', () => {
    mainWindow?.setTitle(APP_NAME);
  });

  setupButtons(kpTitle);

  mainWindow?.setMenu(menu);

  setTimeout(() => {
    mainWindow?.loadURL(`${appConfig!.torrent_parser_url}?rand=${Date.now()}`, { "extraHeaders": "pragma: no-cache\n" });
  }, 1000);

  mainWindow.on('closed', function () {
    mainWindow = null
  })
}

interface FetchOptions {
  method: string;
  headers: Record<string, string>;
  body?: string;
}

async function fetchWithRetry(
  url: string,
  options: FetchOptions,
  delay: number = 200,
  retryCount: number = 1,
): Promise<any> {
  try {
    if (retryCount > 50) {
      mainWindow?.setTitle(APP_NAME + ` Не удалось получить hash(попыток: ${retryCount})`);
      return;
    }
    mainWindow?.setTitle(APP_NAME + ` Получаем hash... попытка ${retryCount}`);
    const response = await fetch(url, options);
    const data = await response.json();
    console.log(`Stat: ${data["stat"]}`)
    if (data["stat"] === 3) {
      return data;
    } else {
      console.log(`Status: ${response.status}. Retry in ${delay} ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchWithRetry(url, options, delay, ++retryCount);
    }
  } catch (error) {
    console.error('Error:', error);
    await new Promise(resolve => setTimeout(resolve, delay));
    return fetchWithRetry(url, options, delay, ++retryCount);
  }
}

function handleMagnet(url: string, base64Credentials: string): void {
  const apiUrl = `${appConfig!.torr_server_url}torrents`;
  const raw = JSON.stringify({
    "action": "add",
    "link": url
  });

  fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${base64Credentials}`
    },
    body: raw,
  })
    .then(response => {
      if (response.status === 401) {
        return Promise.reject('Ошибка 401: Неверные учетные данные');
      }

      if (!response.ok) {
        return Promise.reject(`Ошибка ${response.status}: ${response.statusText}`);
      }

      return response.json();
    })
    .then(result => {
      const hash = result["hash"]
      mainWindow?.setTitle(APP_NAME + ' Получаем hash...');
      console.log('Hash:', hash);
      const raw2 = JSON.stringify({
        "action": "get",
        "hash": hash
      });
      const options: FetchOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${base64Credentials}`
        },
        body: raw2,
      };

      fetchWithRetry(apiUrl, options)
        .then(data => {
          if (data["file_stats"].length === 0) {
            mainWindow?.setTitle(APP_NAME + ' Ошибка, файлы в торренте не найдены...');
            return;
          }
          if (data["file_stats"].length === 1) {
            const playUrl = encodeURI(`${appConfig!.torr_server_url}play/${hash}/1`);
            console.log(`Final url: ${playUrl}`);
            mainWindow?.setTitle(APP_NAME + ' Успешно получена ссылка на стрим...');
            preparePlayer([playUrl]);
          } else {
            showTorrentFilesSelectorDialog(hash, data["file_stats"]);
          }

        })
        .catch(error => {
          console.error('Failed get torrent:', error);
          mainWindow?.setTitle(APP_NAME + ` Ошибка при получении ссылки на стрим: ${error}`);
        });

    })
    .catch(error => {
      console.error('Get torrent hash failed:', error);
      mainWindow?.setTitle(APP_NAME + ` Ошибка при получении hash: ${error}`);
    });
}

function setupButtons(kpTitle: string): void {
  mainWindow?.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('magnet:')) {
      event.preventDefault();
      handleMagnet(url, userToken!);
    }
  });
  mainWindow?.webContents.on('did-finish-load', () => {
    const searchTorrents = `
      document.getElementById('s').value = "${kpTitle}"
      document.querySelector('#exactSearch').checked=true
      window.localStorage.setItem('exact', 1)
      document.querySelector('#submitButton').click()
      document.querySelector('#submitButton').click()
      document.querySelector('#submitButton').click()
    `;

    mainWindow?.webContents.executeJavaScript(searchTorrents);
  });
}

app.on('web-contents-created', (e, wc) => {
  wc.setWindowOpenHandler((handler) => {
    console.log("setWindowOpenHandler: " + handler.url);
    if (handler.url.startsWith(appConfig!.url_handler_deny)) {
      mainWindow?.loadURL(handler.url);
      return { action: "deny" };
    } else {
      shell.openExternal(handler.url);
      return { action: "deny" };
    }
  });
});

async function showTorrentFilesSelectorDialog(hash: string, files: { id: number; path: string; length: number }[]) {
  const records: Record<number, string> = {};

  for (const [index, value] of files.filter((file) => !file.path.endsWith('.srt')).entries()) {
    records[index] = value.path + '?id=' + value.id;
  }
  console.log(records);
  prompt({
    skipTaskbar: false,
    alwaysOnTop: true,
    title: 'Выберите элемент',
    label: 'Выберите Файл:',
    type: 'select',
    resizable: true,
    width: 1000,
    selectOptions: records
  })
    .then((result: string | null) => {
      if (result === null) {
        console.log('User cancelled');
        mainWindow?.setTitle(APP_NAME);
      } else {
        console.log(result);
        const id = records[Number(result)].split('=').reverse()[0];
        console.log(id);
        const playUrl = encodeURI(`${appConfig!.torr_server_url}play/${hash}/${id}`);
        console.log(`Final url: ${playUrl}`);
        mainWindow?.setTitle(APP_NAME + ' Успешно получена ссылка на стрим...');
        preparePlayer([playUrl]);
      }
    })
}

const findCommonPrefix = (paths: string[]): string => {
  if (paths.length === 0) return '';

  let prefix = paths[0];
  for (let i = 1; i < paths.length; i++) {
    let j = 0;
    while (j < prefix.length && j < paths[i].length && prefix[j] === paths[i][j]) {
      j++;
    }
    prefix = prefix.slice(0, j);
    if (prefix === '') break;
  }

  return prefix;
};

const removeCommonPrefixFromPaths = (fileStats: { id: number; path: string; length: number }[]) => {
  const paths = fileStats.map(file => file.path);
  const commonPrefix = findCommonPrefix(paths);

  return fileStats.map(file => {
    const newPath = file.path.replace(commonPrefix, '');
    return { ...file, path: newPath };
  });
};

function runPlayer(parameters: string[]) {
  let playerPath = store.get('vlc_path', '') as string;
  const playerProcess: ChildProcess = spawn(playerPath, parameters);
  playerProcess.stdout?.on('data', (data: Buffer) => {
    console.log(`player stdout: ${data.toString()}`);
  });

  playerProcess.stderr?.on('data', (data: Buffer) => {
    console.error(`player stderr: ${data.toString()}`);
    mainWindow?.setTitle(APP_NAME + ` player stderr: ${data.toString()}`);
  });

  playerProcess.on('close', (code: number | null) => {
    if (code === 0) {
      console.log('player process exited successfully.');
    } else {
      console.error(`player process exited with code ${code}`);
      mainWindow?.setTitle(APP_NAME + ` player process exited with code: ${code}`);
    }
  });

  playerProcess.on('error', (err: Error) => {
    console.error(`Failed to start player: ${err.message}`);
    mainWindow?.setTitle(APP_NAME + ` Failed to start player: ${err.message}`);
  });
}

function preparePlayer(parameters: string[]): void {
  mainWindow?.setTitle(APP_NAME + ` Запускаем плеер...`);
  let initialPath = store.get('vlc_path', '') as string;
  if (initialPath.length !== 0 && fs.existsSync(initialPath)) {
    runPlayer(parameters);
    return;
  }
  let hintPath = '';
  let fileFilters;
  if (process.platform === 'win32') {
    fileFilters = [
      { name: 'Executable Files', extensions: ['exe'] },
      { name: 'All Files', extensions: ['*'] }
    ]
    initialPath = 'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe';
    hintPath = 'Укажите путь к VLC.exe или к mpc-hc64.exe';
  } else {
    fileFilters = [
      { name: 'All Files', extensions: ['*'] }
    ]
    initialPath = '/usr/bin/';
    hintPath = 'Укажите путь к бинарнику VLC';
  }

  dialog.showOpenDialog(mainWindow!, {
    title: hintPath,
    defaultPath: initialPath,
    filters: fileFilters,
    properties: ['openFile']
  }).then(result => {
    if (!result.canceled && result.filePaths.length > 0) {
      initialPath = result.filePaths[0];
      store.set('vlc_path', initialPath);
      runPlayer(parameters);
    }
  }).catch(err => {
    console.error('Ошибка при выборе файла:', err);
    mainWindow?.setTitle(APP_NAME + ` Ошибка при выборе файла: ${err}`);
  });
}