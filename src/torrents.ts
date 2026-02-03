import fetch from 'cross-fetch';
import { app, BrowserWindow, dialog, shell, screen, Menu, globalShortcut, clipboard, Rectangle, ipcMain } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import Store from 'electron-store';
import { AppConfig } from './main.js'
import { fileURLToPath } from 'url';
import { dirname } from 'path';


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const APP_NAME = `ReYohoho Torrents ${app.getVersion()}`;

app.commandLine.appendSwitch('disable-site-isolation-trials');
let mainWindow: BrowserWindow | null = null;
let wizardWindow: BrowserWindow | null = null;
let magnetInputWindow: BrowserWindow | null = null;
let appConfig: AppConfig | null = null;
const store = new Store({});
let userToken: string | null = null;
let selectedTorrServerUrl: string | null = null;
let currentMagnetUrl: string | null = null;
let currentTorrentHash: string | null = null;

const videoExtensions = [".webm", ".mkv", ".flv", ".vob", ".ogv", ".ogg", ".rrc", ".gifv",
  ".mng", ".mov", ".avi", ".qt", ".wmv", ".yuv", ".rm", ".asf", ".amv", ".mp4", ".m4p", ".m4v",
  ".mpg", ".mp2", ".mpeg", ".mpe", ".mpv", ".m4v", ".svi", ".3gp", ".3g2", ".mxf", ".roq", ".nsv",
  ".flv", ".f4v", ".f4p", ".f4a", ".f4b", ".mod", ".m2ts"];

interface PlayerInfo {
  name: string;
  path: string;
  args?: string[];
}

const knownPlayers: { [platform: string]: PlayerInfo[] } = {
  win32: [
    { name: 'VLC', path: 'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe' },
    { name: 'VLC (x86)', path: 'C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe' },
    { name: 'MPC-HC', path: 'C:\\Program Files\\MPC-HC\\mpc-hc64.exe' },
    { name: 'MPC-HC (x86)', path: 'C:\\Program Files (x86)\\MPC-HC\\mpc-hc.exe' },
    { name: 'MPC-BE', path: 'C:\\Program Files\\MPC-BE x64\\mpc-be64.exe' },
    { name: 'MPC-BE (x86)', path: 'C:\\Program Files (x86)\\MPC-BE\\mpc-be.exe' },
    { name: 'PotPlayer', path: 'C:\\Program Files\\DAUM\\PotPlayer\\PotPlayerMini64.exe' },
    { name: 'PotPlayer (x86)', path: 'C:\\Program Files (x86)\\DAUM\\PotPlayer\\PotPlayerMini.exe' },
    { name: 'KMPlayer', path: 'C:\\Program Files (x86)\\KMPlayer\\KMPlayer.exe' },
    { name: 'mpv', path: 'C:\\Program Files\\mpv\\mpv.exe' },
    { name: 'mpv (scoop)', path: `${process.env.USERPROFILE}\\scoop\\apps\\mpv\\current\\mpv.exe` },
  ],
  linux: [
    { name: 'VLC', path: '/usr/bin/vlc' },
    { name: 'VLC (Flatpak)', path: '/var/lib/flatpak/exports/bin/org.videolan.VLC' },
    { name: 'VLC (Snap)', path: '/snap/bin/vlc' },
    { name: 'mpv', path: '/usr/bin/mpv' },
    { name: 'mpv (Flatpak)', path: '/var/lib/flatpak/exports/bin/io.mpv.Mpv' },
    { name: 'Celluloid', path: '/usr/bin/celluloid' },
    { name: 'Celluloid (Flatpak)', path: '/var/lib/flatpak/exports/bin/io.github.celluloid_player.Celluloid' },
    { name: 'SMPlayer', path: '/usr/bin/smplayer' },
    { name: 'Totem', path: '/usr/bin/totem' },
    { name: 'Haruna', path: '/usr/bin/haruna' },
    { name: 'Haruna (Flatpak)', path: '/var/lib/flatpak/exports/bin/org.kde.haruna' },
    { name: 'GNOME Videos', path: '/usr/bin/gnome-videos' },
    { name: 'Parole', path: '/usr/bin/parole' },
    { name: 'Dragon Player', path: '/usr/bin/dragon' },
  ],
  darwin: [
    { name: 'VLC', path: '/Applications/VLC.app/Contents/MacOS/VLC' },
    { name: 'IINA', path: '/Applications/IINA.app/Contents/MacOS/IINA' },
    { name: 'mpv', path: '/usr/local/bin/mpv' },
    { name: 'mpv (Homebrew ARM)', path: '/opt/homebrew/bin/mpv' },
    { name: 'Elmedia Player', path: '/Applications/Elmedia Player.app/Contents/MacOS/Elmedia Player' },
    { name: 'Infuse', path: '/Applications/Infuse 7.app/Contents/MacOS/Infuse 7' },
    { name: 'QuickTime Player', path: '/System/Applications/QuickTime Player.app/Contents/MacOS/QuickTime Player' },
  ]
};

