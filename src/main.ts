import { ElectronBlocker } from '@ghostery/adblocker-electron';
import fetch from 'cross-fetch';
import { app, BrowserWindow, dialog, session, globalShortcut, shell, screen, Menu } from 'electron';
import { createTorrentsWindow } from './torrents.js'
import prompt from 'custom-electron-prompt';
import Store from 'electron-store';
import pkg from 'electron-updater';
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

let main_site_url;

const menu = Menu.buildFromTemplate([
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
        label: 'Настройка хоткеев',
        click: () => {
          openHotkeysSettings();
        }
      }
    ]
  }
]);

const addVIPButtonScript = `
if(document.getElementById('vip-buttonContainer')) {
  document.getElementById('vip-buttonContainer').remove();
}
var buttonContainerVIP = document.createElement('div');
buttonContainerVIP.id = 'vip-buttonContainer';
buttonContainerVIP.style.position = 'fixed';
buttonContainerVIP.style.top = '50px';
buttonContainerVIP.style.left = '10px';
buttonContainerVIP.style.zIndex = 10000;
buttonContainerVIP.style.display = 'flex';
buttonContainerVIP.style.gap = '10px';
document.body.appendChild(buttonContainerVIP);

var torrentsButton = document.createElement('button');
torrentsButton.textContent = 'ReYohoho VIP (F1)';
torrentsButton.style.padding = '10px 20px';
torrentsButton.style.backgroundColor = 'black';
torrentsButton.style.color = 'white';
torrentsButton.style.border = '1px solid white';
torrentsButton.style.borderRadius = '5px';
torrentsButton.style.cursor = 'pointer';
torrentsButton.disabled = true;
torrentsButton.style.pointerEvents = 'none';
buttonContainerVIP.appendChild(torrentsButton);
`;

const addButtonsScript = `
var isButtonClicked = false;
var csource = null;
var isInit = false;
var isFlipButtonClicked = false;
if(document.getElementById('rh-buttonContainer')) {
  document.getElementById('rh-buttonContainer').remove();
}

function addButtons() {
    if(document.getElementById('rh-buttonContainer')) {
      document.getElementById('rh-buttonContainer').remove();
    }
    const buttonContainer = document.createElement('div');
    buttonContainer.id = 'rh-buttonContainer';
    buttonContainer.style.position = 'fixed';
    buttonContainer.style.top = '50px';
    buttonContainer.style.right = '10px';
    buttonContainer.style.zIndex = 10000;
    buttonContainer.style.display = 'flex';
    buttonContainer.style.gap = '10px';
    document.body.appendChild(buttonContainer);

    const blurButton = document.createElement('button');
    blurButton.id = 'blur-button';
    blurButton.textContent = 'Блюр (F2)';
    blurButton.style.padding = '10px 20px';
    blurButton.style.backgroundColor = 'black';
    blurButton.style.color = 'white';
    blurButton.style.border = '1px solid white';
    blurButton.style.borderRadius = '5px';
    blurButton.style.cursor = 'pointer';
    blurButton.disabled = true;
    blurButton.style.pointerEvents = 'none';
    buttonContainer.appendChild(blurButton);

    const compressorButton = document.createElement('button');
    compressorButton.id = 'compressor_button';
    compressorButton.textContent = 'Включить компрессор (F3)';
    compressorButton.style.padding = '10px 20px';
    compressorButton.style.backgroundColor = 'black';
    compressorButton.style.color = 'white';
    compressorButton.style.border = '1px solid white';
    compressorButton.style.borderRadius = '5px';
    compressorButton.style.cursor = 'pointer';
    buttonContainer.appendChild(compressorButton);

    const flipButton = document.createElement('button');
    flipButton.id = 'flip_button';
    flipButton.textContent = 'Включить отражение (F4)';
    flipButton.style.padding = '10px 20px';
    flipButton.style.backgroundColor = 'black';
    flipButton.style.color = 'white';
    flipButton.style.border = '1px solid white';
    flipButton.style.borderRadius = '5px';
    flipButton.style.cursor = 'pointer';
    buttonContainer.appendChild(flipButton);

    compressorButton.addEventListener('click', () => {
        try {

            if (!csource) {
                const ik = document.getElementById('yohoho-iframe');
                $('#yohoho-iframe').on('load', function () {
                    csource = null;
                    isButtonClicked = false;
                    compressorButton.style.backgroundColor = 'blue';
                    compressorButton.textContent = 'Включить компрессор (F3)';
                });
                const video_iframe = ik.contentDocument.querySelectorAll('video')[0];
                video_iframe.crossOrigin = 'anonymous';
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
        }

        if (!isButtonClicked) {
            csource.disconnect(contextC.destination);
            csource.connect(compressor);
            compressor.connect(contextC.destination);
            isButtonClicked = true;
            compressorButton.style.border = '1px solid red';
            compressorButton.textContent = 'Выключить компрессор (F3)';
        } else {
            csource.disconnect(compressor);
            compressor.disconnect(contextC.destination);
            csource.connect(contextC.destination);
            isButtonClicked = false;
            compressorButton.style.border = '1px solid white';
            compressorButton.textContent = 'Включить компрессор (F3)';
        }
    });

    flipButton.addEventListener('click', () => {
        const ik = document.getElementById('yohoho-iframe');
        const video_iframe = ik.contentDocument.querySelectorAll('video')[0];
        try {
            if (!isInit) {
                $('#yohoho-iframe').on('load', function () {
                    isFlipButtonClicked = false;
                    flipButton.style.border = '1px solid white';
                    flipButton.textContent = 'Включить отражение (F4)';
                });
            }
        } catch (e) {
            console.log(e);
        }

        if (!isFlipButtonClicked) {
            video_iframe.style.transform = 'scaleX(-1)';
            isFlipButtonClicked = true;
            flipButton.style.border = '1px solid red';
            flipButton.textContent = 'Выключить отражение (F4)';
        } else {
            video_iframe.style.transform = 'scaleX(1)';
            isFlipButtonClicked = false;
            flipButton.style.border = '1px solid white';
            flipButton.textContent = 'Включить отражение (F4)';
        }
    });
    if (document.getElementById('yohoho-iframe').getAttribute('src').includes("reyohoho.space")) {
        compressorButton.disabled = true;
        compressorButton.style.border = '1px solid gray';
        compressorButton.textContent = 'Компрессор в плеере';
    }
    if (document.getElementById('yohoho-iframe').getAttribute('src').includes("allarknow") || document.getElementById('yohoho-iframe').getAttribute('src').includes("videoframe") || document.getElementById('yohoho-iframe').getAttribute('src').includes("kinoserial.net")) {
        compressorButton.disabled = true;
        compressorButton.style.border = '1px solid gray';
        compressorButton.textContent = 'Компрессор недоступен';
    }
}

$(document).ready(function() {
  function checkIframe() {
    if ($('#yohoho-iframe').length > 0) {
      addButtons();
      clearInterval(intervalId);
    }
  }

  var intervalId = setInterval(checkIframe, 500);

  $('#yohoho-iframe').on('load', function () {
    addButtons();
    clearInterval(intervalId);
  });
});
`;

