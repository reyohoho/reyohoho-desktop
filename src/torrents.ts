import fetch from 'cross-fetch';
import { app, BrowserWindow, dialog, shell, screen, Menu, globalShortcut, clipboard, Rectangle } from 'electron';
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
      },
      {
        label: 'Указать magnet вручную',
        click: () => {
          openMagnetInputDialog();
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

function openMagnet(magnetValue: string): void {
  const storeValue = store.get('selected_torr_server_url', '');

  const indexInStore = appConfig!.torr_server_urls.findIndex(url => url === storeValue);
  if (indexInStore !== -1) {
    const [movedValue] = appConfig!.torr_server_urls.splice(indexInStore, 1);
    const [movedLocation] = appConfig!.torr_server_locations.splice(indexInStore, 1);

    appConfig!.torr_server_urls.unshift(movedValue);
    appConfig!.torr_server_locations.unshift(movedLocation);
  }
  const servers: Record<number, string> = {};

  for (const [index, value] of appConfig!.torr_server_urls.entries()) {
    servers[index] = `${appConfig!.torr_server_locations[index]}::${value}`;
  }
  prompt({
    skipTaskbar: false,
    alwaysOnTop: true,
    title: 'Выберите сервер',
    label: 'Выберите сервер:',
    x: mainWindow!.getBounds().x + mainWindow!.getBounds().width / 2,
    y: mainWindow!.getBounds().y + mainWindow!.getBounds().height / 2,
    customStylesheet: 'dark',
    frame: true,
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
        const selectedUrl = servers[Number(result)].split('::')[1];
        selectedTorrServerUrl = selectedUrl;
        store.set('selected_torr_server_url', selectedUrl);
        handleMagnet(magnetValue, userToken!);
      }
    })
}

function openMagnetInputDialog(): void {
  prompt({
    skipTaskbar: false,
    alwaysOnTop: true,
    title: 'Введите magnet',
    x: mainWindow!.getBounds().x + mainWindow!.getBounds().width / 2,
    y: mainWindow!.getBounds().y + mainWindow!.getBounds().height / 2,
    customStylesheet: 'dark',
    frame: true,
    useHtmlLabel: true,
    height: 250,
    multiInputOptions:
      [
        {
          label: "Укажите magnet", value: null, inputAttrs: {
            type: "text",
            required: true,
          }
        },
      ],
    resizable: true,
    type: 'multiInput'
  })
    .then((result: string[] | null) => {
      if (result === null) {
        console.log('User cancelled');
      } else {
        let userMagnet = result[0];
        openMagnet(userMagnet);
      }
    })
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

export async function createTorrentsWindow(kpTitle: string, year: string | null, altname: string | null, config: AppConfig, token: string): Promise<void> {
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
      devTools: false
    }
  });

  mainWindow.setBounds(store.get('bounds') as Rectangle)

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

  setupButtons(kpTitle, year, altname);

  if (process.platform !== 'darwin') {
    mainWindow?.setMenu(menu);
  } else {
    Menu.setApplicationMenu(menu);
  }

  mainWindow?.loadURL(`${appConfig!.torrent_parser_url}/index3.html?rand=${Date.now()}`);

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
  delay: number = 1000,
  retryCount: number = 1,
  retryMaxCount: number = 50,
): Promise<any> {
  try {
    if (retryCount > retryMaxCount) {
      mainWindow?.setTitle(APP_NAME + ` Не удалось получить hash(попыток: ${retryCount}/${retryMaxCount})`);
      return;
    }
    mainWindow?.setTitle(APP_NAME + ` Получаем hash... попытка ${retryCount}/${retryMaxCount}`);
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
            const playUrl = encodeURI(`${selectedTorrServerUrl}stream/${data["file_stats"][0]["path"]}?link=${hash}&index=1&play`);
            console.log(`Final url: ${playUrl}`);
            mainWindow?.setTitle(APP_NAME + ' Успешно получена ссылка на стрим...');
            preparePlayer([playUrl], url, hash);
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

function setupButtons(kpTitle: string, year: string | null, altname: string | null): void {
  mainWindow?.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('magnet:')) {
      event.preventDefault();

      openMagnet(url);
    }
  });

  mainWindow?.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.insertCSS(`
      ::-webkit-scrollbar {
        width: 5px;
      }
      ::-webkit-scrollbar-track {
        background: #292929;
      }
      ::-webkit-scrollbar-thumb {
        background: #9f9f9f;
        border-radius: 5px;
      }
      ::-webkit-scrollbar-thumb:hover {
        background: #d1d1d1;
      }
    `);

    const searchTorrents = `
      document.getElementById('s').value = "${kpTitle}";
      document.getElementById('altname').value = "${altname}";
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
  ".flv", ".f4v", ".f4p", ".f4a", ".f4b", ".mod", ".m2ts"];

async function showTorrentFilesSelectorDialog(hash: string, files: { id: number; path: string; length: number }[], magnet: string) {
  const records: Record<number, string> = {};
  for (const [index, value] of files.filter((file) => {
    const isVideoFile = videoExtensions.some(ext => file.path.endsWith(ext));
    return isVideoFile;
  }).entries()) {
    records[index] = value.path + '?id=' + value.id;
  }

  console.log(records);
  if (Object.keys(records).length === 0) {
    dialog.showMessageBox(mainWindow!, {
      noLink: true,
      title: `В раздаче не найдены видео-файлы`,
      message: `Поддерживаемые форматы: ${videoExtensions.join(", ")}`,
      buttons: ['Ok'],
    })
    return;
  }

  let playUrl: string[] = [];
  for (const key in records) {
    const numericKey = Number(key);
    const id = records[Number(numericKey)].split('=').reverse()[0];
    const path = records[Number(numericKey)].split('?id=')[0];
    playUrl.push(encodeURI(`${selectedTorrServerUrl}stream/${path}?link=${hash}&index=${id}&play`));
  }
  console.log(`Final url: ${playUrl}.`);
  mainWindow?.setTitle(APP_NAME + ' Успешно получена ссылка на стрим...');
  preparePlayer(playUrl, magnet, hash);
}

function runPlayer(parameters: string[], magnet: string, hash: string) {
  let playerPath = store.get('vlc_path', '') as string;
  if (process.platform === 'win32') {
    dialog.showMessageBox(mainWindow!, {
      noLink: true,
      title: `Выберите плеер`,
      message: `Выберите плеер: внутренний(mpv) или внешний (${playerPath})`,
      buttons: ['Отмена', 'Внутренний(mpv)', 'Внешний', 'Сохранить как плейлист', 'Скопировать magnet'],
    }).then((result) => {
      if (result.response === 0) {
        mainWindow?.setTitle(APP_NAME);
        return;
      } else if (result.response === 1) {
        playerPath = `${__dirname}\\prebuilts\\windows\\player\\mpv.exe`;
      } else if (result.response === 2) {
        playerPath = store.get('vlc_path', '') as string;
      } else if (result.response === 3) {
        mainWindow?.setTitle(APP_NAME);
        shell.openExternal(`${selectedTorrServerUrl}playlist?hash=${hash}`);
        return;
      } else if (result.response === 4) {
        mainWindow?.setTitle(APP_NAME);
        clipboard.writeText(magnet)
        return;
      }
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
      buttons: ['Отмена', 'Открыть плеер', 'Сохранить как плейлист', 'Скопировать magnet'],
    }).then((result) => {
      if (result.response === 0) {
        mainWindow?.setTitle(APP_NAME);
        return;
      } else if (result.response === 1) {
        playerPath = store.get('vlc_path', '') as string;
      } else if (result.response === 2) {
        mainWindow?.setTitle(APP_NAME);
        shell.openExternal(`${selectedTorrServerUrl}playlist?hash=${hash}`);
        return;
      } else if (result.response === 3) {
        mainWindow?.setTitle(APP_NAME);
        clipboard.writeText(magnet)
        return;
      }
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

function preparePlayer(parameters: string[], magnet: string, hash: string): void {
  mainWindow?.setTitle(APP_NAME + ` Запускаем плеер...`);
  let initialPath = store.get('vlc_path', '') as string;
  if (initialPath.length !== 0 && fs.existsSync(initialPath)) {
    runPlayer(parameters, magnet, hash);
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
      runPlayer(parameters, magnet, hash);
    }
  }).catch(err => {
    console.error('Ошибка при выборе файла:', err);
    mainWindow?.setTitle(APP_NAME + ` Ошибка при выборе файла: ${err}`);
  });
}