function detectAvailablePlayers(): PlayerInfo[] {
  const platform = process.platform;
  const players: PlayerInfo[] = [];
  
  const platformPlayers = knownPlayers[platform] || [];
  
  for (const player of platformPlayers) {
    if (fs.existsSync(player.path)) {
      players.push(player);
    }
  }
  
  const savedPath = store.get('vlc_path', '') as string;
  if (savedPath && fs.existsSync(savedPath)) {
    const isAlreadyListed = players.some(p => p.path === savedPath);
    if (!isAlreadyListed) {
      players.unshift({ name: 'Сохранённый плеер', path: savedPath });
    }
  }
  
  return players;
}

function getCurrentExternalPlayer(): PlayerInfo | null {
  const savedPath = store.get('vlc_path', '') as string;
  
  if (savedPath && fs.existsSync(savedPath)) {
    const platform = process.platform;
    const platformPlayers = knownPlayers[platform] || [];
    const knownPlayer = platformPlayers.find(p => p.path === savedPath);
    
    if (knownPlayer) {
      return knownPlayer;
    }
    
    const pathParts = savedPath.split(/[\/\\]/);
    let name = pathParts[pathParts.length - 1];
    if (process.platform === 'win32' && name.endsWith('.exe')) {
      name = name.slice(0, -4);
    }
    if (process.platform === 'darwin' && name.endsWith('.app')) {
      name = name.slice(0, -4);
    }
    
    return { name, path: savedPath };
  }
  
  return null;
}

function initDefaultPlayerForPlatform(): void {
  if (process.platform === 'win32') {
    return;
  }
  
  const savedPath = store.get('vlc_path', '') as string;
  if (savedPath && fs.existsSync(savedPath)) {
    return;
  }
  
  const vlcPlayers = (knownPlayers[process.platform] || []).filter(p => 
    p.name.toLowerCase().includes('vlc')
  );
  
  for (const vlc of vlcPlayers) {
    if (fs.existsSync(vlc.path)) {
      store.set('vlc_path', vlc.path);
      console.log(`Auto-selected VLC as default player: ${vlc.path}`);
      return;
    }
  }
}

function openWithSystemDefault(url: string): void {
  if (process.platform === 'linux') {
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  } else if (process.platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
  }
}

function createMenu(): Menu {
  const selectedParser = store.get('selected_torrent_parser', 'primary') as string;

  const template: (Electron.MenuItemConstructorOptions | Electron.MenuItem)[] = [
    {
      label: 'Настройки',
      submenu: [
        {
          label: 'Указать magnet вручную',
          click: () => {
            openMagnetInputDialog();
          }
        },
        {
          type: 'separator'
        },
        {
          label: 'Торрент парсер',
          submenu: [
            {
              label: 'Основной (reyohoho.space)',
              type: 'radio',
              checked: selectedParser === 'primary',
              click: () => {
                switchTorrentParser('primary');
              }
            },
            {
              label: 'Альтернативный (tp.rhserv.vu)',
              type: 'radio',
              checked: selectedParser === 'alternative',
              click: () => {
                switchTorrentParser('alternative');
              }
            }
          ]
        }
      ]
    }
  ];

  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    });
  }

  return Menu.buildFromTemplate(template);
}

if (!AbortSignal.timeout) {
  AbortSignal.timeout = function timeout(ms: number): AbortSignal {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), ms);
    return ctrl.signal;
  };
}

function createWizardWindow(magnetUrl: string): void {
  if (wizardWindow) {
    wizardWindow.focus();
    return;
  }

  wizardWindow = new BrowserWindow({
    width: screen.getPrimaryDisplay().workAreaSize.width,
    height: screen.getPrimaryDisplay().workAreaSize.height,
    darkTheme: true,
    backgroundColor: "#1e1e2e",
    icon: 'icon.png',
    show: false,
    parent: mainWindow || undefined,
    modal: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
      webSecurity: false,
      devTools: false
    }
  });

  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(createMenu());
  } else {
    wizardWindow.setMenu(createMenu());
  }
  wizardWindow.loadFile("torrent-wizard.html");

  wizardWindow.once('ready-to-show', () => {
    wizardWindow?.maximize();
    wizardWindow?.show();
    wizardWindow?.focus();

    const servers = appConfig!.torr_server_urls.map((url, index) => ({
      url,
      location: appConfig!.torr_server_locations[index],
      speedtestUrl: appConfig!.torr_server_speedtest_urls[index],
      id: (appConfig as any).torr_server_ids?.[index] || `server${index}`
    }));

    wizardWindow?.webContents.send('init-wizard', {
      magnetUrl,
      servers,
      appVersion: app.getVersion(),
      appName: APP_NAME,
      platform: process.platform,
      monitorServerUrl: (appConfig as any).monitor_server_url || 'http://178.253.42.84:3000',
      externalPlayer: getCurrentExternalPlayer()
    });
  });

  wizardWindow.on('closed', () => {
    stopStatsUpdate();
    abortHashFetch();
    wizardWindow = null;
    currentMagnetUrl = null;
    currentTorrentHash = null;
    storedPlayUrls = [];
    storedTorrentFiles = [];
  });

  wizardWindow.on('focus', function () {
    if (process.platform === 'darwin') {
      Menu.setApplicationMenu(createMenu());
    }
  });

  currentMagnetUrl = magnetUrl;
}

