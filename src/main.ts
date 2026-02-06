import { ElectronBlocker } from '@ghostery/adblocker-electron';
import fetch from 'cross-fetch';
import { app, BrowserWindow, dialog, session, globalShortcut, shell, screen, Menu, ipcMain, Rectangle } from 'electron';
import { createTorrentsWindow } from './torrents.js'
import Store from 'electron-store';
import pkg from 'electron-updater';
import path from "node:path";
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const { autoUpdater } = pkg;

const APP_NAME = `RuTube ${app.getVersion()}`;

app.commandLine.appendSwitch('disable-site-isolation-trials');

let mainWindow: BrowserWindow | null = null;
let appConfig: AppConfig | null = null;
const store = new Store({});

const isDebug = !app.isPackaged;

const config_main_path = path.join(__dirname, '../prebuilts/config.json');
const adblock_path = path.join(__dirname, '../prebuilts/adblock.txt');

const AUTH_API_BASES = ['https://api.rhserv.vu', 'https://api4.rhserv.vu'];

/** Check auth against both API servers; first successful response wins (no wait for the other). */
async function checkAuthBothServers(login: string, password: string): Promise<boolean> {
  const credentials = `${login}:${password}`;
  const base64Credentials = Buffer.from(credentials).toString('base64');
  const authHeader = `Basic ${base64Credentials}`;

  const checkOne = async (base: string): Promise<boolean> => {
    const url = `${base}/auth/check`;
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { Authorization: authHeader },
        signal: AbortSignal.timeout?.(10000) ?? undefined,
      });
      console.log('[auth]', url, '->', res.status, res.statusText);
      return res.status === 200;
    } catch (err) {
      console.warn('[auth]', url, 'error:', err);
      return false;
    }
  };

  console.log('[auth] Checking credentials for login:', login, 'against', AUTH_API_BASES.length, 'servers');
  const p1 = checkOne(AUTH_API_BASES[0]);
  const p2 = checkOne(AUTH_API_BASES[1]);
  const firstSuccess = Promise.race([
    p1.then((ok) => (ok ? true : Promise.reject())),
    p2.then((ok) => (ok ? true : Promise.reject())),
  ]);
  const result = await firstSuccess.catch(() => Promise.all([p1, p2]).then(([a, b]) => a || b));
  console.log('[auth] Result:', result ? 'OK' : 'FAIL');
  return result;
}

autoUpdater.autoInstallOnAppQuit = true;
if (process.platform === 'darwin') {
  autoUpdater.autoDownload = false;
}

let main_site_url;
let deep_link_data: String | null;

let authWindow: BrowserWindow | null = null;

function createMacOSMenu(): Menu | null {
  if (process.platform !== 'darwin') {
    return null;
  }

  return Menu.buildFromTemplate([
    {
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
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' }
      ]
    }
  ]);
}

function setMainWindowMenu(): void {
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(createMacOSMenu());
  }
}

const reload = (): void => {
  if (mainWindow?.webContents.getURL().includes("loader.html")) {
    mainWindow?.loadURL(main_site_url!);
  } else {
    mainWindow?.reload();
  }
};

const reloadIgnoringCache = (): void => {
  if (mainWindow?.webContents.getURL().includes("loader.html")) {
    mainWindow?.loadURL(main_site_url!);
  } else {
    mainWindow?.webContents.reloadIgnoringCache();
  }
};

const showUpdateAvailableDialog = (): void => {
  if (mainWindow != null) {
    dialog.showMessageBox(mainWindow, {
      noLink: true,
      type: 'info',
      title: `Обновление загружено`,
      message: `Установить сейчас? Иначе оно автоустановится после закрытия приложения`,
      buttons: ['Позже', 'Установить', 'Список изменений'],
    }).then((result) => {
      if (result.response === 1) {
        autoUpdater.quitAndInstall();
      } else if (result.response === 2) {
        shell.openExternal('https://github.com/reyohoho/reyohoho-desktop/releases');
        showUpdateAvailableDialog();
      }
    });
  }
}

async function getMetaContent(selector: string) {
  try {
    const content = await mainWindow?.webContents.executeJavaScript(
      `document.querySelector('meta[name="${selector}"]').content`
    );
    return content || '';
  } catch (error) {
    return '';
  }
}

let isNewCredsStored = false;

function checkStoredCredentials(): void {
  const login = store.get('login', '') as string;
  const password = store.get('password', '') as string;
  if (login && password) {
    isNewCredsStored = true;
  }
}

