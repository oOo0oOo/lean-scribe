// ONLY DEVELOPMENT: Copy all files (except .env) in the example_scribe_folder to the scribe folder
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const sourceDir = path.join(__dirname, '..', 'example_scribe_folder');
const targetFolder = path.join(os.homedir(), 'scribe');

async function copyFiles() {
  let files;
  
  try {
    files = await fs.readdir(sourceDir);
  } catch (err) {
    console.error(`Error reading directory ${sourceDir}: ${err.message}`);
    return;
  }

  for (const file of files) {
    if (file === '.env') {
        continue;
    }
    const sourcePath = path.join(sourceDir, file);
    const destPath = path.join(targetFolder, file);
    
    try {
      await fs.copyFile(sourcePath, destPath);
    } catch (err) {
      console.error(`Error copying ${sourcePath} to ${destPath}: ${err.message}`);
    }
  }
}

copyFiles();