import { ElectronBlocker } from '@ghostery/adblocker-electron';
import fetch from 'cross-fetch';
import { app, BrowserWindow, dialog, session, globalShortcut, shell } from 'electron';

const APP_NAME = `ReYohoho Desktop ${app.getVersion()}`;

app.commandLine.appendSwitch('disable-site-isolation-trials');
let mainWindow: BrowserWindow | null = null;

const reload = (): void => {
  if (mainWindow?.webContents.getURL().includes("loader.html")) {
    mainWindow?.loadURL('https://reyohoho.github.io/reyohoho');
  } else {
    mainWindow?.loadURL(mainWindow?.webContents.getURL());
  }
  setupButtons();
};

if (!AbortSignal.timeout) {
  AbortSignal.timeout = function timeout(ms: number): AbortSignal {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), ms);
    return ctrl.signal;
  };
}

interface UpdateInfo {
  version: string;
  changelog: string;
  download_link: string;
}

interface AppVersionResponse {
  "reyohoho-desktop": UpdateInfo;
}

function checkUpdates(): void {
  fetch('https://reyohoho.space:4437/appversion', { signal: AbortSignal.timeout(5000) })
    .then(response => response.json() as Promise<AppVersionResponse>)
    .then(data => {
      const update_info = data["reyohoho-desktop"];
      if (update_info.version === app.getVersion()) {
        return;
      }
      if (mainWindow != null) {
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: `Доступно обновление ${update_info.version}!`,
          message: update_info.changelog,
          buttons: ['Позже', 'Обновить'],
        }).then((result) => {
          if (result.response === 1) {
            shell.openExternal(update_info.download_link);
          }
        });
      }
    })
    .catch(error => {
      console.error('Error check updates:', error);
    });
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 850,
    autoHideMenuBar: true,
    darkTheme: true,
    backgroundColor: "#000",
    icon: 'icon.png',
    webPreferences: {
      contextIsolation: false,
      webSecurity: false,
    }
  });
  mainWindow.loadFile("loader.html");
  mainWindow.maximize();
  checkUpdates();
  mainWindow.setTitle(APP_NAME + ' Loading ....');
  const blocker = await ElectronBlocker.fromLists(fetch, [
    'https://reyohoho.space:4437/template/easylist.txt'
  ]);

  mainWindow.webContents.on('did-start-loading', () => {
    mainWindow?.setTitle(APP_NAME + ' Loading ....');
  });

  mainWindow.webContents.on('did-stop-loading', () => {
    mainWindow?.setTitle(APP_NAME);
  });

  blocker.enableBlockingInSession(mainWindow.webContents.session);

  setupButtons();

  setTimeout(() => {
    mainWindow?.loadURL('https://reyohoho.github.io/reyohoho');
  }, 1000);

  mainWindow.on('closed', function () {
    mainWindow = null
  })
}