async function openTorrents() {
  if (isNewCredsStored) {
    const credentials = `${store.get('login', '') as string}:${store.get('password', '') as string}`;
    const base64Credentials = Buffer.from(credentials).toString("base64");
    const titleAndYear = await getMetaContent('title-and-year');
    const altName = await getMetaContent('original-title');

    const match = titleAndYear.match(/^(.*?)\s*\((\d{4})\)$/);
    const title = match ? match[1].trim() : titleAndYear.replace(/\s*\(.*\)$/, "");
    const year = match ? match[2] : null;

    createTorrentsWindow(title, year, altName, appConfig!, base64Credentials);
  } else {
    const authResult = await createAuthWindow();

    if (authResult) {
      const credentials = `${authResult.login}:${authResult.password}`;
      const base64Credentials = Buffer.from(credentials).toString("base64");
      const titleAndYear = await getMetaContent('title-and-year');
      const altName = await getMetaContent('original-title');

      const match = titleAndYear.match(/^(.*?)\s*\((\d{4})\)$/);
      const title = match ? match[1].trim() : titleAndYear.replace(/\s*\(.*\)$/, "");
      const year = match ? match[2] : null;

      createTorrentsWindow(title, year, altName, appConfig!, base64Credentials);
    }
  }
}

async function changeCredentials() {
  const authResult = await createAuthWindow();
  if (authResult) {
    const credentials = `${authResult.login}:${authResult.password}`;
    const base64Credentials = Buffer.from(credentials).toString("base64");
    const titleAndYear = await getMetaContent('title-and-year');
    const altName = await getMetaContent('original-title');

    const match = titleAndYear.match(/^(.*?)\s*\((\d{4})\)$/);
    const title = match ? match[1].trim() : titleAndYear.replace(/\s*\(.*\)$/, "");
    const year = match ? match[2] : null;

    createTorrentsWindow(title, year, altName, appConfig!, base64Credentials);
  }
}

const switchBlurVideo = (): void => {
  const switchBlurScript = `
   try {
     const video = document.getElementsByClassName('responsive-iframe')[0].contentDocument.querySelectorAll('video')[0];
     if(video.style.filter.includes('blur')) {
       video.style.filter = '';
     } else {
       video.style.filter = 'blur(50px)';
     }
   } catch (error) {
     const iframe = document.getElementsByClassName('responsive-iframe')[0];
     if(iframe.style.filter.includes('blur')) {
       iframe.style.filter = '';
     } else {
       iframe.style.filter = 'blur(50px)';
     }
   }
   `;

  mainWindow?.webContents.executeJavaScript(switchBlurScript);
};

const switchCompressor = (): void => {
  mainWindow?.webContents.executeJavaScript('window.toggleCompressor();');
};

const increasePlaybackSpeed = (): void => {
  const increasePlaybackSpeed = `
        video_iframe = document.getElementsByClassName('responsive-iframe')[0].contentDocument.querySelectorAll('video')[0];
        if (video_iframe.playbackRate < 4.0) {
          video_iframe.playbackRate += 0.25;
        }
        window.electronAPI.showToast('Текущая скорость: ' + video_iframe.playbackRate.toString()) + 'x';
  `;

  mainWindow?.webContents.executeJavaScript(increasePlaybackSpeed);
};

const decreasePlaybackSpeed = (): void => {
  const decreasePlaybackSpeed = `
        video_iframe = document.getElementsByClassName('responsive-iframe')[0].contentDocument.querySelectorAll('video')[0];
        if (video_iframe.playbackRate > 0.25) {
          video_iframe.playbackRate -= 0.25;
        }
        window.electronAPI.showToast('Текущая скорость: ' + video_iframe.playbackRate.toString()) + 'x';
  `;

  mainWindow?.webContents.executeJavaScript(decreasePlaybackSpeed);
};

const resetPlaybackSpeed = (): void => {
  const resetPlaybackSpeed = `
        video_iframe = document.getElementsByClassName('responsive-iframe')[0].contentDocument.querySelectorAll('video')[0];
        video_iframe.playbackRate = 1.0;
        window.electronAPI.showToast('Текущая скорость: ' + video_iframe.playbackRate.toString()) + 'x';
  `;

  mainWindow?.webContents.executeJavaScript(resetPlaybackSpeed);
};

const switchMirror = (): void => {
  mainWindow?.webContents.executeJavaScript('window.toggleMirror();');
};

const toggleMenu = (): void => {
  const toggleMenuScript = `
    (function() {
      try {
        const menu = document.getElementById('reyohoho-top-menu');
        if (!menu) {
          console.log('Menu not found');
          return;
        }
        
        const isCurrentlyHidden = menu.getAttribute('data-hidden') === 'true';
        
        if (isCurrentlyHidden) {
          menu.style.display = 'flex';
          menu.setAttribute('data-hidden', 'false');
          document.body.style.setProperty('padding-top', '48px', 'important');
          
          const sidePanels = document.querySelectorAll('.side-panel, aside.side-panel, .nav-component aside');
          if (sidePanels && sidePanels.length > 0) {
            sidePanels.forEach(sidePanel => {
              if (sidePanel && sidePanel.style) {
                sidePanel.style.setProperty('top', '48px', 'important');
                sidePanel.style.setProperty('height', 'calc(100vh - 48px)', 'important');
              }
            });
          }
        } else {
          menu.style.display = 'none';
          menu.setAttribute('data-hidden', 'true');
          document.body.style.setProperty('padding-top', '0', 'important');
          
          const sidePanels = document.querySelectorAll('.side-panel, aside.side-panel, .nav-component aside');
          if (sidePanels && sidePanels.length > 0) {
            sidePanels.forEach(sidePanel => {
              if (sidePanel && sidePanel.style) {
                sidePanel.style.setProperty('top', '0', 'important');
                sidePanel.style.setProperty('height', '100vh', 'important');
              }
            });
          }
        }
      } catch (error) {
        console.error('Error toggling menu:', error);
      }
    })();
  `;
  mainWindow?.webContents.executeJavaScript(toggleMenuScript).catch(err => {
    console.error('Failed to toggle menu:', err);
  });
};

