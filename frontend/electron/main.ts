import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import Store from 'electron-store';
import Os from 'os'
import http from 'http';
import { exec, execFile } from 'child_process';
// const http = require('http');
// const { exec } = require('child_process');
// const { spawn } = require('child_process');


/**
 * Determine whether the Node.js process runs on Windows.
 *
 * @returns {Boolean}
 */
function isWindows() {
  return Os.platform() === 'win32'
}

let targetProcessName = 'trilogy-studio-engine'
let servicePort = 5678;

if (isWindows()) {
  targetProcessName = `${targetProcessName}.exe`
}

function stripQuotes(str) {
  str = str.trim();
  if (str.startsWith('"') && str.endsWith('"')) {
    return str.slice(1, -1);
  } else if (str.startsWith("'") && str.endsWith("'")) {
    return str.slice(1, -1);
  }
  return str;
}



function stopBackground() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: servicePort,
      path: '/terminate',
      method: 'GET',
    };

    const req = http.request(options, (res) => {
      let data = '';

      // Receive data chunks
      res.on('data', (chunk) => {
        data += chunk;
      });

      // Process the complete response
      res.on('end', () => {
        resolve(data); // Resolve the Promise with the received data
      });
    });

    req.on('error', (error) => {
      reject(error); // Reject the Promise with the error
    });

    req.end(); // Send the HTTP request
  });
}



// helper to ensure the background process is managed
function findProcessesByName(processName): Promise<object[]> {
  return new Promise((resolve, reject) => {
    const platform = process.platform;
    let cmd;
    if (platform === 'win32') {
      cmd = `tasklist /FI "IMAGENAME eq ${processName}" /FO CSV /NH`;
    } else if (platform === 'darwin' || platform === 'linux') {
      cmd = `ps -C ${processName} -o pid=`;
    } else {
      reject(new Error(`Unsupported platform: ${platform}`));
      return;
    }

    exec(cmd, (error, stdout,) => {
      if (error) {
        console.log(error)
        if ((platform === 'darwin' || platform === 'linux') && error.code === 1 && !error.killed) {
          resolve([]);
        }
        else {
          reject(error);
          return;
        }

      }

      const output = stdout.trim();
      if (output) {
        if (platform === 'win32' && output.includes('No tasks are running which match the specified criteria.')) {
          resolve([]);
        }
        else if (platform === 'win32') {
          const lines = output.split('\n');
          const processes: object[] = [];

          for (const line of lines) {
            if (line.trim() !== '') {
              const pid = line.split(',')[1].trim();
              processes.push({ pid: stripQuotes(pid), name: processName });
            }
          }
          resolve(processes);
        }
        else {
          const pid = output.split('\n')[0].trim();
          resolve([{ pid: pid, name: processName, }]);
        }
      } else {
        resolve([]);
      }
    });
  });
}


const startBackgroundService = () => {
  // let uuid = randomUUID()
  const spath = path.join(process.env.DIST, targetProcessName)
  //const spath = path.join(app.getAppPath(), '/src/background/', `${targetProcessName}`)
  console.log(`spawning background service at ${spath}`)
  const backgroundService = execFile(spath, [], {'windowsHide': true}, (error, stdout, stderr) => {
    if (error) {
      throw error;
    }
    console.log(stdout);
    console.log(stderr)
  });

  console.log(`Background process started with pid ${backgroundService.pid}`)
  backgroundService.on('close', (code) => {
    console.log(`Background python process exited with code ${code}`);
  });
  if (backgroundService.stdout) {
    backgroundService.stdout.on('data', (data) => {
      console.log(`Child background python stdout: ${data}`);
    });
  }
  if (backgroundService.stderr) {
    backgroundService.stderr.on('data', (data) => {
      console.log(`Child background python stderr: ${data}`);
    });
  }

  backgroundService.on('error', (error) => {
    console.error(`Error occurred in background python process: ${error}, ${error.message}`);
  });

  backgroundService.on('exit', (code) => {
    console.log(`Background process ${backgroundService.pid} exited with code ${code}`);
  });


  let backgroundClosed = false;
  app.on("before-quit", async (e) => {
    if (!backgroundClosed) {
      e.preventDefault();
      await stopBackground().then(() => {
        backgroundClosed = true;
        console.log(`Background service ${backgroundService.pid} shut down, quitting`);
        app.quit();
      }).catch((err) => {
        console.log(`Background service ${backgroundService.pid} failed to shut down ${err}`);
      })

    }
  });
  return backgroundService
}

async function startBackgroundServiceSafe() {
  await findProcessesByName(targetProcessName).then((procs) => {
    if (procs.length > 0) {
      procs.map((proc) => {
        console.log(proc)
        console.log(`Background ${targetProcessName} is already running ${proc['pid']}!`)
        console.log(`Killing ${proc['pid']} and restarting`)
        process.kill(proc['pid'])

      })
    }
    else {
      console.log(`Background ${targetProcessName} is not running, starting it!`)
    }

    startBackgroundService()

  })
};

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.js
// │


// enable renders to access store
Store.initRenderer();

process.env.DIST = path.join(__dirname, '../dist')
process.env.PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, '../public')


let win: BrowserWindow | null
// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })


  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(process.env.DIST, 'index.html'))
  }
}

// app.on('window-all-closed', () => {
//   // win = null
// })

app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// app.whenReady().then(startBackgroundServiceSafe).then(createWindow)
app.whenReady().then(createWindow)
