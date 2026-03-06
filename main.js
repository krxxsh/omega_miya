const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell, globalShortcut, Notification, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

// Define store using local file to avoid ESM/CJS versioning issues
const configPath = path.join(app.getPath('userData'), 'config.json');
const getStore = (key, defaultValue) => {
    try {
        if (!fs.existsSync(configPath)) return defaultValue;
        const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        return data[key] !== undefined ? data[key] : defaultValue;
    } catch (e) {
        return defaultValue;
    }
};
const setStore = (key, value) => {
    try {
        let data = {};
        if (fs.existsSync(configPath)) {
            data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
        data[key] = value;
        fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Error saving to store:', e);
    }
};

let mainWindow = null;
let tray = null;
const isDev = !app.isPackaged;

// User's Desktop path for file creation
const DESKTOP_PATH = app.getPath('desktop');

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 480,
        height: 780,
        minWidth: 400,
        minHeight: 600,
        frame: false,
        transparent: true,
        resizable: true,
        alwaysOnTop: false,
        skipTaskbar: false,
        icon: path.join(__dirname, 'assets', 'icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
    } else {
        mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
    }

    mainWindow.on('close', (e) => {
        if (!app.isQuitting) {
            e.preventDefault();
            mainWindow.hide();
        }
    });
}

function createTray() {
    const icon = nativeImage.createFromBuffer(
        Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAA' +
            'mElEQVQ4T2NkoBAwUqifYdAb8P9/A8P/BgYGRkZGRrhp' +
            'DAwMDP8ZGBj+MzIy/mdgYPjPAFIENIeBkZHxPwMDA8N/' +
            'kAIGBgYGRpACBgYGBkZGRrACmAKQIUBFYAUwQ0CKGRgY' +
            'GBgZGRn/g00BuwBsOUwBzBUMDAwMjIyMjP9BBoDcAXYh' +
            'AwMDA8h1jGBXAABxqy0R2dNJxQAAAABJRU5ErkJggg==',
            'base64'
        )
    );

    tray = new Tray(icon);
    tray.setToolTip('Miya AI Assistant');

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Show Miya',
            click: () => {
                mainWindow.show();
                mainWindow.focus();
            },
        },
        {
            label: 'Always on Top',
            type: 'checkbox',
            checked: false,
            click: (item) => {
                mainWindow.setAlwaysOnTop(item.checked);
            },
        },
        { type: 'separator' },
        {
            label: 'Quit',
            click: () => {
                app.isQuitting = true;
                app.quit();
            },
        },
    ]);

    tray.setContextMenu(contextMenu);
    tray.on('double-click', () => {
        mainWindow.show();
        mainWindow.focus();
    });
}

// ===== IPC Handlers =====

// Window controls
ipcMain.handle('minimize-window', () => mainWindow.hide());
ipcMain.handle('quit-app', () => {
    app.isQuitting = true;
    app.quit();
});

// Open external URL
ipcMain.handle('open-external', (_, url) => {
    shell.openExternal(url);
});

// Show notification
ipcMain.handle('show-notification', (_, title, body) => {
    if (Notification.isSupported()) {
        const notif = new Notification({ title, body });
        notif.show();
        notif.on('click', () => {
            mainWindow.show();
            mainWindow.focus();
        });
    }
});

// ===== SYSTEM CONTROL =====