if (!AbortSignal.timeout) {
  AbortSignal.timeout = function timeout(ms: number): AbortSignal {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), ms);
    return ctrl.signal;
  };
}

export interface AppConfig {
  main_site_url: string,
  torrent_parser_url: string,
  torrent_parser_url2: string,
  alloha_origin_url: string,
  alloha_referer: string,
  alloha_cdn_filter_url: string,
  lumex_origin_url: string,
  lumex_referer: string,
  lumex_cdn_filter_url: string,
  url_handler_deny: string,
  monitor_server_url?: string,
  torr_server_urls: string[],
  torr_server_locations: string[],
  torr_server_ids?: string[],
  torr_server_speedtest_urls: string[],
}

function loadConfig(): void {
  try {
    const configRaw = fs.readFileSync(config_main_path, 'utf-8');
    appConfig = JSON.parse(configRaw);

    const filter = {
      urls: ['*://*/*']
    };

    const chromeUserAgent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36';

    session.defaultSession.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
      try {
        if (details.requestHeaders['Referer'] && details.requestHeaders['Referer'].includes(appConfig!.alloha_referer)) {
          details.requestHeaders['Origin'] = appConfig!.alloha_origin_url;
        }
        if (details.url.includes('stream-balancer')) {
          details.requestHeaders['User-Agent'] = chromeUserAgent;
          details.requestHeaders['sec-ch-ua'] = '"Google Chrome";v="132", "Chromium";v="132", "Not A(Brand";v="24"';
        }
        const url = new URL(details.url);
        if ((url.hostname === 'api4.rhserv.vu' || url.hostname === 'api.rhserv.vu') && url.pathname.startsWith('/cache')) {
          const login = store.get('login', '') as string;
          const password = store.get('password', '') as string;
          if (login && password) {
            const credentials = `${login}:${password}`;
            const base64Credentials = Buffer.from(credentials).toString('base64');
            details.requestHeaders['Authorization'] = `Basic ${base64Credentials}`;
          }
        }
        callback({ requestHeaders: details.requestHeaders });
      } catch (e) {
        console.error('Error in onBeforeSendHeaders:', e);
      }
    });

    (async () => {
      const login = store.get('login', '') as string;
      const password = store.get('password', '') as string;

      if (login && password) {
        const ok = await checkAuthBothServers(login, password);
        if (ok) {
          isNewCredsStored = true;
          createWindow('132');
          return;
        }
      }

      const result = await createAuthWindow();
      if (result) {
        createWindow('132');
      } else {
        app.quit();
      }
    })();
  } catch (error) {
    console.error('Error load config:', error);
    createWindow(error);
  }
}

function registerHotkeys(): void {
  globalShortcut.register('F1', openTorrents);
  globalShortcut.register('F2', switchBlurVideo);
  globalShortcut.register('F3', switchCompressor);
  globalShortcut.register('F4', switchMirror);
  globalShortcut.register('F5', reload);
  globalShortcut.register('F6', decreasePlaybackSpeed);
  globalShortcut.register('F7', resetPlaybackSpeed);
  globalShortcut.register('F8', increasePlaybackSpeed);
  globalShortcut.register('F9', changeCredentials);
  globalShortcut.register('F10', toggleMenu);
  // globalShortcut.register('F11', () => {
  //   mainWindow?.webContents.toggleDevTools();
  // });
  globalShortcut.register('CommandOrControl+F5', reloadIgnoringCache);
}

function changeWebUrlMirror(): void {
  if (!mainWindow) return;
  createMirrorSelectionWindow();
}

let mirrorSelectionWindow: BrowserWindow | null = null;

