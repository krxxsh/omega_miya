/**
 * Command Service
 * Handles system commands triggered by AI function calling
 */

/**
 * Available tool definitions for OpenAI function calling
 */
export const TOOL_DEFINITIONS = [
    {
        type: 'function',
        function: {
            name: 'get_current_time',
            description: 'Get the current time and date',
            parameters: { type: 'object', properties: {}, required: [] },
        },
    },
    {
        type: 'function',
        function: {
            name: 'open_website',
            description: 'Open a website URL in the user\'s browser',
            parameters: {
                type: 'object',
                properties: {
                    url: { type: 'string', description: 'The URL to open (include https://)' },
                },
                required: ['url'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'open_app',
            description: 'Open a desktop application on the user\'s PC (e.g. Chrome, Notepad, File Explorer, Calculator, VS Code, Settings, Paint, Word, Excel, Task Manager, Spotify)',
            parameters: {
                type: 'object',
                properties: {
                    app_name: { type: 'string', description: 'The name of the application to open' },
                },
                required: ['app_name'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'create_file',
            description: 'Create a text file on the user\'s desktop with specified content',
            parameters: {
                type: 'object',
                properties: {
                    filename: { type: 'string', description: 'Name of the file (e.g. notes.txt)' },
                    content: { type: 'string', description: 'The content to write into the file' },
                },
                required: ['filename', 'content'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'create_folder',
            description: 'Create a new folder on the user\'s desktop',
            parameters: {
                type: 'object',
                properties: {
                    folder_name: { type: 'string', description: 'Name of the folder to create' },
                },
                required: ['folder_name'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'search_web',
            description: 'Search the web for a query by opening a Google search',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'The search query' },
                },
                required: ['query'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'set_reminder',
            description: 'Set a reminder for the user (shows a notification)',
            parameters: {
                type: 'object',
                properties: {
                    message: { type: 'string', description: 'The reminder message' },
                    minutes: { type: 'number', description: 'Minutes from now to trigger the reminder' },
                },
                required: ['message', 'minutes'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'save_note',
            description: 'Save a note or important information for the user to remember later',
            parameters: {
                type: 'object',
                properties: {
                    content: { type: 'string', description: 'The note content to save' },
                    category: { type: 'string', description: 'Category: general, work, personal, ideas' },
                },
                required: ['content'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'recall_memories',
            description: 'Search through saved memories and notes about the user',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'What to search for in memories' },
                },
                required: ['query'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'execute_terminal',
            description: 'Execute a PowerShell command on the user\'s desktop for automation or system checks',
            parameters: {
                type: 'object',
                properties: {
                    command: { type: 'string', description: 'The PowerShell command to run (e.g. dir, Get-Process, etc)' },
                },
                required: ['command'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'convert_file',
            description: 'Convert a document from .docx to .pdf format on the Desktop',
            parameters: {
                type: 'object',
                properties: {
                    source_filename: { type: 'string', description: 'The name of the docx file on the desktop (e.g. resume.docx)' },
                },
                required: ['source_filename'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'describe_screen',
            description: 'Capture a snapshot of the user\'s current screen and describe what is visible (apps, websites, bugs, or specific content)',
            parameters: { type: 'object', properties: {}, required: [] },
        },
    },
    {
        type: 'function',
        function: {
            name: 'control_media',
            description: 'Control system media playback and volume (Spotify, YouTube, etc.)',
            parameters: {
                type: 'object',
                properties: {
                    action: {
                        type: 'string',
                        enum: ['play_pause', 'next', 'prev', 'vol_up', 'vol_down', 'set_volume'],
                        description: 'The media action to perform'
                    },
                    level: {
                        type: 'number',
                        description: 'Volume level (0-100). Required only for set_volume. Omit for vol_up/vol_down.'
                    }
                },
                required: ['action'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'clean_desktop',
            description: 'Intelligently organize the user\'s Desktop by grouping files into folders like Resumes, Images, and Scripts',
            parameters: { type: 'object', properties: {}, required: [] },
        },
    },
];

// Active reminders storage
const activeReminders = [];

/**
 * Execute a tool call from the AI
 * @param {string} name - Function name
 * @param {object} args - Function arguments
 * @returns {string} Result message
 */
export async function executeCommand(name, args) {
    switch (name) {
        case 'get_current_time': {
            const now = new Date();
            const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const date = now.toLocaleDateString([], {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
            });
            return `Current time: ${time}, Date: ${date}`;
        }

        case 'open_website': {
            let url = args.url || '';
            if (!url.startsWith('http')) {
                url = 'https://' + url;
            }

            // Open in browser
            if (window.electronAPI?.openExternal) {
                window.electronAPI.openExternal(url);
            } else {
                window.open(url, '_blank');
            }
            return `Opened ${url} in the browser.`;
        }

        case 'open_app': {
            if (window.electronAPI?.openApp) {
                window.electronAPI.openApp(args.app_name);
                return `Attempted to open application: ${args.app_name}`;
            }
            return `Could not open ${args.app_name} (must be running as desktop app).`;
        }

        case 'create_file': {
            if (window.electronAPI?.createFile) {
                window.electronAPI.createFile(args.filename, args.content);
                return `Requested to create file: ${args.filename} on the desktop.`;
            }
            return `Could not create file (must be running as desktop app).`;
        }

        case 'create_folder': {
            if (window.electronAPI?.createFolder) {
                window.electronAPI.createFolder(args.folder_name);
                return `Requested to create folder: ${args.folder_name} on the desktop.`;
            }
            return `Could not create folder (must be running as desktop app).`;
        }

        case 'search_web': {
            const query = encodeURIComponent(args.query || '');
            const searchUrl = `https://www.google.com/search?q=${query}`;

            if (window.electronAPI?.openExternal) {
                window.electronAPI.openExternal(searchUrl);
            } else {
                window.open(searchUrl, '_blank');
            }
            return `Searched the web for "${args.query}".`;
        }

        case 'set_reminder': {
            const { message, minutes } = args;
            const ms = (minutes || 1) * 60 * 1000;

            const timerId = setTimeout(() => {
                // Show notification
                if (window.electronAPI?.showNotification) {
                    window.electronAPI.showNotification('Miya Reminder', message);
                } else if ('Notification' in window && Notification.permission === 'granted') {
                    new Notification('Miya Reminder', { body: message });
                } else {
                    alert(`⏰ Reminder: ${message}`);
                }
            }, ms);

            activeReminders.push({ message, minutes, timerId, createdAt: Date.now() });
            return `Reminder set: "${message}" in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
        }

        case 'save_note': {
            // Will be handled by the caller using memoryService
            return `SAVE_NOTE:${JSON.stringify(args)}`;
        }

        case 'execute_terminal': {
            if (window.electronAPI?.executeTerminal) {
                return await window.electronAPI.executeTerminal(args.command);
            }
            return `Not available in browser mode.`;
        }

        case 'convert_file': {
            if (window.electronAPI?.convertDocxToPdf) {
                return await window.electronAPI.convertDocxToPdf(args.source_filename);
            }
            return `Not available in browser mode.`;
        }

        case 'describe_screen': {
            if (window.electronAPI?.captureScreen) {
                const imageData = await window.electronAPI.captureScreen();
                if (imageData.startsWith('Error')) return imageData;
                return `IMAGE_DATA:${imageData}`;
            }
            return `Screen capture not available.`;
        }

        case 'control_media': {
            if (window.electronAPI?.controlMedia) {
                // Ensure level is a number or omitted, never null/undefined
                const level = typeof args.level === 'number' ? args.level :
                    (args.action === 'set_volume' ? 50 : undefined);
                return await window.electronAPI.controlMedia({ action: args.action, level });
            }
            return `Media control not available in browser.`;
        }

        case 'clean_desktop': {
            if (window.electronAPI?.organizeDesktop) {
                return await window.electronAPI.organizeDesktop();
            }
            return `Desktop organization not available in browser.`;
        }

        case 'recall_memories': {
            // Will be handled by the caller using memoryService
            return `RECALL:${args.query}`;
        }

        default:
            return `Unknown command: ${name}`;
    }
}

/**
 * Request browser notification permission
 */
export function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}