// Open an application dynamically by searching Windows Start Menu
ipcMain.handle('open-app', (_, appName) => {
    const name = (appName || '').toLowerCase().trim();

    // Hardcoded highly common shortcuts
    const appCommands = {
        'chrome': 'start chrome',
        'notepad': 'start notepad',
        'explorer': 'start explorer',
        'calculator': 'start calc',
        'cmd': 'start cmd',
        'powershell': 'start powershell',
        'settings': 'start ms-settings:',
        'task manager': 'start taskmgr',
        // Common Folders
        'desktop': `start "" "${require('os').homedir()}\\Desktop"`,
        'documents': `start "" "${require('os').homedir()}\\Documents"`,
        'downloads': `start "" "${require('os').homedir()}\\Downloads"`,
        'pictures': `start "" "${require('os').homedir()}\\Pictures"`,
    };

    if (appCommands[name]) {
        exec(appCommands[name]);
        return `Opened ${appName}`;
    }

    // Advanced dynamic search using PowerShell
    // Searches Start Menu AND Desktop for shortcuts matching the name
    const psScript = `
        $name = "${name}"
        $paths = @(
            "$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs",
            "$env:ALLUSERSPROFILE\\Microsoft\\Windows\\Start Menu\\Programs",
            "$env:USERPROFILE\\Desktop",
            "$env:PUBLIC\\Desktop"
        )
        $shortcut = Get-ChildItem -Path $paths -Recurse -Include *.lnk, *.exe, *.url -ErrorAction SilentlyContinue | 
                    Where-Object { $_.BaseName -match $name } | 
                    Select-Object -First 1
        
        if ($shortcut) {
            Start-Process $shortcut.FullName
            Write-Output "SUCCESS"
        } else {
            Write-Output "NOT_FOUND"
        }
    `;

    const { spawn } = require('child_process');
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '-']);

    let output = '';
    child.stdout.on('data', (data) => output += data.toString());
    child.stderr.on('data', (data) => console.error('PS Error:', data.toString()));

    child.on('close', () => {
        if (output.includes('NOT_FOUND')) {
            console.log(`App not found: ${appName}`);
        }
    });

    child.stdin.write(psScript);
    child.stdin.end();

    return `Tried to launch ${appName}`;
});

// Create a file on the user's Desktop
ipcMain.handle('create-file', (_, filename, content) => {
    try {
        const filePath = path.join(DESKTOP_PATH, filename);
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, content || '', 'utf-8');
        return `Created file: ${filePath}`;
    } catch (err) {
        return `Error creating file: ${err.message}`;
    }
});

// Create a folder on the user's Desktop
ipcMain.handle('create-folder', (_, folderName) => {
    try {
        const folderPath = path.join(DESKTOP_PATH, folderName);
        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
        }
        return `Created folder: ${folderPath}`;
    } catch (err) {
        return `Error creating folder: ${err.message}`;
    }
});

// Execute arbitrary terminal commands (Agentic Control)
ipcMain.handle('execute-terminal', async (_, command) => {
    return new Promise((resolve) => {
        const { exec } = require('child_process');
        // Run in PowerShell, from the Desktop directory by default
        exec(`powershell -Command "${command.replace(/"/g, '\\"')}"`, { cwd: DESKTOP_PATH }, (error, stdout, stderr) => {
            if (error) {
                console.error(`Terminal error:`, error);
                resolve(`Error: ${stderr || error.message}`);
                return;
            }
            resolve(stdout || "Command executed successfully with no output.");
        });
    });
});