function createMirrorSelectionWindow(): Promise<string | null> {
  return new Promise((resolve) => {
    if (mirrorSelectionWindow) {
      mirrorSelectionWindow.focus();
      return;
    }

    mirrorSelectionWindow = new BrowserWindow({
      width: 600,
      height: 700,
      resizable: false,
      maximizable: false,
      minimizable: false,
      alwaysOnTop: false,
      modal: true,
      parent: mainWindow!,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      icon: 'icon.png',
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      }
    });

    const handleMirrorSelected = (event: any, selectedMirror: string) => {
      store.set("user_mirror3", selectedMirror);
      main_site_url = selectedMirror;
      mainWindow?.loadURL(main_site_url);

      if (mirrorSelectionWindow) {
        mirrorSelectionWindow.close();
        mirrorSelectionWindow = null;
      }

      ipcMain.removeListener('mirror-selected', handleMirrorSelected);
      ipcMain.removeListener('mirror-cancelled', handleMirrorCancelled);

      resolve(selectedMirror);
    };

    const handleMirrorCancelled = () => {
      if (mirrorSelectionWindow) {
        mirrorSelectionWindow.close();
        mirrorSelectionWindow = null;
      }

      ipcMain.removeListener('mirror-selected', handleMirrorSelected);
      ipcMain.removeListener('mirror-cancelled', handleMirrorCancelled);

      resolve(null);
    };

    ipcMain.on('mirror-selected', handleMirrorSelected);
    ipcMain.on('mirror-cancelled', handleMirrorCancelled);

    mirrorSelectionWindow.on('closed', () => {
      mirrorSelectionWindow = null;
      ipcMain.removeListener('mirror-selected', handleMirrorSelected);
      ipcMain.removeListener('mirror-cancelled', handleMirrorCancelled);
      resolve(null);
    });

    mirrorSelectionWindow.loadFile('mirror-selection.html');

    mirrorSelectionWindow.once('ready-to-show', () => {
      mirrorSelectionWindow?.show();
      mirrorSelectionWindow?.focus();
    });
  });
}

