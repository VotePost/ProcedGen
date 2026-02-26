const fs = require('fs');
const path = require('path');

// Remove BOM from all config files
const files = [
  'package.json', 
  'tsconfig.json', 
  'vite.config.ts',
  'postcss.config.js',
  'index.html'
];

files.forEach(file => {
  const filePath = path.join(__dirname, file);
  try {
    const buffer = fs.readFileSync(filePath);
    
    // Check for UTF-8 BOM (EF BB BF)
    if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
      const content = buffer.toString('utf8').slice(1);
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`UTF-8 BOM removed from ${file}`);
    } else if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
      console.log(`UTF-16 LE BOM found in ${file}, converting to UTF-8`);
      const content = buffer.toString('utf16le').slice(1);
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Converted ${file} from UTF-16 LE to UTF-8 without BOM`);
    } else {
      console.log(`No BOM found in ${file}`);
    }
  } catch (err) {
    console.error(`Error processing ${file}:`, err.message);
  }
});


