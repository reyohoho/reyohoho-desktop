import fetch from 'cross-fetch';
import { app, BrowserWindow, dialog, shell, screen, Menu, globalShortcut, clipboard } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import prompt from 'custom-electron-prompt';
import Store from 'electron-store';
import { AppConfig } from './main.js'
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const APP_NAME = `ReYohoho Torrents ${app.getVersion()}`;

app.commandLine.appendSwitch('disable-site-isolation-trials');
let mainWindow: BrowserWindow | null = null;
let appConfig: AppConfig | null = null;
const store = new Store({});
let userToken: string | null = null;
let selectedTorrServerUrl: string | null = null;

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
  } else if (process.platform === 'darwin') {
    fileFilters = [
      { name: 'All Files', extensions: ['*'] }
    ]
    initialPath = '/Applications/';
    hintPath = 'Укажите путь к VLC.app';
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
      if (process.platform === 'darwin') {
        store.set('vlc_path', `${initialPath}/Contents/MacOS/VLC`);
      } else {
        store.set('vlc_path', initialPath);
      }
    }
  }).catch(err => {
    console.error('Ошибка при выборе файла:', err);
    mainWindow?.setTitle(APP_NAME + ` Ошибка при выборе файла: ${err}`);
  });
}

export async function createTorrentsWindow(kpTitle: string, year: string | null, config: AppConfig, token: string): Promise<void> {
  appConfig = config;
  selectedTorrServerUrl = config.torr_server_urls[0];
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
      partition: 'temp'
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

  setupButtons(kpTitle, year);

  if (process.platform !== 'darwin') {
    mainWindow?.setMenu(menu);
  } else {
    Menu.setApplicationMenu(menu);
  }

  setTimeout(() => {
    const session = mainWindow?.webContents.session;
    session?.clearCache();
    session?.clearStorageData({
      storages: ['localstorage']
    });
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
  const apiUrl = `${selectedTorrServerUrl}torrents`;
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
            const playUrl = encodeURI(`${selectedTorrServerUrl}play/${hash}/1`);
            console.log(`Final url: ${playUrl}`);
            mainWindow?.setTitle(APP_NAME + ' Успешно получена ссылка на стрим...');
            preparePlayer([playUrl], url);
          } else {
            showTorrentFilesSelectorDialog(hash, data["file_stats"], url);
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

function setupButtons(kpTitle: string, year: string | null): void {
  mainWindow?.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('magnet:')) {
      event.preventDefault();

      const servers: Record<number, string> = {};

      for (const [index, value] of appConfig!.torr_server_urls.entries()) {
        servers[index] = value;
      }
      prompt({
        skipTaskbar: false,
        alwaysOnTop: true,
        title: 'Выберите сервер',
        label: 'Выберите сервер:',
        type: 'select',
        resizable: true,
        width: 1000,
        selectOptions: servers
      })
        .then((result: string | null) => {
          if (result === null) {
            console.log('User cancelled');
            mainWindow?.setTitle(APP_NAME);
          } else {
            selectedTorrServerUrl = servers[Number(result)];
            handleMagnet(url, userToken!);
          }
        })
    }
  });

  mainWindow?.webContents.on('did-finish-load', () => {
    const searchTorrents = `
      document.getElementById('s').value = "${kpTitle}";
      document.querySelector('#exactSearch').checked=true;
      window.localStorage.setItem('exact', 1);
      document.querySelector('#submitButton').click();
      if(${year}) {
              function waitYear() {
                const selectElement = document.querySelector('select[name="year"]');
                if (selectElement) {
                  const option = selectElement.querySelector('option[value="${year}"]');
                  if (option) {
                    selectElement.value = '${year}';
                    const event = new Event('change', { bubbles: true });
                    selectElement.dispatchEvent(event);
                    clearInterval(intervalId);
                  }
                }
            }

            var intervalId = setInterval(waitYear, 500);
        }
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

const videoExtensions = [".webm", ".mkv", ".flv", ".vob", ".ogv", ".ogg", ".rrc", ".gifv",
  ".mng", ".mov", ".avi", ".qt", ".wmv", ".yuv", ".rm", ".asf", ".amv", ".mp4", ".m4p", ".m4v",
  ".mpg", ".mp2", ".mpeg", ".mpe", ".mpv", ".m4v", ".svi", ".3gp", ".3g2", ".mxf", ".roq", ".nsv",
  ".flv", ".f4v", ".f4p", ".f4a", ".f4b", ".mod"];

async function showTorrentFilesSelectorDialog(hash: string, files: { id: number; path: string; length: number }[], magnet: string) {
  const records: Record<number, string> = {};
  for (const [index, value] of files.filter((file) => {
    const isVideoFile = videoExtensions.some(ext => file.path.endsWith(ext));
    return isVideoFile;
  }).entries()) {
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
        const playUrl = encodeURI(`${selectedTorrServerUrl}play/${hash}/${id}`);
        console.log(`Final url: ${playUrl}`);
        mainWindow?.setTitle(APP_NAME + ' Успешно получена ссылка на стрим...');
        preparePlayer([playUrl], magnet);
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

function runPlayer(parameters: string[], magnet: string) {
  let playerPath = store.get('vlc_path', '') as string;
  if (process.platform === 'win32') {
    dialog.showMessageBox(mainWindow!, {
      noLink: true,
      title: `Выберите плеер`,
      message: `Выберите плеер: внутренний(mpv) или внешний (${playerPath})`,
      buttons: ['Внутренний(mpv)', 'Внешний', 'Скопировать ссылку на стрим', 'Скопировать magnet'],
    }).then((result) => {
      if (result.response === 0) {
        playerPath = `${__dirname}\\prebuilts\\windows\\player\\mpv.exe`;
      } else if (result.response === 1) {
        playerPath = store.get('vlc_path', '') as string;
      } else if (result.response === 2) {
        clipboard.writeText(parameters.join())
        return;
      } else if (result.response === 3) {
        clipboard.writeText(magnet)
        return;
      }
      globalShortcut.unregister('F2');
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
    });
  } else {
    dialog.showMessageBox(mainWindow!, {
      noLink: true,
      title: `Выберите действие`,
      message: ``,
      buttons: ['Открыть плеер', 'Скопировать ссылку на стрим', 'Скопировать magnet'],
    }).then((result) => {
      if (result.response === 0) {
        playerPath = store.get('vlc_path', '') as string;
      } else if (result.response === 1) {
        clipboard.writeText(parameters.join())
        return;
      } else if (result.response === 2) {
        clipboard.writeText(magnet)
        return;
      }
      globalShortcut.unregister('F2');
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
    });
  }
};

function preparePlayer(parameters: string[], magnet: string): void {
  mainWindow?.setTitle(APP_NAME + ` Запускаем плеер...`);
  let initialPath = store.get('vlc_path', '') as string;
  if (initialPath.length !== 0 && fs.existsSync(initialPath)) {
    runPlayer(parameters, magnet);
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
  } else if (process.platform === 'darwin') {
    fileFilters = [
      { name: 'All Files', extensions: ['*'] }
    ]
    initialPath = '/Applications/';
    hintPath = 'Укажите путь к VLC.app';
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
      if (process.platform === 'darwin') {
        store.set('vlc_path', `${initialPath}/Contents/MacOS/VLC`);
      } else {
        store.set('vlc_path', initialPath);
      }
      runPlayer(parameters, magnet);
    }
  }).catch(err => {
    console.error('Ошибка при выборе файла:', err);
    mainWindow?.setTitle(APP_NAME + ` Ошибка при выборе файла: ${err}`);
  });
}