async function createWindow(configError: any | ''): Promise<void> {
  if (!mainWindow) {
    mainWindow = new BrowserWindow({
      width: screen.getPrimaryDisplay().workAreaSize.width,
      height: screen.getPrimaryDisplay().workAreaSize.height,
      darkTheme: true,
      backgroundColor: "#000",
      icon: 'icon.png',
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        webSecurity: false,
        devTools: false,
      }
    });
  }

  if (!appConfig) {
    if (mainWindow != null) {
      dialog.showMessageBox(mainWindow, {
        noLink: true,
        type: 'error',
        title: `Произошла ошибка при загрузке конфига, открыть канал с обновлениями в ТГ?`,
        message: `${configError}`,
        buttons: ['Закрыть', 'Открыть'],
      }).then((result) => {
        if (result.response === 1) {
          shell.openExternal('https://t.me/reyohoho_desktop');
        } else {
          if (process.platform !== 'darwin') app.quit();
        }
      });
    }
    return;
  }

  mainWindow.setBounds(store.get('bounds') as Rectangle)

  mainWindow.on('close', () => {
    store.set('bounds', mainWindow!.getBounds())
  })

  main_site_url = store.get('user_mirror3', appConfig!.main_site_url) as string;

  mainWindow.once('ready-to-show', () => {
    mainWindow?.maximize();
    mainWindow?.show();
    mainWindow?.focus();
    if (isDebug) {
      mainWindow?.webContents.openDevTools();
    }
  });

  if (process.platform === 'darwin') {
    setMainWindowMenu();
  } else {
    mainWindow.setMenu(null);
  }
  mainWindow?.loadFile("loader.html");

  mainWindow.setTitle(APP_NAME + ' Loading ....');
  autoUpdater.checkForUpdatesAndNotify();

  let blocker = null;
  try {
    const adblockRaw = fs.readFileSync(adblock_path, 'utf-8');
    blocker = ElectronBlocker.parse(adblockRaw);
  } catch (e) {
    console.log(e);
    if (mainWindow != null) {
      dialog.showMessageBox(mainWindow, {
        noLink: true,
        type: 'error',
        title: `Произошла ошибка при загрузке AdBlock`,
        message: `${e}`
      })
    }
  }

  mainWindow.webContents.on('did-start-loading', () => {
    mainWindow?.setTitle(APP_NAME + ' Loading ....');
  });

  mainWindow.webContents.on('did-stop-loading', () => {
    mainWindow?.setTitle(APP_NAME);
  });

  blocker?.enableBlockingInSession(mainWindow.webContents.session);

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
    
    // Inject top menu bar
    const currentUrl = mainWindow?.webContents.getURL() || '';
    if (!currentUrl.includes('loader.html') && !currentUrl.includes('auth-window.html') && !currentUrl.includes('mirror-selection.html') && !currentUrl.includes('magnet-input.html') && !currentUrl.includes('torrent-wizard.html')) {
      mainWindow?.webContents.executeJavaScript(`
        (function() {
          if (document.getElementById('reyohoho-top-menu')) return;
          
          const menuBar = document.createElement('div');
          menuBar.id = 'reyohoho-top-menu';
          menuBar.innerHTML = \`
            <style>
              #reyohoho-top-menu {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                height: 48px;
                background: #0a0a0a;
                box-shadow: 0 2px 8px rgba(0,0,0,0.8);
                z-index: 2147483647 !important;
                display: flex;
                align-items: center;
                padding: 0 16px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                user-select: none;
                border-bottom: 1px solid #1a1a1a;
                overflow: hidden;
              }
              #reyohoho-top-menu .menu-logo {
                font-size: 17px;
                font-weight: 700;
                color: #ffffff;
                margin-right: 24px;
                flex-shrink: 0;
              }
              #reyohoho-top-menu .menu-items {
                display: flex;
                gap: 6px;
                flex: 1;
                align-items: center;
                overflow-x: auto;
                overflow-y: hidden;
                min-width: 0;
                padding-bottom: 2px;
              }
              #reyohoho-top-menu .menu-items::-webkit-scrollbar {
                height: 3px;
              }
              #reyohoho-top-menu .menu-items::-webkit-scrollbar-track {
                background: transparent;
              }
              #reyohoho-top-menu .menu-items::-webkit-scrollbar-thumb {
                background: #2a2a2a;
                border-radius: 3px;
              }
              #reyohoho-top-menu .menu-items::-webkit-scrollbar-thumb:hover {
                background: #3a3a3a;
              }
              #reyohoho-top-menu .menu-btn {
                background: #1a1a1a;
                border: 1px solid #2a2a2a;
                color: #b0b0b0;
                padding: 7px 12px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
                transition: all 0.15s ease;
                white-space: nowrap;
                font-weight: 500;
                position: relative;
                display: flex;
                align-items: center;
                gap: 6px;
                flex-shrink: 0;
              }
              #reyohoho-top-menu .menu-btn .btn-text {
                display: inline;
              }
              #reyohoho-top-menu .menu-btn .hotkey {
                font-size: 10px;
                background: #2a2a2a;
                padding: 2px 5px;
                border-radius: 3px;
                color: #666;
                font-weight: 600;
                border: 1px solid #333;
              }
              #reyohoho-top-menu .menu-btn:hover {
                background: #2a2a2a;
                border-color: #444;
                color: #ffffff;
                transform: translateY(-1px);
                box-shadow: 0 2px 8px rgba(0,0,0,0.4);
              }
              #reyohoho-top-menu .menu-btn:hover .hotkey {
                background: #ffffff;
                color: #000;
                border-color: #ffffff;
              }
              #reyohoho-top-menu .menu-btn:active {
                transform: translateY(0);
              }
              #reyohoho-top-menu .menu-btn.primary {
                background: #ffffff;
                border-color: #ffffff;
                color: #000;
                font-weight: 600;
              }
              #reyohoho-top-menu .menu-btn.primary .hotkey {
                background: rgba(0,0,0,0.15);
                color: #000;
                border-color: rgba(0,0,0,0.2);
              }
              #reyohoho-top-menu .menu-btn.primary:hover {
                background: #e0e0e0;
                transform: translateY(-1px);
                box-shadow: 0 2px 8px rgba(255,255,255,0.2);
              }
              #reyohoho-top-menu .menu-btn.active {
                background: #4a4a4a;
                border-color: #666;
                color: #ffffff;
              }
              #reyohoho-top-menu .menu-btn.active .hotkey {
                background: #666;
                color: #fff;
              }
              #reyohoho-top-menu .menu-divider {
                width: 1px;
                height: 28px;
                background: #2a2a2a;
                margin: 0 8px;
                flex-shrink: 0;
              }
              #reyohoho-top-menu .player-control {
                display: flex;
              }
              #reyohoho-top-menu .player-control.hidden {
                display: none !important;
              }
              body {
                padding-top: 48px !important;
              }
              /* Fix for site's side menu */
              .side-panel,
              aside.side-panel,
              .nav-component aside {
                top: 48px !important;
                height: calc(100vh - 48px) !important;
              }
              
              @media screen and (max-width: 1200px) {
                #reyohoho-top-menu .menu-btn .btn-text {
                  display: none;
                }
                #reyohoho-top-menu .menu-btn {
                  padding: 7px 10px;
                  gap: 0;
                }
                #reyohoho-top-menu .menu-btn i {
                  margin: 0;
                }
                #reyohoho-top-menu .menu-divider {
                  margin: 0 4px;
                }
              }
              
              @media screen and (max-width: 900px) {
                #reyohoho-top-menu .menu-logo {
                  font-size: 14px;
                  margin-right: 12px;
                }
                #reyohoho-top-menu {
                  padding: 0 8px;
                }
                #reyohoho-top-menu .menu-items {
                  gap: 4px;
                }
              }
              
              @media screen and (max-width: 600px) {
                #reyohoho-top-menu .hotkey {
                  display: none !important;
                }
                #reyohoho-top-menu .menu-logo {
                  font-size: 12px;
                  margin-right: 8px;
                }
                #reyohoho-top-menu .menu-btn {
                  padding: 6px 8px;
                }
              }
            </style>
            <div class="menu-logo">RuTube</div>
            <div class="menu-items">
              <button class="menu-btn primary" onclick="window.electronAPI.sendHotKey('F1')">
                <i class="fas fa-film"></i> <span class="btn-text">Полка</span> <span class="hotkey">F1</span>
              </button>
              <button class="menu-btn" onclick="window.electronAPI.sendHotKey('F9')">
                <i class="fas fa-key"></i> <span class="btn-text">Аккаунт</span> <span class="hotkey">F9</span>
              </button>
              <div class="menu-divider player-control"></div>
              <button id="blur-btn" class="menu-btn player-control" onclick="window.electronAPI.sendHotKey('F2')">
                <i class="fas fa-eye-slash"></i> <span class="btn-text">Блюр</span> <span class="hotkey">F2</span>
              </button>
              <button id="compressor-btn" class="menu-btn player-control" onclick="window.electronAPI.sendHotKey('F3')">
                <i class="fas fa-compress"></i> <span class="btn-text">Компрессор</span> <span class="hotkey">F3</span>
              </button>
              <button id="mirror-btn" class="menu-btn player-control" onclick="window.electronAPI.sendHotKey('F4')">
                <i class="fas fa-arrows-left-right"></i> <span class="btn-text">Отражение</span> <span class="hotkey">F4</span>
              </button>
              <div class="menu-divider"></div>
              <button class="menu-btn" onclick="location.reload()">
                <i class="fas fa-rotate"></i> <span class="btn-text">Обновить</span> <span class="hotkey">F5</span>
              </button>
              <div class="menu-divider player-control"></div>
              <button class="menu-btn player-control" onclick="window.electronAPI.sendHotKey('F6')">
                <i class="fas fa-backward"></i> <span class="btn-text">-0.25x</span> <span class="hotkey">F6</span>
              </button>
              <button class="menu-btn player-control" onclick="window.electronAPI.sendHotKey('F7')">
                <i class="fas fa-play"></i> <span class="btn-text">1.0x</span> <span class="hotkey">F7</span>
              </button>
              <button class="menu-btn player-control" onclick="window.electronAPI.sendHotKey('F8')">
                <i class="fas fa-forward"></i> <span class="btn-text">+0.25x</span> <span class="hotkey">F8</span>
              </button>
              <div class="menu-divider"></div>
              <button class="menu-btn" onclick="window.electronAPI.openMirrorSelection()">
                <i class="fas fa-globe"></i> <span class="btn-text">Сменить зеркало</span>
              </button>
              <div class="menu-divider"></div>
              <button class="menu-btn" onclick="window.electronAPI.sendHotKey('F10')">
                <i class="fas fa-eye"></i> <span class="btn-text">Скрыть меню</span> <span class="hotkey">F10</span>
              </button>
            </div>
          \`;
          
          document.body.insertBefore(menuBar, document.body.firstChild);
          
          // Check if iframe exists and toggle player controls visibility
          function updatePlayerControlsVisibility() {
            const hasIframe = document.querySelector('iframe.responsive-iframe') !== null;
            const playerControls = document.querySelectorAll('#reyohoho-top-menu .player-control');
            playerControls.forEach(control => {
              if (hasIframe) {
                control.classList.remove('hidden');
              } else {
                control.classList.add('hidden');
              }
            });
          }
          
          // Initial check
          updatePlayerControlsVisibility();
          
          // Watch for DOM changes to detect iframe
          const observer = new MutationObserver(() => {
            updatePlayerControlsVisibility();
          });
          
          observer.observe(document.body, {
            childList: true,
            subtree: true
          });
          
          // Update button states based on actual feature status
          function updateButtonStates() {
            try {
              const blurBtn = document.getElementById('blur-btn');
              const compressorBtn = document.getElementById('compressor-btn');
              const mirrorBtn = document.getElementById('mirror-btn');
              
              if (!blurBtn || !compressorBtn || !mirrorBtn) return;
              
              // Check blur state
              const iframe = document.querySelector('iframe.responsive-iframe');
              if (iframe) {
                try {
                  const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                  if (iframeDoc) {
                    const videos = iframeDoc.querySelectorAll('video');
                    const isBlurred = videos.length > 0 
                      ? videos[0].style.filter.includes('blur')
                      : iframe.style.filter.includes('blur');
                    
                    if (isBlurred) {
                      blurBtn.classList.add('active');
                    } else {
                      blurBtn.classList.remove('active');
                    }
                  }
                } catch (e) {
                  // Cross-origin iframe, can't access
                }
                
                // Check compressor and mirror from localStorage (Pinia store persists to localStorage)
                try {
                  const playerStore = localStorage.getItem('player');
                  if (playerStore) {
                    const playerData = JSON.parse(playerStore);
                    
                    if (playerData.compressorEnabled) {
                      compressorBtn.classList.add('active');
                    } else {
                      compressorBtn.classList.remove('active');
                    }
                    
                    if (playerData.mirrorEnabled) {
                      mirrorBtn.classList.add('active');
                    } else {
                      mirrorBtn.classList.remove('active');
                    }
                  }
                } catch (e) {
                  // Error parsing localStorage
                }
              }
            } catch (error) {
              // Ignore errors
            }
          }
          
          // Update every 500ms
          setInterval(updateButtonStates, 500);
          updateButtonStates();
        })();
      `);
    }
    
    if (currentUrl.endsWith('loader.html') || currentUrl.startsWith('file://') && currentUrl.includes('loader.html')) {
      if (deep_link_data) {
        setTimeout(() => mainWindow?.loadURL(`${main_site_url!}/${deep_link_data}`), 100);
      } else {
        setTimeout(() => mainWindow?.loadURL(main_site_url!), 100);
      }
    }
  });

  mainWindow.on('closed', function () {
    mainWindow = null
  })

  mainWindow.on('focus', function () {
    registerHotkeys();
    setMainWindowMenu();
  })

  ipcMain.on('on-hotkey', (event, key) => {
    switch (key) {
      case 'F1':
        openTorrents();
        return;

      case 'F2':
        switchBlurVideo();
        return;

      case 'F3':
        switchCompressor();
        return;

      case 'F4':
        switchMirror();
        return;

      case 'F6':
        decreasePlaybackSpeed();
        return;

      case 'F7':
        resetPlaybackSpeed();
        return;

      case 'F8':
        increasePlaybackSpeed();
        return;

      case 'F9':
        changeCredentials();
        return;

      case 'F10':
        toggleMenu();
        return;

      default:
        console.warn(`Unknown key: ${key}`);
        return;
    }
  })

  mainWindow.webContents.on('context-menu', (e, props) => {
    if (props.formControlType === 'input-text') {
      const InputMenu = Menu.buildFromTemplate([{
        label: 'Cut',
        role: 'cut',
      }, {
        label: 'Copy',
        role: 'copy',
      }, {
        label: 'Paste',
        role: 'paste',
      }, {
        type: 'separator',
      }, {
        label: 'Select all',
        role: 'selectAll',
      },
      ]);
      InputMenu.popup();
    } else if (props.editFlags?.canCopy) {
      const InputMenu = Menu.buildFromTemplate([
        {
          label: 'Copy',
          role: 'copy',
        }
      ]);
      InputMenu.popup();
    }
  });

  mainWindow?.on('enter-full-screen', () => {
    mainWindow?.setMenuBarVisibility(false);
  });

  mainWindow?.on('leave-full-screen', () => {
    mainWindow?.setMenuBarVisibility(true);
  });

}

