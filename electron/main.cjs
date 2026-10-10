const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  session,
  desktopCapturer,
  shell,
  screen,
  Tray,
  Menu,
  nativeImage,
  globalShortcut,
} = require('electron');
const path = require('node:path');
const { readFile, stat } = require('node:fs/promises');
require('dotenv').config({ quiet: true });
let backend;
let companionWindow,
  tray,
  quitting = false,
  windowMode = 'pill';
let dockPosition;
const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();
app.on('second-instance', () => {
  if (companionWindow && !companionWindow.isDestroyed()) {
    companionWindow.show();
    companionWindow.focus();
    companionWindow.webContents.send('insightos:desktop-command', 'show');
  }
});
const dev = process.argv.includes('--dev');
const remote = process.env.INSIGHTOS_APP_URL;
if (remote) {
  const url = new URL(remote);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw new Error('INSIGHTOS_APP_URL must be an HTTPS origin.');
}
const appUrl = dev
  ? 'http://127.0.0.1:5173'
  : remote
    ? new URL(remote).origin
    : 'http://127.0.0.1:4311';
const trusted = (url) => {
  try {
    return new URL(url).origin === appUrl;
  } catch {
    return false;
  }
};
app.enableSandbox();
app
  .whenReady()
  .then(async () => {
    if (!primaryInstance) return;
    if (!dev && !remote) {
      const { buildApp } = await import('../dist-server/server/app.js');
      backend = await buildApp();
      await backend.listen({ host: '127.0.0.1', port: 4311 });
    }
    session.defaultSession.setPermissionRequestHandler((contents, permission, callback) =>
      callback(trusted(contents.getURL()) && permission === 'media'),
    );
    session.defaultSession.setPermissionCheckHandler(
      (contents, permission) => !!contents && trusted(contents.getURL()) && permission === 'media',
    );
    ipcMain.handle('insightos:open-csv', async (event) => {
      if (!trusted(event.senderFrame?.url ?? '')) throw new Error('Untrusted file request.');
      const selected = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
        title: 'Open an operations CSV',
        properties: ['openFile'],
        filters: [{ name: 'CSV files', extensions: ['csv'] }],
      });
      if (selected.canceled) return null;
      const file = selected.filePaths[0];
      if (path.extname(file).toLowerCase() !== '.csv') throw new Error('Choose a CSV file.');
      if ((await stat(file)).size > 1024 * 1024) throw new Error('CSV must be 1 MB or smaller.');
      return { name: path.basename(file), text: await readFile(file, 'utf8') };
    });
    const nativeRequest = (event) => {
      if (!trusted(event.senderFrame?.url ?? '') || (!dev && remote))
        throw new Error('Computer controls require the trusted local desktop app.');
    };
    ipcMain.handle('insightos:open-account', async (event, provider) => {
      nativeRequest(event);
      const pages = Object.freeze({
        huggingFace: 'https://huggingface.co/settings/tokens',
        elevenLabs: 'https://elevenlabs.io/app',
        databricks: 'https://login.databricks.com/',
        neon: 'https://console.neon.tech/',
        vultr: 'https://my.vultr.com/',
      });
      if (typeof provider !== 'string' || !Object.hasOwn(pages, provider))
        throw new Error('Unknown account page.');
      await shell.openExternal(pages[provider]);
    });
    ipcMain.handle('insightos:choose-folder', async (event) => {
      nativeRequest(event);
      const selected = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
        title: 'Choose where InsightOS can create Python files',
        properties: ['openDirectory', 'createDirectory'],
      });
      if (selected.canceled) return null;
      const key = await readFile(
        path.join(process.env.LOCAL_DATA_DIR || path.resolve('.local'), 'desktop-bridge-key'),
        'utf8',
      );
      const cookies = await session.defaultSession.cookies.get({
        url: appUrl,
        name: 'insightos_session',
      });
      const response = await fetch('http://127.0.0.1:4311/api/computer/authorize-folder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-insightos-desktop-key': key,
          Cookie: cookies.map((c) => `${c.name}=${c.value}`).join('; '),
        },
        body: JSON.stringify({ folder: selected.filePaths[0] }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Computer folder selection failed.');
      return result;
    });
    let screenChoices = new Set();
    ipcMain.handle('insightos:screen-sources', async (event) => {
      nativeRequest(event);
      const sources = await desktopCapturer.getSources({
        types: ['window', 'screen'],
        thumbnailSize: { width: 260, height: 160 },
      });
      screenChoices = new Set(sources.map((s) => s.id));
      return sources.map((s) => ({ id: s.id, name: s.name, thumbnail: s.thumbnail.toDataURL() }));
    });
    ipcMain.handle('insightos:capture-screen', async (event, id) => {
      nativeRequest(event);
      if (typeof id !== 'string' || !screenChoices.has(id))
        throw new Error('Choose a screen from the current picker.');
      screenChoices.clear();
      const source = (
        await desktopCapturer.getSources({
          types: ['window', 'screen'],
          thumbnailSize: { width: 1600, height: 1000 },
        })
      ).find((s) => s.id === id);
      if (!source || source.thumbnail.isEmpty())
        throw new Error('That window is no longer available. Choose it again.');
      return { name: source.name, image: source.thumbnail.toDataURL() };
    });
    const work = screen.getPrimaryDisplay().workArea;
    const standaloneWorkspace = process.argv.includes('--workspace') || !!remote;
    const win = (companionWindow = new BrowserWindow({
      width: standaloneWorkspace ? 1500 : 360,
      height: standaloneWorkspace ? 950 : 86,
      x: Math.round(work.x + (work.width - (standaloneWorkspace ? 1500 : 360)) / 2),
      y: work.y + 20,
      title: 'InsightOS Buddy',
      frame: standaloneWorkspace,
      transparent: !standaloneWorkspace,
      backgroundColor: standaloneWorkspace ? '#101211' : '#00000000',
      alwaysOnTop: !standaloneWorkspace,
      resizable: standaloneWorkspace,
      maximizable: standaloneWorkspace,
      skipTaskbar: !standaloneWorkspace,
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
        backgroundThrottling: false,
      },
    }));
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event, url) => {
      if (!trusted(url)) event.preventDefault();
    });
    const resizeBuddy = (mode) => {
      if (!['pill', 'panel', 'workspace'].includes(mode))
        throw new Error('Unknown companion mode.');
      if (standaloneWorkspace) return;
      const previous = win.getBounds();
      if (windowMode !== 'workspace')
        dockPosition = { x: previous.x, y: previous.y, width: previous.width };
      const area = screen.getDisplayMatching(previous).workArea;
      const width = Math.min(
        mode === 'workspace' ? 1350 : mode === 'panel' ? 440 : 360,
        area.width,
      );
      const height = Math.min(
        mode === 'workspace' ? 900 : mode === 'panel' ? 580 : 86,
        area.height,
      );
      const position = mode === 'workspace' ? null : dockPosition;
      const x = position
        ? position.x + (position.width - width) / 2
        : area.x + (area.width - width) / 2;
      const y = position?.y ?? area.y + 20;
      windowMode = mode;
      win.setAlwaysOnTop(mode !== 'workspace');
      win.setSkipTaskbar(mode !== 'workspace');
      win.setResizable(mode === 'workspace');
      win.setBounds({
        x: Math.round(Math.max(area.x, Math.min(x, area.x + area.width - width))),
        y: Math.round(Math.max(area.y, Math.min(y, area.y + area.height - height))),
        width,
        height,
      });
    };
    const dispatch = (command) => {
      if (win.isDestroyed()) return;
      if (command !== 'hide') {
        win.show();
        win.focus();
      }
      win.webContents.send('insightos:desktop-command', command);
    };
    ipcMain.handle('insightos:buddy-mode', (event, mode) => {
      nativeRequest(event);
      resizeBuddy(mode);
    });
    ipcMain.handle('insightos:buddy-hide', (event) => {
      nativeRequest(event);
      win.hide();
    });
    ipcMain.handle('insightos:desktop-shortcuts', (event) => {
      nativeRequest(event);
      return {
        voice: globalShortcut.isRegistered('Control+Shift+Space'),
        stop: globalShortcut.isRegistered('Control+Shift+Backspace'),
      };
    });
    if (!standaloneWorkspace) {
      // A native bitmap keeps the tray icon independent of remote assets and SVG support.
      const pixels = Buffer.alloc(32 * 32 * 4);
      for (let y = 0; y < 32; y++)
        for (let x = 0; x < 32; x++) {
          const inside = (x - 15.5) ** 2 + (y - 15.5) ** 2 < 225;
          const eye = y >= 12 && y <= 18 && ((x >= 9 && x <= 12) || (x >= 20 && x <= 23));
          const i = (y * 32 + x) * 4;
          pixels[i] = eye ? 20 : 139;
          pixels[i + 1] = eye ? 25 : 236;
          pixels[i + 2] = eye ? 20 : 196;
          pixels[i + 3] = inside ? 255 : 0;
        }
      tray = new Tray(nativeImage.createFromBitmap(pixels, { width: 32, height: 32 }));
      tray.setToolTip('InsightOS — your desktop buddy');
      tray.setContextMenu(
        Menu.buildFromTemplate([
          { label: 'Show buddy', click: () => dispatch('show') },
          { label: 'Talk to InsightOS', click: () => dispatch('voice') },
          { label: 'Stop task and audio', click: () => dispatch('stop') },
          { type: 'separator' },
          { label: 'Settings', click: () => dispatch('settings') },
          { label: 'Open workspace', click: () => dispatch('workspace') },
          { type: 'separator' },
          { label: 'Quit InsightOS', click: () => app.quit() },
        ]),
      );
      tray.on('click', () => dispatch('show'));
      win.on('close', (event) => {
        if (!quitting) {
          event.preventDefault();
          dispatch('hide');
        }
      });
      globalShortcut.register('Control+Shift+Space', () => dispatch('voice'));
      globalShortcut.register('Control+Shift+Backspace', () => dispatch('stop'));
    }
    await win.loadURL(appUrl + (standaloneWorkspace ? '' : '/?desktop=buddy'));
    win.show();
  })
  .catch((error) => {
    dialog.showErrorBox(
      'InsightOS could not start',
      error.message + '\nRun npm run build first, or close an existing instance using port 4311.',
    );
    app.quit();
  });
app.on('window-all-closed', () => {
  if (!tray) app.quit();
});
app.on('before-quit', () => {
  quitting = true;
});
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  tray?.destroy();
  void backend?.close();
});
app.on('activate', () => {
  companionWindow?.show();
});
