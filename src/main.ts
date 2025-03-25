import { ElectronBlocker } from '@ghostery/adblocker-electron';
import fetch from 'cross-fetch';
import { app, BrowserWindow, dialog, session, globalShortcut, shell, screen, Menu, ipcMain, Rectangle } from 'electron';
import { createTorrentsWindow } from './torrents.js'
import prompt from 'custom-electron-prompt';
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

const config_main_url = `https://gist.githubusercontent.com/reyohoho/c4de4c47dd9b2c3d4b2985a74056e55c/raw/reyohoho_desktop_domains.json?t=${Math.random()}`;

const config_mirror_url = `https://gitlab.com/-/snippets/4805196/raw/main/snippetfile1.txt?t=${Math.random()}`;

autoUpdater.autoInstallOnAppQuit = true;
if (process.platform === 'darwin') {
  autoUpdater.autoDownload = false;
}

let main_site_url;
let deep_link_data: String | null;

let compressorButtonEnabled = true;
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
            label: compressorButtonEnabled ? "Компрессор (F3)" : "Компрессор недоступен",
            enabled: compressorButtonEnabled,
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
        label: compressorButtonEnabled ? "Компрессор (F3)" : "Компрессор недоступен",
        enabled: compressorButtonEnabled,
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
    prompt({
      skipTaskbar: false,
      alwaysOnTop: true,
      title: 'Авторизация',
      height: 350,
      width: 500,
      x: mainWindow!.getBounds().x + mainWindow!.getBounds().width/2,
      y: mainWindow!.getBounds().y + mainWindow!.getBounds().height/2,
      customStylesheet: 'dark',
      frame: true,
      useHtmlLabel: true,
      label: `Просмотр торрентов без скачки через сервер ReYohoho<br>
      Пример работы<a target="_blank" href="https://storage.yandexcloud.net/miscrhhhh/2025-02-07%2010-43-11.mp4">(видео)</a><br>
      Введите логин и пароль ReYohoho VIP<br>
      Данные можно получить по подписке на <a target="_blank" href="${appConfig!.boosty_vip_link}">бусти</a><br>
      (По <a target="_blank" href="https://t.me/ReYohoho_support">запросу</a> предоставлю пробный доступ)`,
      multiInputOptions:
        [
          {
            label: "Login", value: store.get('login', '') as string, inputAttrs: {
              type: "text",
              required: true,
            }
          },
          {
            label: "Password", value: store.get('password', '') as string, inputAttrs: {
              type: "password",
              required: true,
            }
          },
        ],
      resizable: true,
      type: 'multiInput'
    })
      .then(async (result: string[] | null) => {
        if (result === null) {
          console.log('User cancelled');
        } else {
          const login = result[0];
          const password = result[1];
          const credentials = `${login}:${password}`;
          store.set("login", login);
          store.set("password", password);
          const base64Credentials = Buffer.from(credentials).toString("base64");
          isNewCredsStored = true;
          const titleAndYear = await getMetaContent('title-and-year');
          const altName = await getMetaContent('original-title');

          const match = titleAndYear.match(/^(.*?)\s*\((\d{4})\)$/);
          const title = match ? match[1].trim() : titleAndYear.replace(/\s*\(.*\)$/, "");
          const year = match ? match[2] : null;

          createTorrentsWindow(title, year, altName, appConfig!, base64Credentials);
        }
      })
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
  if (!compressorButtonEnabled) {
    const compressorUnavailableMessage = `
      function showToast(message) {
        const messageElement = document.createElement('div');
        messageElement.textContent = message;
        messageElement.style.position = 'fixed';
        messageElement.style.top = '0';
        messageElement.style.left = '0';
        messageElement.style.width = '100%';
        messageElement.style.height = '100%';
        messageElement.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        messageElement.style.color = 'white';
        messageElement.style.display = 'flex';
        messageElement.style.justifyContent = 'center';
        messageElement.style.alignItems = 'center';
        messageElement.style.fontSize = '2rem';
        messageElement.style.zIndex = '99000';

        document.body.appendChild(messageElement);

        setTimeout(() => {
            document.body.removeChild(messageElement);
        }, 500);
    }
    showToast("Компрессор недоступен в этом плеере");
    `;
    mainWindow?.webContents.executeJavaScript(compressorUnavailableMessage);
    return;
  }
  const switchCompressorScript = `
  try {
      if (!csource) {
          video_iframe = document.getElementsByClassName('responsive-iframe')[0].contentDocument.querySelectorAll('video')[0];
          contextC = new AudioContext();
          compressor = contextC.createDynamicsCompressor();
          compressor.threshold.value = -50;
          compressor.knee.value = 40;
          compressor.ratio.value = 12;
          compressor.attack.value = 0;
          compressor.release.value = 0.25;
          csource = contextC.createMediaElementSource(video_iframe);
          csource.connect(contextC.destination);
      }
  } catch (e) {
      console.log(e);
      window.electronAPI.showToast("Ошибка при включении компрессора");
  }

  try {
      if (!isCompressorEnabled) {
          csource.disconnect(contextC.destination);
          csource.connect(compressor);
          compressor.connect(contextC.destination);
          isCompressorEnabled = true;
          window.electronAPI.showToast("Компрессор включён");
      } else {
          csource.disconnect(compressor);
          compressor.disconnect(contextC.destination);
          csource.connect(contextC.destination);
          isCompressorEnabled = false;
          window.electronAPI.showToast("Компрессор отключён");
      }
  } catch (e) {
      console.log(e);
      window.electronAPI.showToast("Ошибка при включении компрессора");
  }
  `;

  mainWindow?.webContents.executeJavaScript(switchCompressorScript);
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
  const switchMirrorScript = `
        video_iframe = document.getElementsByClassName('responsive-iframe')[0].contentDocument.querySelectorAll('video')[0];
        if (video_iframe.style.transform === '' || video_iframe.style.transform === 'scaleX(1)' || video_iframe.style.transform === 'scale(1)') {
            video_iframe.style.transform = 'scaleX(-1)';
            window.electronAPI.showToast("Зеркало включено");
        } else {
            video_iframe.style.transform = 'scaleX(1)';
          window.electronAPI.showToast("Зеркало отключёно");
        }
  `;

  mainWindow?.webContents.executeJavaScript(switchMirrorScript);
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
  prompt({
    skipTaskbar: false,
    alwaysOnTop: true,
    title: 'Укажите путь к зеркалу:',
    x: mainWindow!.getBounds().x + mainWindow!.getBounds().width/2,
    y: mainWindow!.getBounds().y + mainWindow!.getBounds().height/2,
    customStylesheet: 'dark',
    frame: true,
    useHtmlLabel: true,
    height: 250,
    label: `Список зеркал: <a target="_blank" href="https://github.com/reyohoho/reyohoho#mirrors">github</a><br>`,
    multiInputOptions:
      [
        {
          label: "По умолчанию", value: appConfig!.main_site_url, inputAttrs: {
            type: "text",
            required: false,
          }
        },
        {
          label: "Текущее зеркало", value: store.get('user_mirror', appConfig!.main_site_url) as string, inputAttrs: {
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
        let user_mirror = result[1];
        if (!user_mirror.startsWith('http')) {
          user_mirror = `https://${user_mirror}`;
        }
        store.set("user_mirror", user_mirror);
        main_site_url = user_mirror;
        mainWindow?.loadURL(user_mirror);
      }
    })
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
        title: `Произошла ошибка при загрузке конфига`,
        message: `${configError}`,
        buttons: ['Закрыть', 'Перезапустить'],
      }).then((result) => {
        if (result.response === 1) {
          loadConfig(config_mirror_url);
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
    const initCompressor = `
    var isCompressorEnabled = false;
    var csource = null;
    `
    mainWindow?.webContents.executeJavaScript(initCompressor)
  });

  mainWindow.webContents.on('did-stop-loading', () => {
    mainWindow?.setTitle(APP_NAME);
  });

  blocker?.enableBlockingInSession(mainWindow.webContents.session);

  mainWindow?.webContents.on('did-finish-load', () => {
    const initCompressor = `
    var isCompressorEnabled = false;
    var csource = null;
    `
    mainWindow?.webContents.executeJavaScript(initCompressor);

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

  executeRepeatedly(() => {
    mainWindow?.webContents.executeJavaScript(`
      var iframe = document.getElementsByClassName('responsive-iframe')[0];
      if (iframe && iframe.contentDocument) {
        var video = iframe.contentDocument.querySelectorAll('video')[0];
        video ? video.src : null;
      } else {
        null;
      }
    `)
      .then(result => {
        if (result != null && (result.includes("allarknow") || result.includes("videoframe") || result.includes("kinoserial.net"))) {
          compressorButtonEnabled = false;
          if (process.platform !== 'darwin') {
            mainWindow?.setMenu(menu());
          } else {
            Menu.setApplicationMenu(menu());
          }
        } else {
          compressorButtonEnabled = true;
          if (process.platform !== 'darwin') {
            mainWindow?.setMenu(menu());
          } else {
            Menu.setApplicationMenu(menu());
          }
        }
      }).catch(error => {
        compressorButtonEnabled = true;
        if (process.platform !== 'darwin') {
          mainWindow?.setMenu(menu());
        } else {
          Menu.setApplicationMenu(menu());
        }
      });
  }, 1000);

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

app.whenReady().then(() => {
  app.setAsDefaultProtocolClient('reyohoho');
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
      if (BrowserWindow.getAllWindows()[0] && BrowserWindow.getAllWindows()[0].getTitle() === "Авторизация") {
        BrowserWindow.getAllWindows()[0].close();
      }
      if (BrowserWindow.getAllWindows()[1] && BrowserWindow.getAllWindows()[1].getTitle() === "Авторизация") {
        BrowserWindow.getAllWindows()[1].close();
      }
      if (BrowserWindow.getAllWindows()[2] && BrowserWindow.getAllWindows()[2].getTitle() === "Авторизация") {
        BrowserWindow.getAllWindows()[2].close();
      }
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
