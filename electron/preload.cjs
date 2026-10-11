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
  cancelPointerActions: () => ipcRenderer.invoke('insightos:cancel-pointer-actions'),
  navigatePresentationSlide: (slide, filename) =>
    ipcRenderer.invoke('insightos:navigate-presentation-slide', slide, filename),
  activatePinnedApp: (app) => ipcRenderer.invoke('insightos:activate-pinned-app', app),
  openVisibleFolder: (name, path) =>
    ipcRenderer.invoke('insightos:open-visible-folder', name, path),
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