function executeRepeatedly(callback: () => void, interval: number): void {
  setInterval(callback, interval);
}

function createAuthWindow(): Promise<{ login: string; password: string } | null> {
  return new Promise((resolve) => {
    if (authWindow) {
      authWindow.focus();
      return;
    }

    authWindow = new BrowserWindow({
      width: 480,
      height: 520,
      resizable: false,
      maximizable: false,
      minimizable: false,
      alwaysOnTop: false,
      modal: !!mainWindow,
      parent: mainWindow ?? undefined,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      icon: 'icon.png',
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      }
    });

    const handleShowInputContextMenu = () => {
      if (authWindow) {
        const InputMenu = Menu.buildFromTemplate([
          { label: 'Вырезать', role: 'cut' },
          { label: 'Копировать', role: 'copy' },
          { label: 'Вставить', role: 'paste' },
          { type: 'separator' },
          { label: 'Выделить все', role: 'selectAll' },
        ]);
        InputMenu.popup({ window: authWindow });
      }
    };

    const handleAuthSubmitted = async (event: any, data: { login: string; password: string }) => {
      const ok = await checkAuthBothServers(data.login, data.password);
      if (!ok) {
        console.warn('[auth] Rejected: both servers returned non-200 for login:', data.login);
        authWindow?.webContents.send('auth-error', 'Неверный логин или пароль');
        return;
      }
      store.set("login", data.login);
      store.set("password", data.password);
      isNewCredsStored = true;

      if (authWindow) {
        authWindow.close();
        authWindow = null;
      }

      ipcMain.removeListener('auth-submitted', handleAuthSubmitted);
      ipcMain.removeListener('auth-cancelled', handleAuthCancelled);
      ipcMain.removeListener('show-input-context-menu', handleShowInputContextMenu);

      resolve(data);
    };

    const handleAuthCancelled = () => {
      if (authWindow) {
        authWindow.close();
        authWindow = null;
      }

      ipcMain.removeListener('auth-submitted', handleAuthSubmitted);
      ipcMain.removeListener('auth-cancelled', handleAuthCancelled);
      ipcMain.removeListener('show-input-context-menu', handleShowInputContextMenu);

      resolve(null);
    };

    ipcMain.on('auth-submitted', handleAuthSubmitted);
    ipcMain.on('auth-cancelled', handleAuthCancelled);

    ipcMain.on('show-input-context-menu', handleShowInputContextMenu);

    authWindow.on('closed', () => {
      authWindow = null;
      ipcMain.removeListener('auth-submitted', handleAuthSubmitted);
      ipcMain.removeListener('auth-cancelled', handleAuthCancelled);
      ipcMain.removeListener('show-input-context-menu', handleShowInputContextMenu);
      resolve(null);
    });

    authWindow.loadFile('auth-window.html');

    authWindow.once('ready-to-show', () => {
      authWindow?.show();
      authWindow?.focus();
    });
  });
}

