// ONLY DEVELOPMENT: Copy all files (except .env) in the default_scribe_folder to the scribe folder
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const sourceDir = path.join(__dirname, '..', 'default_scribe_folder');
const targetDir = path.join(os.homedir(), 'scribe');

async function copyFiles(srcDir, destDir) {
  let entries;
  
  try {
    entries = await fs.readdir(srcDir, { withFileTypes: true });
  } catch (err) {
    console.error(`Error reading directory ${srcDir}: ${err.message}`);
    return;
  }

  await fs.mkdir(destDir, { recursive: true });

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      await copyFiles(srcPath, destPath);
    } else if (entry.isFile() && entry.name !== '.env') {
      try {
        await fs.copyFile(srcPath, destPath);
      } catch (err) {
        console.error(`Error copying ${srcPath} to ${destPath}: ${err.message}`);
      }
    }
  }
}

copyFiles(sourceDir, targetDir);