function logToWizard(message: string, type: string = 'info'): void {
  if (wizardWindow && !wizardWindow.isDestroyed()) {
    wizardWindow.webContents.send('step-progress', {
      step: null,
      message,
      type
    });
  }
}

function openMagnet(magnetValue: string): void {
  createWizardWindow(magnetValue);
}

function openMagnetInputDialog(): void {
  if (magnetInputWindow) {
    magnetInputWindow.focus();
    return;
  }

  magnetInputWindow = new BrowserWindow({
    width: 500,
    height: 250,
    darkTheme: true,
    backgroundColor: "#1e1e2e",
    icon: 'icon.png',
    show: false,
    parent: mainWindow || undefined,
    modal: true,
    frame: false,
    resizable: false,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
      webSecurity: false,
      devTools: false
    }
  });

  magnetInputWindow.setMenu(createMenu());
  magnetInputWindow.loadFile("magnet-input.html");

  magnetInputWindow.once('ready-to-show', () => {
    magnetInputWindow?.show();
    magnetInputWindow?.focus();
  });

  magnetInputWindow.on('closed', () => {
    magnetInputWindow = null;
  });
}

function switchTorrentParser(parserType: 'primary' | 'alternative'): void {
  const currentParser = store.get('selected_torrent_parser', 'primary') as string;

  if (currentParser === parserType) {
    return;
  }

  store.set('selected_torrent_parser', parserType);

  const parserUrl = parserType === 'primary'
    ? appConfig!.torrent_parser_url
    : appConfig!.torrent_parser_url2;

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.loadURL(`${parserUrl}/index3.html?rand=${Date.now()}`);
    if (process.platform === 'darwin') {
      Menu.setApplicationMenu(createMenu());
    } else {
      mainWindow.setMenu(createMenu());
    }
  }
}

function getCurrentTorrentParserUrl(): string {
  const selectedParser = store.get('selected_torrent_parser', 'primary') as string;
  return selectedParser === 'primary'
    ? appConfig!.torrent_parser_url
    : appConfig!.torrent_parser_url2;
}

