const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Settings
    getApiKey: () => ipcRenderer.invoke('get-api-key'),
    setApiKey: (key) => ipcRenderer.invoke('set-api-key', key),

    // Window
    minimize: () => ipcRenderer.invoke('minimize-window'),
    quit: () => ipcRenderer.invoke('quit-app'),

    // System control
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
    openApp: (name) => ipcRenderer.invoke('open-app', name),
    createFile: (filename, content) => ipcRenderer.invoke('create-file', filename, content),
    createFolder: (name) => ipcRenderer.invoke('create-folder', name),
    showNotification: (title, body) => ipcRenderer.invoke('show-notification', title, body),
    executeTerminal: (command) => ipcRenderer.invoke('execute-terminal', command),
    convertDocxToPdf: (path) => ipcRenderer.invoke('convert-docx-to-pdf', path),
    captureScreen: () => ipcRenderer.invoke('capture-screen'),
    controlMedia: (action) => ipcRenderer.invoke('control-media', action),
    organizeDesktop: () => ipcRenderer.invoke('organize-desktop'),

    // Memory persistence
    getMemories: () => ipcRenderer.invoke('get-memories'),
    setMemories: (memories) => ipcRenderer.invoke('set-memories', memories),

    // Model & settings
    getModel: () => ipcRenderer.invoke('get-model'),
    setModel: (model) => ipcRenderer.invoke('set-model', model),
    getAutostart: () => ipcRenderer.invoke('get-autostart'),
    setAutostart: (enabled) => ipcRenderer.invoke('set-autostart', enabled),
});