app.whenReady().then(() => {
  app.setAsDefaultProtocolClient('reyohoho');

  const gotTheLock = app.requestSingleInstanceLock();
  
  if (!gotTheLock) {
    app.quit();
    return;
  }
  
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
      mainWindow.show();
    }
    
    if (process.platform === 'win32' || process.platform === 'linux') {
      const url = commandLine.find(arg => arg.startsWith('reyohoho://'));
      if (url && mainWindow) {
        deep_link_data = url.replace('reyohoho://', '');
        mainWindow.loadURL(`${main_site_url!}/${deep_link_data}`);
      }
    }
  });

  ipcMain.handle('get-stored-credentials', () => {
    return {
      login: store.get('login', '') as string,
      password: store.get('password', '') as string
    };
  });

  ipcMain.handle('get-app-config', () => {
    return appConfig;
  });

  ipcMain.handle('get-stored-mirror', () => {
    return store.get('user_mirror3', appConfig?.main_site_url || '') as string;
  });

  ipcMain.handle('open-external', (event, url) => {
    shell.openExternal(url);
  });

  ipcMain.handle('get-mirrors-list', () => {
    return `Проверить доступность:
http://37.252.0.116:4433/check.html

Новый фронтенд:
https://reyohoho.gitlab.io/reyohoho
https://reyohoho.serv00.net

Старый фронтенд:
https://reyohoho.surge.sh
https://mazda1337.github.io/reyohoho
`;
  });

  checkStoredCredentials();
  loadConfig();
  registerHotkeys();

  if (process.platform === 'win32' || process.platform === 'linux') {
    const url = process.argv.find(arg => arg.startsWith('reyohoho://'));
    if (url) {
      deep_link_data = url.replace('reyohoho://', '');
    }
  }
});

