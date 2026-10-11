const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('insightos', {
  openCsv: () => ipcRenderer.invoke('insightos:open-csv'),
  chooseFolder: () => ipcRenderer.invoke('insightos:choose-folder'),
  screenSources: () => ipcRenderer.invoke('insightos:screen-sources'),
  captureScreen: (id) => ipcRenderer.invoke('insightos:capture-screen', id),
  captureCurrentScreen: () => ipcRenderer.invoke('insightos:capture-current-screen'),
  clickCapturedTarget: (captureId, x, y, target, observedText, context, authorization) =>
    ipcRenderer.invoke(
      'insightos:click-captured-target',
      captureId,
      x,
      y,
      target,
      observedText,
      context,
      authorization,
    ),
  scrollCurrentScreen: (direction) =>
    ipcRenderer.invoke('insightos:scroll-current-screen', direction),
  openAccount: (provider) => ipcRenderer.invoke('insightos:open-account', provider),
  platform: process.platform,
  setBuddyMode: (mode, requestId) => ipcRenderer.invoke('insightos:buddy-mode', mode, requestId),
  hideBuddy: () => ipcRenderer.invoke('insightos:buddy-hide'),
  desktopVisibility: () => ipcRenderer.invoke('insightos:desktop-visibility'),
  onDesktopVisibility: (callback) => {
    const listener = (_event, snapshot) => callback(snapshot);
    ipcRenderer.on('insightos:desktop-visibility-changed', listener);
    return () => ipcRenderer.removeListener('insightos:desktop-visibility-changed', listener);
  },
  desktopDrag: () => ipcRenderer.invoke('insightos:desktop-drag'),
  onDesktopDrag: (callback) => {
    const listener = (_event, snapshot) => callback(snapshot);
    ipcRenderer.on('insightos:desktop-drag-changed', listener);
    return () => ipcRenderer.removeListener('insightos:desktop-drag-changed', listener);
  },
  desktopShortcuts: () => ipcRenderer.invoke('insightos:desktop-shortcuts'),
  onDesktopCommand: (callback) => {
    const listener = (_event, command) => callback(command);
    ipcRenderer.on('insightos:desktop-command', listener);
    return () => ipcRenderer.removeListener('insightos:desktop-command', listener);
  },
});
