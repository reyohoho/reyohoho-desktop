import fetch from 'cross-fetch';
import { app, BrowserWindow, dialog, session, globalShortcut, shell, screen } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import prompt from 'electron-prompt';
import Store from 'electron-store';

const APP_NAME = `ReYohoho Torrents ${app.getVersion()}`;

app.commandLine.appendSwitch('disable-site-isolation-trials');
let mainWindow: BrowserWindow | null = null;

const store = new Store({});

if (!AbortSignal.timeout) {
  AbortSignal.timeout = function timeout(ms: number): AbortSignal {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), ms);
    return ctrl.signal;
  };
}

export async function createTorrentsWindow(kpTitle: string): Promise<void> {
  mainWindow = new BrowserWindow({
    width: screen.getPrimaryDisplay().workAreaSize.width,
    height: screen.getPrimaryDisplay().workAreaSize.height,
    autoHideMenuBar: true,
    darkTheme: true,
    backgroundColor: "#000",
    icon: 'icon.png',
    show: false,
    webPreferences: {
      contextIsolation: false,
      webSecurity: false,
      devTools: true,
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

  setTimeout(() => {
    mainWindow?.loadURL('https://reyohoho.space:9118/');
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
      mainWindow?.setTitle(APP_NAME + ` Не удалось поулчить hash(попыток: ${retryCount})`);
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
  const apiUrl = 'https://reyohoho.space:5557/torrents';
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
            const playUrl = encodeURI(`https://reyohoho.space:5557/play/${hash}/1`);
            console.log(`Final url: ${playUrl}`);
            mainWindow?.setTitle(APP_NAME + ' Успешно получена ссылка на стрим...');
            runVLC([playUrl]);
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

let isNewCredsStored = false;
function setupButtons(kpTitle: string): void {
  mainWindow?.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('magnet:')) {

      event.preventDefault();

      if (isNewCredsStored) {
        const credentials = `${store.get('login', '') as string}:${store.get('password', '') as string}`;
        const base64Credentials = Buffer.from(credentials).toString("base64");
        handleMagnet(url, base64Credentials);
      } else {
        prompt({
          title: 'Авторизация',
          label: 'Логин ReYohoho',
          value: store.get('login', '') as string,
          inputAttrs: {
            type: 'text'
          },
          type: 'input'
        })
          .then((result: string | null) => {
            if (result === null) {
              console.log('User cancelled');
            } else {
              const login = result;
              prompt({
                title: 'Авторизация',
                label: 'Пароль ReYohoho',
                value: store.get('password', '') as string,
                inputAttrs: {
                  type: 'password'
                },
                type: 'input'
              })
                .then((result: string | null) => {
                  if (result === null) {
                    console.log('User cancelled');
                  } else {
                    const password = result;
                    const credentials = `${login}:${password}`;
                    store.set("login", login);
                    store.set("password", password);
                    const base64Credentials = Buffer.from(credentials).toString("base64");
                    isNewCredsStored = true;
                    handleMagnet(url, base64Credentials);
                  }
                })
            }
          })
      }

    }
  });
  mainWindow?.webContents.on('did-finish-load', () => {
    const searchTorrents = `
      document.getElementById('s').value = "${kpTitle}"
      document.querySelector('#exactSearch').checked=true
      window.localStorage.setItem('exact', 1)
      document.querySelector('#submitButton').click()
    `;

    mainWindow?.webContents.executeJavaScript(searchTorrents);
  });
}

app.on('web-contents-created', (e, wc) => {
  wc.setWindowOpenHandler((handler) => {
    console.log("setWindowOpenHandler: " + handler.url);
    if (handler.url.startsWith('https://reyohoho.')) {
      mainWindow?.loadURL(handler.url);
      return { action: "deny" };
    } else {
      shell.openExternal(handler.url);
      return { action: "deny" };
    }
  });
});

app.on("browser-window-created", (e, win) => {
  win.removeMenu();
});


async function showTorrentFilesSelectorDialog(hash: string, files: []) {
  const paths = removeCommonPrefixFromPaths(files).map((file) => file["path"]);
  const { response } = await dialog.showMessageBox(mainWindow!, {
    type: "question",
    message: "Выберите Файл:",
    buttons: paths,
    cancelId: -1,

  });
  if (response >= 0) {
    const id = files[response];
    console.log(id);
    console.log(response);
    const playUrl = encodeURI(`https://reyohoho.space:5557/play/${hash}/${id["id"]}`);
    console.log(`Final url: ${playUrl}`);
    mainWindow?.setTitle(APP_NAME + ' Успешно получена ссылка на стрим...');
    runVLC([playUrl]);
  } else {
    mainWindow?.setTitle(APP_NAME);
  }
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

function runVLC(parameters: string[]): void {
  mainWindow?.setTitle(APP_NAME + ` Запускаем VLC...`);
  let initialPath = store.get('vlc_path', 'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe') as string;
  if (fs.existsSync(initialPath)) {
    const vlcProcess: ChildProcess = spawn(initialPath, parameters);
    vlcProcess.stdout?.on('data', (data: Buffer) => {
      console.log(`VLC stdout: ${data.toString()}`);
    });

    vlcProcess.stderr?.on('data', (data: Buffer) => {
      console.error(`VLC stderr: ${data.toString()}`);
      mainWindow?.setTitle(APP_NAME + ` VLC stderr: ${data.toString()}`);
    });

    vlcProcess.on('close', (code: number | null) => {
      if (code === 0) {
        console.log('VLC process exited successfully.');
        mainWindow?.setTitle(APP_NAME);
      } else {
        console.error(`VLC process exited with code ${code}`);
        mainWindow?.setTitle(APP_NAME + ` VLC process exited with code: ${code}`);
      }
    });

    vlcProcess.on('error', (err: Error) => {
      console.error(`Failed to start VLC: ${err.message}`);
      mainWindow?.setTitle(APP_NAME + ` Failed to start VLC: ${err.message}`);
    });
  } else {
    dialog.showOpenDialog(mainWindow!, {
      title: 'Выберите VLC.exe файл',
      defaultPath: initialPath,
      filters: [
        { name: 'Executable Files', extensions: ['exe'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    }).then(result => {
      if (!result.canceled && result.filePaths.length > 0) {
        initialPath = result.filePaths[0];
        store.set('vlc_path', initialPath);
        const vlcProcess: ChildProcess = spawn(initialPath, parameters);
        vlcProcess.stdout?.on('data', (data: Buffer) => {
          console.log(`VLC stdout: ${data.toString()}`);
        });

        vlcProcess.stderr?.on('data', (data: Buffer) => {
          console.error(`VLC stderr: ${data.toString()}`);
          mainWindow?.setTitle(APP_NAME + ` VLC stderr: ${data.toString()}`);
        });

        vlcProcess.on('close', (code: number | null) => {
          if (code === 0) {
            console.log('VLC process exited successfully.');
          } else {
            console.error(`VLC process exited with code ${code}`);
            mainWindow?.setTitle(APP_NAME + ` VLC process exited with code: ${code}`);
          }
        });

        vlcProcess.on('error', (err: Error) => {
          console.error(`Failed to start VLC: ${err.message}`);
          mainWindow?.setTitle(APP_NAME + ` Failed to start VLC: ${err.message}`);
        });
      }
    }).catch(err => {
      console.error('Ошибка при выборе файла:', err);
      mainWindow?.setTitle(APP_NAME + ` Ошибка при выборе файла: ${err}`);
    });
  }

}