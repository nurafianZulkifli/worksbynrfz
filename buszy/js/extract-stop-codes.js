const fs = require('fs');
const filePath = 'd:\\GitHub\\worksbynrfz\\buszy\\json\\StopCode.txt';
const jsonPath = 'd:\\GitHub\\worksbynrfz\\buszy\\json\\stop-codes.json';

const content = fs.readFileSync(filePath, 'utf8');
const codes = content.match(/\b\d{5}\b/g) || [];

// Save as JSON
const jsonData = { st: codes };
fs.writeFileSync(jsonPath, JSON.stringify(jsonData));

console.log(`Extracted ${codes.length} unique stop codes`);
console.log(`Saved to: ${jsonPath}`);

// node extract-stop-codes.js