function setupButtons(): void {
  mainWindow?.webContents.on('did-finish-load', () => {
    const addButtonsScript = `
    let isButtonClicked = false;
    let csource = null;
    let isInit = false;
    let isFlipButtonClicked = false;

    $('#yohoho-iframe').on('load', function () {
        const elementToRemove = document.getElementById('rh-buttonContainer');
        if (elementToRemove) {
            elementToRemove.remove();
        }
        const buttonContainer = document.createElement('div');
        buttonContainer.id = 'rh-buttonContainer';
        buttonContainer.style.position = 'fixed';
        buttonContainer.style.top = '10px';
        buttonContainer.style.right = '10px';
        buttonContainer.style.zIndex = 10000;
        buttonContainer.style.display = 'flex'; // Flexbox для горизонтального расположения
        buttonContainer.style.gap = '10px'; // Расстояние между кнопками
        // buttonContainer.style.pointerEvents = 'none'; // Не блокировать клики по элементам под контейнером
        document.body.appendChild(buttonContainer);

        // Создаем первую кнопку
        const compressorButton = document.createElement('button');
        compressorButton.textContent = 'Включить компрессор';
        compressorButton.style.padding = '10px 20px';
        compressorButton.style.backgroundColor = 'blue';
        compressorButton.style.color = 'white';
        compressorButton.style.border = 'none';
        compressorButton.style.borderRadius = '5px';
        compressorButton.style.cursor = 'pointer';
        buttonContainer.appendChild(compressorButton);

        // Создаем вторую кнопку
        const flipButton = document.createElement('button');
        flipButton.textContent = 'Включить отражение';
        flipButton.style.padding = '10px 20px';
        flipButton.style.backgroundColor = 'blue';
        flipButton.style.color = 'white';
        flipButton.style.border = 'none';
        flipButton.style.borderRadius = '5px';
        flipButton.style.cursor = 'pointer';
        buttonContainer.appendChild(flipButton);

        // Добавляем обработчики событий для кнопок
        compressorButton.addEventListener('click', () => {
            try {

                if (!csource) {
                    const ik = document.getElementById('yohoho-iframe');
                    $('#yohoho-iframe').on('load', function () {
                        csource = null;
                        isButtonClicked = false;
                        compressorButton.style.backgroundColor = 'blue';
                        compressorButton.textContent = 'Включить компрессор';
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
                compressorButton.style.backgroundColor = 'orange';
                compressorButton.textContent = 'Выключить компрессор';
            } else {
                csource.disconnect(compressor);
                compressor.disconnect(contextC.destination);
                csource.connect(contextC.destination);
                isButtonClicked = false;
                compressorButton.style.backgroundColor = 'blue';
                compressorButton.textContent = 'Включить компрессор';
            }
        });

        flipButton.addEventListener('click', () => {
            const ik = document.getElementById('yohoho-iframe');
            const video_iframe = ik.contentDocument.querySelectorAll('video')[0];
            try {
                if (!isInit) {
                    $('#yohoho-iframe').on('load', function () {
                        isFlipButtonClicked = false;
                        flipButton.style.backgroundColor = 'blue';
                        flipButton.textContent = 'Включить отражение';
                    });
                }
            } catch (e) {
                console.log(e);
            }

            if (!isFlipButtonClicked) {
                video_iframe.style.transform = 'scaleX(-1)';
                isFlipButtonClicked = true;
                flipButton.style.backgroundColor = 'orange';
                flipButton.textContent = 'Выключить отражение';
            } else {
                video_iframe.style.transform = 'scaleX(1)';
                isFlipButtonClicked = false;
                flipButton.style.backgroundColor = 'blue';
                flipButton.textContent = 'Включить отражение';
            }
        });
        if (document.getElementById('yohoho-iframe').getAttribute('src').includes("allarknow")) {
            compressorButton.disabled = true;
            compressorButton.style.backgroundColor = 'gray';
            compressorButton.textContent = 'Компрессор по умолчанию';
        }
        if (document.getElementById('yohoho-iframe').getAttribute('src').includes("reyohoho.space")) {
            compressorButton.disabled = true;
            compressorButton.style.backgroundColor = 'gray';
            compressorButton.textContent = 'Компрессор в плеере';
        }
        if (document.getElementById('yohoho-iframe').getAttribute('src').includes("videoframe") || document.getElementById('yohoho-iframe').getAttribute('src').includes("kinoserial.net")) {
            compressorButton.disabled = true;
            compressorButton.style.backgroundColor = 'gray';
            compressorButton.textContent = 'Компрессор недоступен';
        }

    });
    `;

    mainWindow?.webContents.executeJavaScript(addButtonsScript);
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

app.whenReady().then(() => {
  globalShortcut.register('F5', reload);
  globalShortcut.register('CommandOrControl+R', reload);
  const filter = {
    urls: ['https://*.video-ik-ok-ii.space/*', 'https://*.lumex.space/*']
  };

  session.defaultSession.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    if (details.requestHeaders['Referer'].includes("allarknow")) {
      details.requestHeaders['Origin'] = 'https://attractive-as.allarknow.online/';
    }
    if (details.requestHeaders['Referer'].includes("lumex")) {
      details.requestHeaders['Origin'] = 'https://p.lumex.space';
    }
    callback({ requestHeaders: details.requestHeaders });
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});