import { ElectronBlocker } from '@ghostery/adblocker-electron';
import fetch from 'cross-fetch';
import { app, BrowserWindow, dialog, session, globalShortcut, shell, screen, Menu, ipcMain, Rectangle } from 'electron';
import { createTorrentsWindow } from './torrents.js'
import Store from 'electron-store';
import pkg from 'electron-updater';
import path from "node:path";
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const { autoUpdater } = pkg;

const APP_NAME = `ReYohoho Desktop ${app.getVersion()}`;

app.commandLine.appendSwitch('disable-site-isolation-trials');

let mainWindow: BrowserWindow | null = null;
let appConfig: AppConfig | null = null;
const store = new Store({});

const isDebug = !app.isPackaged;

const config_main_url = `https://reyohoho.ru/r.json?t=${Math.random()}`;

autoUpdater.autoInstallOnAppQuit = true;
if (process.platform === 'darwin') {
  autoUpdater.autoDownload = false;
}

let main_site_url;
let deep_link_data: String | null;

let authWindow: BrowserWindow | null = null;

const menu = (isMacOS = process.platform === 'darwin'): Menu => {
  if (isMacOS) {
    return Menu.buildFromTemplate([
      {
        label: 'Настройки',
        submenu: [
          {
            label: 'Сменить URL зеркала',
            click: () => {
              changeWebUrlMirror();
            }
          },
          {
            label: 'Открыть инструменты разработчика',
            click: () => {
              mainWindow?.webContents.openDevTools();
            }
          },
          {
            label: 'ReYohoho VIP(F1)',
            click: () => openTorrents()
          },
          {
            label: "Блюр (F2)",
            click: () => switchBlurVideo()
          },
          {
            label: "Компрессор (F3)",
            click: () => switchCompressor()
          },
          {
            label: "Отражение (F4)",
            click: () => switchMirror()
          },
          {
            label: "Обновить (F5) Принуд.:(Ctrl+F5)",
            click: () => reload()
          },
          {
            label: "Скорость(-0.5x) 0.5x MIN (F6)",
            click: () => decreasePlaybackSpeed()
          },
          {
            label: "Сбросить скорость (F7)",
            click: () => resetPlaybackSpeed()
          },
          {
            label: "Скорость(+0.5x) 4x MAX (F8)",
            click: () => increasePlaybackSpeed()
          }
        ]
      },
    ]);
  } else {
    return Menu.buildFromTemplate([
      {
        label: 'Настройки',
        submenu: [
          {
            label: 'Сменить URL зеркала',
            click: () => {
              changeWebUrlMirror();
            }
          },
          {
            label: 'Открыть инструменты разработчика',
            click: () => {
              mainWindow?.webContents.openDevTools();
            }
          },

        ]
      },
      {
        label: 'ReYohoho VIP(F1)',
        click: () => openTorrents()
      },
      {
        label: "Блюр (F2)",
        click: () => switchBlurVideo()
      },
      {
        label: "Компрессор (F3)",
        click: () => switchCompressor()
      },
      {
        label: "Отражение (F4)",
        click: () => switchMirror()
      },
      {
        label: "Обновить (F5) Принуд.:(Ctrl+F5)",
        click: () => reload()
      },
      {
        label: "Скорость(-0.5x) 0.5x MIN (F6)",
        click: () => decreasePlaybackSpeed()
      },
      {
        label: "Сбросить скорость (F7)",
        click: () => resetPlaybackSpeed()
      },
      {
        label: "Скорость(+0.5x) 4x MAX (F8)",
        click: () => increasePlaybackSpeed()
      }
    ]);
  }
};

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
};

const switchBlurVideo = (): void => {
  const switchBlurScript = `
   if(document.getElementsByClassName('responsive-iframe')[0].style.filter.includes('blur')) {
    document.getElementsByClassName('responsive-iframe')[0].style.filter = '';
   } else {
    document.getElementsByClassName('responsive-iframe')[0].style.filter = 'blur(50px)';
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
          video_iframe.playbackRate += 0.5;
        }
        window.electronAPI.showToast('Текущая скорость: ' + video_iframe.playbackRate.toString()) + 'x';
  `;

  mainWindow?.webContents.executeJavaScript(increasePlaybackSpeed);
};

const decreasePlaybackSpeed = (): void => {
  const decreasePlaybackSpeed = `
        video_iframe = document.getElementsByClassName('responsive-iframe')[0].contentDocument.querySelectorAll('video')[0];
        if (video_iframe.playbackRate > 0.5) {
          video_iframe.playbackRate -= 0.5;
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

if (!AbortSignal.timeout) {
  AbortSignal.timeout = function timeout(ms: number): AbortSignal {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), ms);
    return ctrl.signal;
  };
}

export interface AppConfig {
  ad_block_url: string,
  main_site_url: string,
  torrent_parser_url: string,
  torr_server_url: string,
  app_version_url: string,
  alloha_origin_url: string,
  alloha_referer: string,
  alloha_cdn_filter_url: string,
  lumex_origin_url: string,
  lumex_referer: string,
  lumex_cdn_filter_url: string,
  url_handler_deny: string,
  boosty_vip_link: string,
  torr_server_urls: string[],
  torr_server_locations: string[],
}

function loadConfig(config_url: string): void {
  fetch(config_url)
    .then(response => response.json() as Promise<AppConfig>)
    .then(data => {
      appConfig = data;

      const filter = {
        urls: ['*://*/*']
      };

      session.defaultSession.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
        try {
          if (details.requestHeaders['Referer'] && details.requestHeaders['Referer'].includes(appConfig!.alloha_referer)) {
            details.requestHeaders['Origin'] = appConfig!.alloha_origin_url;
          }
          callback({ requestHeaders: details.requestHeaders });
        } catch (e) {
          console.error('Error in onBeforeSendHeaders:', e);
        }
      });

      createWindow('132');
    })
    .catch(error => {
      console.error('Error load config:', error);
      createWindow(error);
    });
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
  globalShortcut.register('F11', () => {
    mainWindow?.webContents.toggleDevTools();
  });
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
      store.set("user_mirror", selectedMirror);
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
        devTools: true,
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

  main_site_url = store.get('user_mirror', appConfig!.main_site_url) as string;

  mainWindow.once('ready-to-show', () => {
    mainWindow?.maximize();
    mainWindow?.show();
    mainWindow?.focus();
    if (isDebug) {
      mainWindow?.webContents.openDevTools();
    }
  });

  if (process.platform !== 'darwin') {
    mainWindow?.setMenu(menu());
  } else {
    Menu.setApplicationMenu(menu());
  }

  mainWindow?.loadFile("loader.html");

  mainWindow.setTitle(APP_NAME + ' Loading ....');
  autoUpdater.checkForUpdatesAndNotify();

  let blocker = null;

  try {
    blocker = await ElectronBlocker.fromLists(fetch, [
      appConfig!.ad_block_url
    ]);
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
  });

  mainWindow.on('closed', function () {
    mainWindow = null
  })

  if (deep_link_data) {
    mainWindow?.loadURL(`${main_site_url!}/${deep_link_data}`);
  } else {
    mainWindow?.loadURL(main_site_url!);
  }

  mainWindow.on('focus', function () {
    registerHotkeys();
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

    const handleAuthSubmitted = (event: any, data: { login: string; password: string }) => {
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
    return store.get('user_mirror', appConfig?.main_site_url || '') as string;
  });

  ipcMain.handle('open-external', (event, url) => {
    shell.openExternal(url);
  });

  loadConfig(config_main_url);
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
  globalShortcut.unregister('F11');
  globalShortcut.unregister('CommandOrControl+R');
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