export async function createTorrentsWindow(kpTitle: string, year: string | null, altname: string | null, config: AppConfig, token: string): Promise<void> {
  appConfig = config;
  selectedTorrServerUrl = config.torr_server_urls[0];
  userToken = token;
  
  initDefaultPlayerForPlatform();

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

  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(createMenu());
  } else {
    mainWindow.setMenu(createMenu());
  }

  mainWindow?.loadURL(`${getCurrentTorrentParserUrl()}/index3.html?rand=${Date.now()}`);

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    if (validatedURL.includes('index3.html')) {
      dialog.showMessageBox(mainWindow!, {
        noLink: true,
        type: 'error',
        title: `Ошибка загрузки парсера`,
        message: `Не удалось загрузить ${validatedURL}\n\nОшибка: ${errorDescription}\n\nХотите сменить парсер?`,
        buttons: ['Отмена', 'Сменить парсер'],
      }).then((result) => {
        if (result.response === 1) {
          const menu = Menu.buildFromTemplate([
            {
              label: 'Торрент парсер',
              submenu: [
                {
                  label: 'Основной (reyohoho.space)',
                  type: 'radio',
                  checked: store.get('selected_torrent_parser', 'primary') === 'primary',
                  click: () => switchTorrentParser('primary')
                },
                {
                  label: 'Альтернативный (tp.rhserv.vu)',
                  type: 'radio',
                  checked: store.get('selected_torrent_parser', 'primary') === 'alternative',
                  click: () => switchTorrentParser('alternative')
                }
              ]
            }
          ]);
          if (mainWindow && !mainWindow.isDestroyed()) {
            menu.popup({ window: mainWindow });
          }
        }
      });
    }
  });

  mainWindow.on('closed', function () {
    mainWindow = null
  })

  mainWindow.on('focus', function () {
    if (process.platform === 'darwin') {
      Menu.setApplicationMenu(createMenu());
    }
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

ipcMain.on('server-selected', (event, data) => {
  const serverIndex = data.serverIndex;
  selectedTorrServerUrl = appConfig!.torr_server_urls[serverIndex];
  store.set('selected_torr_server_url', selectedTorrServerUrl);

  abortHashFetch();

  logToWizard(`Подключение к серверу ${appConfig!.torr_server_locations[serverIndex]}`, 'info');

  if (currentMagnetUrl) {
    handleMagnetWithWizard(currentMagnetUrl, userToken!);
  }
});

ipcMain.on('files-selected', (event, data) => {
  const selectedFiles = data.selectedFiles;
  const files = getCurrentTorrentFiles();
  const selectedFileData = files.filter(file => selectedFiles.includes(file.id));

  logToWizard(`Подготовка ссылок для ${selectedFileData.length} файлов`, 'info');

  const playUrls = selectedFileData.map(file =>
    encodeURI(`${selectedTorrServerUrl}stream/${file.path}?link=${currentTorrentHash}&index=${file.id}&play`)
  );

  preparePlayerWithWizard(playUrls);
});

ipcMain.on('player-selected', (event, data) => {
  const { playerType, path } = data;
  const playUrls = getStoredPlayUrls();

  if (playerType === 'internal') {
    const mpvPath = `${__dirname}\\prebuilts\\windows\\player\\mpv.exe`;
    launchPlayer(mpvPath, playUrls);
  } else if (playerType === 'external') {
    const playerPath = store.get('vlc_path', '') as string;
    if (playerPath && fs.existsSync(playerPath)) {
      launchPlayer(playerPath, playUrls);
    } else {
      logToWizard('Плеер не найден, открываем диалог выбора плеера', 'warning');

      if (wizardWindow && !wizardWindow.isDestroyed()) {
        wizardWindow.webContents.send('step-progress', {
          step: 5,
          message: 'Выберите плеер для воспроизведения',
          type: 'info'
        });

        setTimeout(() => {
          wizardWindow?.webContents.send('auto-choose-player');
        }, 500);
      }
    }
  } else if (playerType === 'custom' && path) {
    store.set('vlc_path', path);
    if (wizardWindow && !wizardWindow.isDestroyed()) {
      wizardWindow.webContents.send('external-player-updated', getCurrentExternalPlayer());
    }
    launchPlayer(path, playUrls);
  }
});

ipcMain.on('get-external-player-info', (event) => {
  event.reply('external-player-info', getCurrentExternalPlayer());
});

function shortenPath(path: string, maxLength: number = 60): string {
  if (path.length <= maxLength) return path;
  const parts = path.split(/[\/\\]/);
  if (parts.length <= 2) return '...' + path.slice(-maxLength + 3);
  
  const fileName = parts[parts.length - 1];
  const firstPart = parts[0];
  const remaining = maxLength - fileName.length - firstPart.length - 6; // 6 for "/.../"
  
  if (remaining < 0) {
    return '...' + path.slice(-maxLength + 3);
  }
  
  return `${firstPart}/.../${fileName}`;
}

ipcMain.on('choose-player-path', () => {
  const availablePlayers = detectAvailablePlayers();
  const currentPlayer = getCurrentExternalPlayer();
  const currentPath = currentPlayer?.path || '';
  const menuItems: Electron.MenuItemConstructorOptions[] = [];
  
  if (availablePlayers.length > 0) {
    for (const player of availablePlayers) {
      const isCurrentPlayer = player.path === currentPath;
      menuItems.push({
        label: `${player.name} - ${shortenPath(player.path)}`,
        sublabel: player.path,
        type: 'checkbox',
        checked: isCurrentPlayer,
        click: () => {
          store.set('vlc_path', player.path);
          if (wizardWindow && !wizardWindow.isDestroyed()) {
            wizardWindow.webContents.send('external-player-updated', player);
          }
          wizardWindow?.webContents.send('player-path-selected', { path: player.path });
        }
      });
    }
    menuItems.push({ type: 'separator' });
  }
  
  menuItems.push({
    label: '📂 Указать путь вручную...',
    click: () => {
      let fileFilters: { name: string; extensions: string[] }[];
      let initialPath: string;
      let hintPath: string;
      
      if (process.platform === 'win32') {
        fileFilters = [
          { name: 'Executable Files', extensions: ['exe'] },
          { name: 'All Files', extensions: ['*'] }
        ];
        initialPath = 'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe';
        hintPath = 'Укажите путь к VLC.exe или к mpc-hc64.exe';
      } else if (process.platform === 'darwin') {
        fileFilters = [{ name: 'All Files', extensions: ['*'] }];
        initialPath = '/Applications/';
        hintPath = 'Укажите путь к приложению';
      } else {
        fileFilters = [{ name: 'All Files', extensions: ['*'] }];
        initialPath = '/usr/bin/';
        hintPath = 'Укажите путь к бинарнику плеера';
      }

      dialog.showOpenDialog(wizardWindow!, {
        title: hintPath,
        defaultPath: initialPath,
        filters: fileFilters,
        properties: process.platform === 'darwin' ? ['openFile', 'openDirectory'] : ['openFile']
      }).then(result => {
        if (!result.canceled && result.filePaths.length > 0) {
          let selectedPath = result.filePaths[0];
          
          if (process.platform === 'darwin' && selectedPath.endsWith('.app')) {
            const appName = selectedPath.split('/').pop()?.replace('.app', '') || '';
            const possiblePaths = [
              `${selectedPath}/Contents/MacOS/${appName}`,
              `${selectedPath}/Contents/MacOS/VLC`,
              `${selectedPath}/Contents/MacOS/IINA`,
              `${selectedPath}/Contents/MacOS/mpv`,
            ];
            for (const p of possiblePaths) {
              if (fs.existsSync(p)) {
                selectedPath = p;
                break;
              }
            }
          }
          
          store.set('vlc_path', selectedPath);
          if (wizardWindow && !wizardWindow.isDestroyed()) {
            wizardWindow.webContents.send('external-player-updated', getCurrentExternalPlayer());
          }
          wizardWindow?.webContents.send('player-path-selected', { path: selectedPath });
        }
      }).catch(err => {
        logToWizard(`Ошибка при выборе файла: ${err}`, 'error');
      });
    }
  });
  
  const menu = Menu.buildFromTemplate(menuItems);
  menu.popup({ window: wizardWindow! });
});

ipcMain.on('save-playlist', (event, data) => {
  if (currentTorrentHash) {
    shell.openExternal(`${selectedTorrServerUrl}playlist?hash=${currentTorrentHash}`);
    logToWizard('Плейлист открыт в браузере', 'success');
  }
});

ipcMain.on('copy-magnet', (event, data) => {
  if (data.magnetUrl) {
    clipboard.writeText(data.magnetUrl);
    logToWizard('Magnet-ссылка скопирована в буфер обмена', 'success');
  }
});

ipcMain.on('download-file', (event, data) => {
  const { fileId, filePath } = data;
  const downloadUrl = encodeURI(`${selectedTorrServerUrl}stream/${filePath}?link=${currentTorrentHash}&index=${fileId}&play`);
  shell.openExternal(downloadUrl);
  logToWizard(`Открытие ссылки для скачивания в браузере: ${filePath}`, 'info');
});

ipcMain.on('magnet-input-result', (event, result) => {
  if (magnetInputWindow) {
    magnetInputWindow.close();
    magnetInputWindow = null;
  }

  if (result === null) {
    console.log('User cancelled');
  } else {
    const userMagnet = result.magnet;

    mainWindow?.webContents.executeJavaScript(`
      const watchedTorrents = JSON.parse(localStorage.getItem('watchedTorrents') || '[]');
      const newEntry = {
        tracker: "Magnet выбран вручную",
        url: "Magnet выбран вручную", 
        title: "${userMagnet}",
        size: 0,
        sizeName: "Magnet выбран вручную",
        createTime: new Date().toISOString(),
        sid: 0,
        pir: 0,
        magnet: "${userMagnet.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}",
        name: "Magnet выбран вручную",
        originalname: "Magnet выбран вручную", 
        relased: new Date().getFullYear(),
        videotype: "Magnet выбран вручную",
        quality: 0,
        voices: ["Magnet выбран вручную"],
        seasons: [1],
        types: ["Magnet выбран вручную"],
        date: Date.now(),
        dateHuman: new Date().toISOString().split('T')[0]
      };
      watchedTorrents.unshift(newEntry);
      localStorage.setItem('watchedTorrents', JSON.stringify(watchedTorrents));
    `);

    openMagnet(userMagnet);
  }
});

ipcMain.on('open-parser-selection', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const menu = Menu.buildFromTemplate([
      {
        label: 'Торрент парсер',
        submenu: [
          {
            label: 'Основной (reyohoho.space)',
            type: 'radio',
            checked: store.get('selected_torrent_parser', 'primary') === 'primary',
            click: () => switchTorrentParser('primary')
          },
          {
            label: 'Альтернативный (tp.rhserv.vu)',
            type: 'radio',
            checked: store.get('selected_torrent_parser', 'primary') === 'alternative',
            click: () => switchTorrentParser('alternative')
          }
        ]
      }
    ]);
    menu.popup({ window: mainWindow });
  }
});