// Convert DOCX to PDF using native Word COM objects
ipcMain.handle('convert-docx-to-pdf', async (_, sourcePath) => {
    try {
        let fullPath = sourcePath;
        if (!path.isAbsolute(fullPath)) {
            fullPath = path.join(DESKTOP_PATH, sourcePath);
        }

        // Robust discovery: Check exact, then .docx, then fuzzy search desktop
        if (!fs.existsSync(fullPath)) {
            if (fs.existsSync(fullPath + '.docx')) {
                fullPath += '.docx';
            } else {
                // Fuzzy search on desktop for files containing names like "krish resume"
                try {
                    const files = fs.readdirSync(DESKTOP_PATH);
                    const baseName = path.basename(sourcePath).toLowerCase().trim();
                    const matched = files.find(f =>
                        f.toLowerCase().includes(baseName) &&
                        f.toLowerCase().endsWith('.docx')
                    );
                    if (matched) {
                        fullPath = path.join(DESKTOP_PATH, matched);
                    }
                } catch (e) {
                    console.error("Desktop search failed:", e);
                }
            }
        }

        if (!fs.existsSync(fullPath)) {
            return `Error: File not found: ${fullPath}. Please make sure it's on your Desktop.`;
        }

        const outPath = fullPath.replace(/\.docx?$/i, '.pdf');

        const psScript = `
            $word = New-Object -ComObject Word.Application
            $word.Visible = $false
            $doc = $word.Documents.Open('${fullPath.replace(/'/g, "''")}')
            $doc.SaveAs([ref] '${outPath.replace(/'/g, "''")}', [ref] 17)  # 17 = wdFormatPDF
            $doc.Close()
            $word.Quit()
            [System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null
            Write-Output "SUCCESS"
        `;

        return new Promise((resolve) => {
            const { spawn } = require('child_process');
            const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '-']);

            let output = '';
            let errorOut = '';
            child.stdout.on('data', (data) => output += data.toString());
            child.stderr.on('data', (data) => errorOut += data.toString());

            child.on('close', (code) => {
                if (output.includes('SUCCESS')) {
                    resolve(`Successfully converted to PDF: ${outPath}`);
                } else {
                    resolve(`Failed to convert. Ensure Microsoft Word is installed. Error: ${errorOut}`);
                }
            });

            child.stdin.write(psScript);
            child.stdin.end();
        });
    } catch (err) {
        console.error('PDF Conversion error:', err);
        return `Error: ${err.message}`;
    }
});


// capture-screen IPC handler
ipcMain.handle('capture-screen', async () => {
    try {
        const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1920, height: 1080 } });
        const primarySource = sources[0];
        if (!primarySource) return 'Error: No screen source found';

        return primarySource.thumbnail.toDataURL(); // Returns base64 image string
    } catch (err) {
        console.error('Screen capture error:', err);
        return `Error: ${err.message}`;
    }
});

// Media Control IPC handler
ipcMain.handle('control-media', async (_, args) => {
    console.log('Miya Control-Media:', args);
    const action = typeof args === 'string' ? args : args.action;
    const level = args && typeof args.level === 'number' ? args.level : 50;

    if (action === 'set_volume' || action === 'vol_up' || action === 'vol_down') {
        const psScript = `
            $code = @'
            using System;
            using System.Runtime.InteropServices;
            [Guid("5CDF2C82-151E-41F4-B541-8DF05737F143"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
            interface IAudioEndpointVolume {
                int f1(); int f2(); int f3(); int f4();
                int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
                int f5();
                int GetMasterVolumeLevelScalar(out float pfLevel);
                int f6(); int f7(); int f8(); int f9();
                int VolumeStepUp(Guid pguidEventContext);
                int VolumeStepDown(Guid pguidEventContext);
            }
            [Guid("D6660639-8287-4E57-BB3A-525561846A33"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
            interface IMMDevice { int Activate(ref Guid id, int cls, IntPtr p, out IAudioEndpointVolume v); }
            [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
            interface IMMDeviceEnumerator { int f(); int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint); }
            [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorComObject { }
            public class Vol {
                public static string Do(string action, float level) {
                    try {
                        IMMDeviceEnumerator enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
                        IMMDevice speaker;
                        // 0 = Render, 1 = Multimedia role
                        enumerator.GetDefaultAudioEndpoint(0, 1, out speaker);
                        IAudioEndpointVolume vol;
                        Guid iid = new Guid("5CDF2C82-151E-41F4-B541-8DF05737F143");
                        speaker.Activate(ref iid, 1, IntPtr.Zero, out vol);
                        if (action == "set_volume") vol.SetMasterVolumeLevelScalar(level / 100.0f, Guid.Empty);
                        else if (action == "vol_up") vol.VolumeStepUp(Guid.Empty);
                        else if (action == "vol_down") vol.VolumeStepDown(Guid.Empty);
                        float res; vol.GetMasterVolumeLevelScalar(out res);
                        return "OK:" + (int)(res * 100);
                    } catch (Exception ex) { return "ERR:" + ex.Message; }
                }
            }
'@
            try { Add-Type -TypeDefinition $code -ErrorAction Stop } catch {}
            [Vol]::Do("${action}", ${level})
        `;

        return new Promise((resolve) => {
            const { spawn } = require('child_process');
            const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '-']);
            let output = '';
            child.stdout.on('data', d => output += d.toString());
            child.stderr.on('data', d => output += d.toString());
            child.on('close', () => resolve(output.trim()));
            child.stdin.write(psScript);
            child.stdin.end();
        });
    }

    const keyCodes = { 'play_pause': '0xB3', 'next': '0xB0', 'prev': '0xB1' };
    const key = keyCodes[action];
    if (!key) return `Error: Unknown action ${action}`;

    return new Promise((resolve) => {
        const { spawn } = require('child_process');
        const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `(New-Object -ComObject WScript.Shell).SendKeys([char]${key})`]);
        child.on('close', () => resolve(`Media action '${action}' executed.`));
    });
});