app.on('open-url', (event, url) => {
  event.preventDefault();
  if (url.startsWith('reyohoho://')) {
    deep_link_data = url.replace('reyohoho://', '');
  }
});

app.on('web-contents-created', (e, wc) => {
  wc.setWindowOpenHandler((handler) => {
    try {
      console.log("setWindowOpenHandler: " + handler.url);
      BrowserWindow.getAllWindows().forEach(win => {
        if (win.getTitle() === "Авторизация") {
          win.close();
        }
      });
    } catch (e) { }

    if (handler.url.startsWith(appConfig!.url_handler_deny)) {
      mainWindow?.loadURL(handler.url);
      return { action: "deny" };
    } else {
      shell.openExternal(handler.url);
      return { action: "deny" };
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('browser-window-blur', () => {
  globalShortcut.unregister('F1');
  globalShortcut.unregister('F2');
  globalShortcut.unregister('F3');
  globalShortcut.unregister('F4');
  globalShortcut.unregister('F5');
  globalShortcut.unregister('F6');
  globalShortcut.unregister('F7');
  globalShortcut.unregister('F8');
  globalShortcut.unregister('F9');
  globalShortcut.unregister('F10');
  // globalShortcut.unregister('F11');
  globalShortcut.unregister('CommandOrControl+F5');
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

autoUpdater.on('checking-for-update', () => {
  console.log('Checking for update...');
});

autoUpdater.on('update-not-available', (info) => {
  console.log('Update not available.', info);
});

autoUpdater.on('update-available', () => {
  if (mainWindow != null && process.platform === 'darwin') {
    dialog.showMessageBox(mainWindow, {
      noLink: true,
      type: 'info',
      title: `Доступно обновление`,
      message: `Перейти на страницу загрузок?`,
      buttons: ['Позже', 'Перейти'],
    }).then((result) => {
      if (result.response === 1) {
        shell.openExternal('https://github.com/reyohoho/reyohoho-desktop/releases');
      }
    });
  }
})

autoUpdater.on('error', (err) => {
  console.log('Error in auto-updater.', err);
});

autoUpdater.on('download-progress', (progressObj) => {
  let log_message = 'Download speed: ' + progressObj.bytesPerSecond;
  log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
  log_message = log_message + ' (' + progressObj.transferred + '/' + progressObj.total + ')';
  console.log(log_message);
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('Update downloaded.', info);
  showUpdateAvailableDialog();
});

ipcMain.on('open-mirror-selection', () => {
  changeWebUrlMirror();
});