let storedPlayUrls: string[] = [];
let storedTorrentFiles: any[] = [];
let statsUpdateInterval: NodeJS.Timeout | null = null;
let hashFetchAbortController: AbortController | null = null;

function getStoredPlayUrls(): string[] {
  return storedPlayUrls;
}

function getCurrentTorrentFiles(): any[] {
  return storedTorrentFiles;
}

function startStatsUpdate(): void {
  if (statsUpdateInterval) {
    clearInterval(statsUpdateInterval);
  }

  statsUpdateInterval = setInterval(async () => {
    if (!wizardWindow || wizardWindow.isDestroyed() || !currentTorrentHash) {
      stopStatsUpdate();
      return;
    }

    try {
      const apiUrl = `${selectedTorrServerUrl}torrents`;
      const raw = JSON.stringify({
        "action": "get",
        "hash": currentTorrentHash
      });

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${userToken}`
        },
        body: raw,
      });

      if (!response.ok) {
        return;
      }

      const data = await response.json();
      
      if (data["stat"] === 3) {
        const torrentStats = {
          totalPeers: data["total_peers"] || 0,
          activePeers: data["active_peers"] || 0,
          pendingPeers: data["pending_peers"] || 0,
          downloadSpeed: data["download_speed"] || 0,
          uploadSpeed: data["upload_speed"] || 0,
          torrentSize: data["torrent_size"] || 0,
          clientDownloadSpeed: data["client_download_speed"] || 0
        };

        if (wizardWindow && !wizardWindow.isDestroyed()) {
          wizardWindow.webContents.send('stats-update', { stats: torrentStats });
        }
      }
    } catch (error) {
      console.error('Stats update error:', error);
    }
  }, 500);
}

function stopStatsUpdate(): void {
  if (statsUpdateInterval) {
    clearInterval(statsUpdateInterval);
    statsUpdateInterval = null;
  }
}

function abortHashFetch(): void {
  if (hashFetchAbortController) {
    hashFetchAbortController.abort();
    hashFetchAbortController = null;
  }
}

function handleMagnetWithWizard(url: string, base64Credentials: string): void {
  const apiUrl = `${selectedTorrServerUrl}torrents`;
  const raw = JSON.stringify({
    "action": "add",
    "link": url
  });

  logToWizard('Добавление торрента на сервер...', 'info');

  hashFetchAbortController = new AbortController();

  fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${base64Credentials}`
    },
    body: raw,
  })
    .then(response => {
      logToWizard(`Ответ от сервера: статус ${response.status} ${response.statusText}`, 'info');
      
      if (response.status === 401) {
        return Promise.reject('Ошибка 401: Неверные учетные данные, выберите торрент сервер к которому у вас есть доступ');
      }

      if (!response.ok) {
        return Promise.reject(`Ошибка ${response.status}: ${response.statusText}`);
      }

      return response.json();
    })
    .then(result => {
      logToWizard(`Полученные данные: ${JSON.stringify(result)}`, 'info');
      
      const hash = result["hash"];
      currentTorrentHash = hash;

      if (wizardWindow && !wizardWindow.isDestroyed()) {
        wizardWindow.webContents.send('torrent-added', { hash });
      }

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

      fetchWithRetryWizard(apiUrl, options, 1000, 1, 50, hashFetchAbortController!);
    })
    .catch(error => {
      logToWizard(`Ошибка при добавлении торрента: ${error}`, 'error');
      hashFetchAbortController = null;
    });
}