// Organize Desktop IPC handler
ipcMain.handle('organize-desktop', async () => {
    try {
        const categories = {
            'Resumes': ['.pdf', '.docx', '.doc'], // Specifically for the user's resume focus
            'Images': ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg'],
            'Media': ['.mp4', '.mkv', '.mp3', '.wav', '.mov'],
            'Archives': ['.zip', '.rar', '.7z', '.tar', '.gz'],
            'Scripts': ['.js', '.py', '.ps1', '.bat', '.sh']
        };

        const files = fs.readdirSync(DESKTOP_PATH);
        let movedCount = 0;
        let summary = [];

        for (const file of files) {
            const filePath = path.join(DESKTOP_PATH, file);
            if (fs.lstatSync(filePath).isDirectory()) continue;

            const ext = path.extname(file).toLowerCase();
            for (const [folder, extensions] of Object.entries(categories)) {
                if (extensions.includes(ext)) {
                    const targetFolder = path.join(DESKTOP_PATH, folder);
                    if (!fs.existsSync(targetFolder)) fs.mkdirSync(targetFolder);

                    const targetPath = path.join(targetFolder, file);
                    // Avoid overwriting
                    if (!fs.existsSync(targetPath)) {
                        fs.renameSync(filePath, targetPath);
                        movedCount++;
                        if (!summary.includes(folder)) summary.push(folder);
                    }
                    break;
                }
            }
        }

        if (movedCount === 0) return "Desktop is already perfectly tidy! ✨";
        return `Organized ${movedCount} files into: ${summary.join(', ')}. Your workspace is now clean! 🧹`;
    } catch (err) {
        console.error('Organization error:', err);
        return `Error organizing desktop: ${err.message}`;
    }
});

// Settings (API Keys)
ipcMain.handle('get-api-key', () => getStore('miya-api-key', ''));
ipcMain.handle('set-api-key', (_, key) => { setStore('miya-api-key', key); return true; });

// Memory persistence via filesystem
ipcMain.handle('get-memories', () => getStore('miya-memories', []));
ipcMain.handle('set-memories', (_, memories) => { setStore('miya-memories', memories); return true; });

// Get Model preference
ipcMain.handle('get-model', () => getStore('miya-model', 'llama3.3-70b-versatile'));
ipcMain.handle('set-model', (_, model) => { setStore('miya-model', model); return true; });

// Auto-start setting
ipcMain.handle('get-autostart', () => getStore('miya-autostart', false));
ipcMain.handle('set-autostart', (_, enabled) => {
    setStore('miya-autostart', enabled);
    app.setLoginItemSettings({
        openAtLogin: enabled,
        path: app.getPath('exe'),
    });
    return enabled;
});

// ===== App Lifecycle =====

app.whenReady().then(() => {
    createWindow();
    createTray();

    // Auto-start setting
    const autoStart = getStore('miya-autostart', false);
    app.setLoginItemSettings({
        openAtLogin: autoStart,
        path: app.getPath('exe'),
    });

    // Global shortcut: Ctrl+Shift+M to toggle window
    globalShortcut.register('CommandOrControl+Shift+M', () => {
        if (mainWindow.isVisible()) {
            mainWindow.hide();
        } else {
            mainWindow.show();
            mainWindow.focus();
        }
    });
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