const addVIPButton = (): void => {
  if (mainWindow?.webContents.getURL().includes("contact.html") || mainWindow?.webContents.getURL().includes("top.html")) {
    mainWindow?.webContents.executeJavaScript(`
      if(document.getElementById('vip-buttonContainer')) {
        document.getElementById('vip-buttonContainer').remove();
      }
      `);
  } else {
    mainWindow?.webContents.executeJavaScript(addVIPButtonScript);
  }
};

const reload = (): void => {
  if (mainWindow?.webContents.getURL().includes("loader.html")) {
    mainWindow?.loadURL(main_site_url!);
  } else {
    mainWindow?.reload();
  }
};

let isNewCredsStored = false;
const openTorrents = (): void => {
  if (isNewCredsStored) {
    const credentials = `${store.get('login', '') as string}:${store.get('password', '') as string}`;
    const base64Credentials = Buffer.from(credentials).toString("base64");
    mainWindow?.webContents.executeJavaScript('document.querySelector("#kp-title").innerText')
      .then(result => {
        const match = result.match(/^(.*?)\s*\((\d{4})\)$/);
        if (match) {
          const title = match[1].trim();
          const year = match[2];
          createTorrentsWindow(title, year, appConfig!, base64Credentials);
        } else {
          createTorrentsWindow(result.replace(/\s*\(.*\)$/, ""), null, appConfig!, base64Credentials);
        }
      })
  } else {
    prompt({
      skipTaskbar: false,
      alwaysOnTop: true,
      title: 'Авторизация',
      height: 350,
      width: 500,
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
      .then((result: string[] | null) => {
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
          mainWindow?.webContents.executeJavaScript('document.querySelector("#kp-title").innerText')
            .then(result => {
              const match = result.match(/^(.*?)\s*\((\d{4})\)$/);
              if (match) {
                const title = match[1].trim();
                const year = match[2];
                createTorrentsWindow(title, year, appConfig!, base64Credentials);
              } else {
                createTorrentsWindow(result.replace(/\s*\(.*\)$/, ""), null, appConfig!, base64Credentials);
              }
            })
        }
      })
  }
};

const switchBlurVideo = (): void => {
  if (!mainWindow?.isFocused()) {
    if (mainWindow?.getOpacity() === 0.4) {
      mainWindow?.setOpacity(1.0);
    } else {
      mainWindow?.setOpacity(0.4);
    }
  } else {
    mainWindow?.setOpacity(1.0);
  }
  const switchBlurScript = `
   if(document.getElementById('yohoho-iframe').style.filter.includes('blur')) {
    document.getElementById('blur-button').style.border = '1px solid white';
    document.getElementById('yohoho-iframe').style.filter = '';
   } else {
    document.getElementById('blur-button').style.border = '1px solid red';
    document.getElementById('yohoho-iframe').style.filter = 'blur(50px)';
   }
   `;

  mainWindow?.webContents.executeJavaScript(switchBlurScript);
};

const switchCompressor = (): void => {
  const switchCompressorScript = `
  document.getElementById('compressor_button').click();
  `;

  mainWindow?.webContents.executeJavaScript(switchCompressorScript);
};

const switchMirror = (): void => {
  const switchMirrorScript = `
  document.getElementById('flip_button').click();
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
}

function loadConfig(config_url: string): void {
  fetch(config_url)
    .then(response => response.json() as Promise<AppConfig>)
    .then(data => {
      appConfig = data;

      const filter = {
        urls: [appConfig!.alloha_cdn_filter_url, appConfig!.lumex_cdn_filter_url]
      };

      session.defaultSession.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
        try {
          if (!details.requestHeaders['Referer']) return;
          if (details.requestHeaders['Referer'].includes(appConfig!.alloha_referer)) {
            details.requestHeaders['Origin'] = appConfig!.alloha_origin_url;
          }
          if (details.requestHeaders['Referer'].includes(appConfig!.lumex_referer)) {
            details.requestHeaders['Origin'] = appConfig!.lumex_origin_url;
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

function openHotkeysSettings(): void {
  if (mainWindow != null) {
    dialog.showMessageBox(mainWindow, {
      noLink: true,
      title: `Настройка хоткеев`,
      checkboxLabel: `Перехватывать`,
      checkboxChecked: store.get('blur_hotkey_is_global', true) as boolean,
      message: `Перехватывать глобально кнопку F2? (для работы блюра, когда приложение не в фокусе)`,
      buttons: ['Сохранить'],
    }).then((result) => {
      store.set('blur_hotkey_is_global', result['checkboxChecked']);
    });
  }
}

function changeWebUrlMirror(): void {
  prompt({
    skipTaskbar: false,
    alwaysOnTop: true,
    title: 'Укажите путь к зеркалу:',
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
        contextIsolation: false,
        webSecurity: false,
        devTools: isDebug,
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
    mainWindow?.setMenu(menu);
  } else {
    Menu.setApplicationMenu(menu);
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
    addVIPButton();
    mainWindow?.webContents.executeJavaScript(addButtonsScript);
  });

  mainWindow.webContents.on('did-stop-loading', () => {
    mainWindow?.setTitle(APP_NAME);
  });

  blocker?.enableBlockingInSession(mainWindow.webContents.session);

  mainWindow?.webContents.on('did-finish-load', () => {
    addVIPButton();
    mainWindow?.webContents.executeJavaScript(addButtonsScript);
  });

  mainWindow.on('closed', function () {
    mainWindow = null
  })

  mainWindow?.loadURL(main_site_url!);

  mainWindow.on('closed', function () {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  loadConfig(config_main_url);
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

app.on('browser-window-focus', () => {
  globalShortcut.register('F1', openTorrents);
  globalShortcut.register('F2', switchBlurVideo);
  globalShortcut.register('F3', switchCompressor);
  globalShortcut.register('F4', switchMirror);
  globalShortcut.register('F5', reload);
  globalShortcut.register('F11', () => {
    mainWindow?.webContents.toggleDevTools();
  });
  globalShortcut.register('CommandOrControl+R', reload);
})

app.on('browser-window-blur', () => {
  globalShortcut.unregister('F1');
  if (!store.get('blur_hotkey_is_global', true) as boolean) {
    globalShortcut.unregister('F2');
  }
  globalShortcut.unregister('F3');
  globalShortcut.unregister('F4');
  globalShortcut.unregister('F5');
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
  if (mainWindow != null) {
    dialog.showMessageBox(mainWindow, {
      noLink: true,
      type: 'info',
      title: `Обновление загружено`,
      message: `Установить сейчас?`,
      buttons: ['Позже', 'Установить'],
    }).then((result) => {
      if (result.response === 1) {
        autoUpdater.quitAndInstall();
      }
    });
  }
});