function launchPlayer(playerPath: string, playUrls: string[]): void {
  if (playerPath === '__SYSTEM_DEFAULT__') {
    logToWizard('Открытие в системном приложении по умолчанию', 'info');
    
    for (const url of playUrls) {
      openWithSystemDefault(url);
    }
    
    wizardWindow?.webContents.send('player-launched', { success: true });
    startStatsUpdate();
    logToWizard('Начато обновление статистики торрента (каждые 0.5 сек)', 'info');
    return;
  }

  logToWizard(`Запуск плеера: ${playerPath}`, 'info');

  const playerProcess: ChildProcess = spawn(playerPath, playUrls, {
    detached: true,
    stdio: ['ignore', 'ignore', 'pipe']
  });

  playerProcess.unref();

  playerProcess.stderr?.on('data', (data: Buffer) => {
    const errorText = data.toString();
    if (errorText.toLowerCase().includes('error') || errorText.toLowerCase().includes('failed')) {
      logToWizard(`Player error: ${errorText}`, 'warning');
    }
  });

  playerProcess.on('close', (code: number | null) => {
    if (code === 0) {
      logToWizard('Плеер завершил работу успешно', 'success');
    } else {
      logToWizard(`Плеер завершил работу с кодом: ${code}`, 'error');
    }
  });

  playerProcess.on('error', (err: Error) => {
    logToWizard(`Ошибка запуска плеера: ${err.message}`, 'error');
  });

  wizardWindow?.webContents.send('player-launched', { success: true });
  
  // Start stats update after player launch
  startStatsUpdate();
  logToWizard('Начато обновление статистики торрента (каждые 0.5 сек)', 'info');
}

function preparePlayerWithWizard(playUrls: string[]): void {
  storedPlayUrls = playUrls;
  logToWizard('Ссылки для воспроизведения подготовлены', 'success');

  if (wizardWindow && !wizardWindow.isDestroyed()) {
    wizardWindow.webContents.send('step-progress', {
      step: 5,
      message: 'Выберите плеер для воспроизведения',
      type: 'info'
    });
  }
}

