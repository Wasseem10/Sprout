const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('insightos', {
  openCsv: () => ipcRenderer.invoke('insightos:open-csv'),
  chooseFolder: () => ipcRenderer.invoke('insightos:choose-folder'),
  screenSources: () => ipcRenderer.invoke('insightos:screen-sources'),
  captureScreen: (id) => ipcRenderer.invoke('insightos:capture-screen', id),
  openAccount: (provider) => ipcRenderer.invoke('insightos:open-account', provider),
  platform: process.platform,
  setBuddyMode: (mode) => ipcRenderer.invoke('insightos:buddy-mode', mode),
  hideBuddy: () => ipcRenderer.invoke('insightos:buddy-hide'),
  desktopShortcuts: () => ipcRenderer.invoke('insightos:desktop-shortcuts'),
  onDesktopCommand: (callback) => {
    const listener = (_event, command) => callback(command);
    ipcRenderer.on('insightos:desktop-command', listener);
    return () => ipcRenderer.removeListener('insightos:desktop-command', listener);
  },
});