async function fetchWithRetryWizard(
  url: string,
  options: FetchOptions,
  delay: number = 1000,
  retryCount: number = 1,
  retryMaxCount: number = 50,
  abortController: AbortController
): Promise<any> {
  try {
    if (abortController.signal.aborted) {
      return;
    }

    if (retryCount > retryMaxCount) {
      logToWizard(`Не удалось получить hash (попыток: ${retryCount}/${retryMaxCount})`, 'error');
      hashFetchAbortController = null;
      return;
    }
    logToWizard(`Получаем hash... попытка ${retryCount}/${retryMaxCount}`, 'info');
    
    const response = await fetch(url, {
      ...options,
      signal: abortController.signal
    });
    
    logToWizard(`Ответ от сервера: статус ${response.status} ${response.statusText}`, 'info');
    
    const data = await response.json();
    logToWizard(`Полученные данные: ${JSON.stringify(data)}`, 'info');
    logToWizard(`Stat: ${data["stat"]}`, 'info');
    
    if (data["stat"] === 3) {
      storedTorrentFiles = data["file_stats"].filter((file: any) => {
        const isVideoFile = videoExtensions.some(ext => file.path.endsWith(ext));
        return isVideoFile;
      });

      logToWizard(`Получено видео файлов: ${storedTorrentFiles.length}`, 'success');

      if (storedTorrentFiles.length === 0) {
        logToWizard('В раздаче не найдены видео-файлы', 'error');
        hashFetchAbortController = null;
        return;
      }

      const torrentStats = {
        totalPeers: data["total_peers"] || 0,
        activePeers: data["active_peers"] || 0,
        pendingPeers: data["pending_peers"] || 0,
        downloadSpeed: data["download_speed"] || 0,
        uploadSpeed: data["upload_speed"] || 0,
        torrentSize: data["torrent_size"] || 0,
        clientDownloadSpeed: data["client_download_speed"] || 0
      };

      logToWizard(`Пиры: ${torrentStats.totalPeers} (активных: ${torrentStats.activePeers})`, 'info');
      logToWizard(`Скорость загрузки(сервер): ${(torrentStats.downloadSpeed / 1024 / 1024).toFixed(2)} MB/s`, 'info');
      logToWizard(`Скорость загрузки(клиент): ${(torrentStats.clientDownloadSpeed / 1024 / 1024).toFixed(2)} MB/s`, 'info');

      if (wizardWindow && !wizardWindow.isDestroyed()) {
        wizardWindow.webContents.send('files-received', { 
          files: storedTorrentFiles,
          stats: torrentStats
        });
      }

      hashFetchAbortController = null;
      return data;
    } else {
      logToWizard(`Торрент еще не готов. Retry in ${delay} ms...`, 'warning');
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchWithRetryWizard(url, options, delay, ++retryCount, retryMaxCount, abortController);
    }
  } catch (error: any) {
    if (error.name === 'AbortError') {
      logToWizard('Получение hash отменено', 'warning');
      hashFetchAbortController = null;
      return;
    }

    logToWizard(`Ошибка при запросе: ${error}. Повторная попытка через ${delay} ms...`, 'error');
    await new Promise(resolve => setTimeout(resolve, delay));
    return fetchWithRetryWizard(url, options, delay, ++retryCount, retryMaxCount, abortController);
  }
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
    const currentPlayer = getCurrentExternalPlayer();
    const playerLabel = currentPlayer 
      ? `Внешний (${currentPlayer.name}: ${currentPlayer.path})`
      : 'Внешний (не выбран)';
    
    dialog.showMessageBox(mainWindow!, {
      noLink: true,
      title: `Выберите плеер`,
      message: `Выберите плеер: внутренний(mpv) или внешний`,
      detail: currentPlayer ? `Текущий внешний плеер: ${currentPlayer.name}\nПуть: ${currentPlayer.path}` : 'Внешний плеер не выбран',
      buttons: ['Отмена', 'Внутренний(mpv)', playerLabel, 'Сохранить всё как плейлист', 'Скопировать magnet'],
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
      const playerProcess: ChildProcess = spawn(playerPath, parameters, {
        detached: true,
        stdio: ['ignore', 'ignore', 'pipe']
      });

      playerProcess.unref();

      playerProcess.stderr?.on('data', (data: Buffer) => {
        const errorText = data.toString();
        if (errorText.toLowerCase().includes('error') || errorText.toLowerCase().includes('failed')) {
          console.error(`player stderr: ${errorText}`);
          mainWindow?.setTitle(APP_NAME + ` player stderr: ${errorText}`);
        }
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

      mainWindow?.setTitle(APP_NAME + ` Плеер запущен успешно`);
    });
  } else {
    const availablePlayers = detectAvailablePlayers();
    
    const menuItems: Electron.MenuItemConstructorOptions[] = [
      {
        label: '🎬 Открыть в приложении по умолчанию',
        click: () => {
          mainWindow?.setTitle(APP_NAME + ` Открытие в системном плеере...`);
          for (const url of parameters) {
            openWithSystemDefault(url);
          }
          mainWindow?.setTitle(APP_NAME + ` Плеер запущен успешно`);
        }
      },
      { type: 'separator' }
    ];
    
    for (const player of availablePlayers) {
      menuItems.push({
        label: player.name,
        sublabel: player.path,
        click: () => {
          store.set('vlc_path', player.path);
          launchExternalPlayer(player.path, parameters);
        }
      });
    }
    
    if (availablePlayers.length > 0) {
      menuItems.push({ type: 'separator' });
    }
    
    menuItems.push(
      {
        label: '📂 Указать путь вручную...',
        click: () => {
          showManualPlayerDialog(parameters, magnet, hash);
        }
      },
      { type: 'separator' },
      {
        label: '💾 Сохранить как плейлист',
        click: () => {
          mainWindow?.setTitle(APP_NAME);
          shell.openExternal(`${selectedTorrServerUrl}playlist?hash=${hash}`);
        }
      },
      {
        label: '📋 Скопировать magnet',
        click: () => {
          mainWindow?.setTitle(APP_NAME);
          clipboard.writeText(magnet);
        }
      }
    );
    
    const menu = Menu.buildFromTemplate(menuItems);
    menu.popup({ window: mainWindow! });
  }
};

function launchExternalPlayer(playerPath: string, parameters: string[]): void {
  const playerProcess: ChildProcess = spawn(playerPath, parameters, {
    detached: true,
    stdio: ['ignore', 'ignore', 'pipe']
  });

  playerProcess.unref();

  playerProcess.stderr?.on('data', (data: Buffer) => {
    const errorText = data.toString();
    if (errorText.toLowerCase().includes('error') || errorText.toLowerCase().includes('failed')) {
      console.error(`player stderr: ${errorText}`);
      mainWindow?.setTitle(APP_NAME + ` player stderr: ${errorText}`);
    }
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

  mainWindow?.setTitle(APP_NAME + ` Плеер запущен успешно`);
}

function showManualPlayerDialog(parameters: string[], magnet: string, hash: string): void {
  const fileFilters = [{ name: 'All Files', extensions: ['*'] }];
  let initialPath = process.platform === 'darwin' ? '/Applications/' : '/usr/bin/';
  const hintPath = process.platform === 'darwin' 
    ? 'Укажите путь к приложению' 
    : 'Укажите путь к бинарнику плеера';

  dialog.showOpenDialog(mainWindow!, {
    title: hintPath,
    defaultPath: initialPath,
    filters: fileFilters,
    properties: process.platform === 'darwin' ? ['openFile', 'openDirectory'] : ['openFile']
  }).then(result => {
    if (!result.canceled && result.filePaths.length > 0) {
      let selectedPath = result.filePaths[0];
      if (process.platform === 'darwin' && selectedPath.endsWith('.app')) {
        const appName = selectedPath.split('/').pop()?.replace('.app', '') || '';
        const possiblePaths = [
          `${selectedPath}/Contents/MacOS/${appName}`,
          `${selectedPath}/Contents/MacOS/VLC`,
          `${selectedPath}/Contents/MacOS/IINA`,
          `${selectedPath}/Contents/MacOS/mpv`,
        ];
        for (const p of possiblePaths) {
          if (fs.existsSync(p)) {
            selectedPath = p;
            break;
          }
        }
      }
      store.set('vlc_path', selectedPath);
      launchExternalPlayer(selectedPath, parameters);
    }
  }).catch(err => {
    console.error('Ошибка при выборе файла:', err);
    mainWindow?.setTitle(APP_NAME + ` Ошибка при выборе файла: ${err}`);
  });
}

function preparePlayer(parameters: string[], magnet: string, hash: string): void {
  mainWindow?.setTitle(APP_NAME + ` Запускаем плеер...`);
  const savedPath = store.get('vlc_path', '') as string;
  
  if (savedPath.length !== 0 && fs.existsSync(savedPath)) {
    runPlayer(parameters, magnet, hash);
    return;
  }
  
  if (process.platform === 'win32') {
    const fileFilters = [
      { name: 'Executable Files', extensions: ['exe'] },
      { name: 'All Files', extensions: ['*'] }
    ];
    const initialPath = 'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe';
    const hintPath = 'Укажите путь к VLC.exe или к mpc-hc64.exe';

    dialog.showOpenDialog(mainWindow!, {
      title: hintPath,
      defaultPath: initialPath,
      filters: fileFilters,
      properties: ['openFile']
    }).then(result => {
      if (!result.canceled && result.filePaths.length > 0) {
        store.set('vlc_path', result.filePaths[0]);
        runPlayer(parameters, magnet, hash);
      }
    }).catch(err => {
      console.error('Ошибка при выборе файла:', err);
      mainWindow?.setTitle(APP_NAME + ` Ошибка при выборе файла: ${err}`);
    });
  } else {
    runPlayer(parameters, magnet, hash);
  }
}