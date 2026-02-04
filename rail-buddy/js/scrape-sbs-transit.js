// Script to scrape first & last train info from SBS Transit
// Usage: node rail-buddy/js/scrape-sbs-transit.js

const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const fs = require('fs');

(async () => {
  let browser;
  
  try {
    console.log('Scraping SBS Transit first & last train data...\n');
    
    browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    
    const url = 'https://www.sbstransit.com.sg/first-train-last-train';
    console.log(`[1/1] Fetching ${url}...`);
    
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Wait for data to load
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check if we need to interact with the page or if there are iframes
    const iframeCount = await page.evaluate(() => document.querySelectorAll('iframe').length);
    if (iframeCount > 0) {
      console.log(`  Found ${iframeCount} iframes, data might be loaded within them`);
    }
    
    const html = await page.content();
    
    // Save HTML for debugging
    fs.writeFileSync(__dirname + '/sbs-debug.html', html);
    console.log('  Saved debug HTML to sbs-debug.html');
    
    await page.close();
    
    const $ = cheerio.load(html);
    
    // Normalize time format (e.g., "5.30am" or "11:35pm" to "05:35" in 24-hour format)
    const normalizeTime = (timeStr) => {
      if (!timeStr || timeStr === '--') return '--';
      
      const lowerStr = timeStr.toLowerCase();
      const isPM = lowerStr.includes('pm');
      const isAM = lowerStr.includes('am');
      
      const cleaned = lowerStr
        .replace(/am|pm/g, '')
        .replace(/\./g, ':')
        .trim();
      
      const parts = cleaned.split(':');
      if (parts.length === 2) {
        let hour = parseInt(parts[0]);
        const minute = parts[1];
        
        // Convert to 24-hour format if AM/PM detected
        if (isPM) {
          if (hour !== 12) {
            hour += 12;
          }
        } else if (isAM) {
          if (hour === 12) {
            hour = 0;
          }
        }
        
        return `${String(hour).padStart(2, '0')}:${minute}`;
      }
      return cleaned;
    };

    // Extract LRT line data from SBS Transit into SMRT-compatible format
    const stationMap = new Map();
    let serviceCount = 0;
    
    // SBS Transit organizes data in tabs with tables for each line
    // Look for tab panes containing timing data
    const tabPanes = $('div.tab-pane');
    
    tabPanes.each((paneIdx, pane) => {
      const $pane = $(pane);
      const tabTitle = $pane.find('.tab-pane-content strong').first().text().trim();
      
      if (!tabTitle || tabTitle.length === 0) return;
      
      console.log(`\nProcessing: ${tabTitle.substring(0, 80)}`);
      
      serviceCount++;
      
      // Get all tables in this pane
      const tables = $pane.find('table');
      
      tables.each((tableIdx, table) => {
        const $table = $(table);
        const rows = $table.find('tr');
        
        // Skip if less than 3 rows (header + at least 1 data row)
        if (rows.length < 3) return;
        
        let stationCount = 0;
        let destination = tabTitle; // Default to tabTitle if no destination found
        
        // Try to extract destination from tabTitle as fallback
        const destMatch = tabTitle.match(/(?:towards|to)\s+([^\(]+)/i);
        if (destMatch) {
          destination = `To ${destMatch[1].trim()}`;
        }
        
        rows.each((rowIdx, row) => {
          const $row = $(row);
          const cells = $row.find('td');
          
          if (cells.length < 2) return;
          
          const cellTexts = cells.map((i, cell) => {
            return $(cell).text().trim().replace(/\s+/g, ' ');
          }).get();
          
          // Extract destination from "towards" row
          if (cellTexts[0].toLowerCase().includes('towards')) {
            const match = cellTexts[0].match(/towards\s+(.+)/i);
            if (match) {
              const extractedDest = match[1].trim();
              // Ensure it looks like a station name (contains station code or name)
              if (extractedDest.match(/[A-Z]{2}\d+|[A-Z]/)) {
                destination = `To ${extractedDest}`;
              }
            }
            return;
          }
          
          // Skip other header-like rows and bad data
          if (cellTexts[0].toLowerCase().includes('mondays') ||
              cellTexts[0].toLowerCase().includes('weekdays') ||
              cellTexts[0].toLowerCase().includes('saturdays') ||
              cellTexts[0].toLowerCase().includes('first trains') ||
              cellTexts[0].toLowerCase().includes('last trains') ||
              cellTexts[0].toLowerCase().includes('sundays') ||
              cellTexts[0].toLowerCase().includes('departing')) {
            return;
          }
          
          // Skip rows where times are text headers instead of actual times
          const timeValues = cellTexts.slice(1);
          if (timeValues.some(val => val?.toLowerCase().includes('first') || val?.toLowerCase().includes('last'))) {
            return;
          }
          
          // Row should have station name in first cell
          if (cellTexts[0] && cellTexts[0].match(/[A-Z\d]/)) {
            // This looks like a data row
            const stationName = cellTexts[0];
            
            // Initialize station if not exists
            if (!stationMap.has(stationName)) {
              stationMap.set(stationName, {
                station: stationName,
                station_slug: stationName.toLowerCase().replace(/\s+/g, '-'),
                directions: []
              });
            }
            
            // Build direction object based on column count
            let direction = {
              description: destination,
              first_train: {},
              last_train: {}
            };
            
            if (cellTexts.length === 4) {
              // Format: Station | First (Mon-Sat) | First (Sun/Hol) | Last (unified)
              direction.first_train = {
                monday_to_friday: normalizeTime(cellTexts[1] || '--'),
                saturday: normalizeTime(cellTexts[2] || '--'),
                sunday_public_holidays: normalizeTime(cellTexts[2] || '--'),
                eve_of_public_holidays: '--'
              };
              direction.last_train = {
                monday_to_friday: normalizeTime(cellTexts[3] || '--'),
                saturday: normalizeTime(cellTexts[3] || '--'),
                sunday_public_holidays: normalizeTime(cellTexts[3] || '--'),
                eve_of_public_holidays: '--'
              };
            } else if (cellTexts.length === 6) {
              // Format: Station | First (Weekdays) | First (Saturdays) | First (Sun/Hol) | Last (Weekdays) | Last (Weekends/Hol)
              direction.first_train = {
                monday_to_friday: normalizeTime(cellTexts[1] || '--'),
                saturday: normalizeTime(cellTexts[2] || '--'),
                sunday_public_holidays: normalizeTime(cellTexts[3] || '--'),
                eve_of_public_holidays: '--'
              };
              direction.last_train = {
                monday_to_friday: normalizeTime(cellTexts[4] || '--'),
                saturday: normalizeTime(cellTexts[5] || '--'),
                sunday_public_holidays: normalizeTime(cellTexts[5] || '--'),
                eve_of_public_holidays: '--'
              };
            } else {
              // Fallback: use available columns
              direction.first_train = {
                monday_to_friday: normalizeTime(cellTexts[1] || '--'),
                saturday: normalizeTime(cellTexts[cellTexts.length > 2 ? 2 : 1] || '--'),
                sunday_public_holidays: normalizeTime(cellTexts[cellTexts.length > 2 ? 2 : 1] || '--'),
                eve_of_public_holidays: '--'
              };
              direction.last_train = {
                monday_to_friday: normalizeTime(cellTexts[cellTexts.length - 1] || '--'),
                saturday: normalizeTime(cellTexts[cellTexts.length - 1] || '--'),
                sunday_public_holidays: normalizeTime(cellTexts[cellTexts.length - 1] || '--'),
                eve_of_public_holidays: '--'
              };
            }
            
            stationMap.get(stationName).directions.push(direction);
            stationCount++;
          }
        });
        
        if (stationCount > 0) {
          console.log(`  ✓ Found ${stationCount} stations`);
        }
      });
    });
    
    // Convert map to array and sort
    const masterData = Array.from(stationMap.values()).sort((a, b) => {
      // Extract number from station slug for better sorting
      const getNumber = (str) => {
        const match = str.match(/\d+/);
        return match ? parseInt(match[0]) : 0;
      };
      
      const numA = getNumber(a.station_slug);
      const numB = getNumber(b.station_slug);
      
      if (numA !== numB) return numA - numB;
      return a.station.localeCompare(b.station);
    });
    
    // Add scraped_at to each direction
    const timestamp = new Date().toISOString();
    masterData.forEach(station => {
      station.directions.forEach(direction => {
        direction.scraped_at = timestamp;
      });
    });
    
    // Save the data
    const outputPath = __dirname + '/../json/sbs-transit-ft-lt.json';
    fs.writeFileSync(outputPath, JSON.stringify(masterData, null, 2));
    
    console.log(`\n✓ Scraping complete!`);
    console.log(`✓ Saved to ${outputPath}`);
    console.log(`  - Total stations: ${masterData.length}`);
    const totalDirections = masterData.reduce((sum, station) => sum + station.directions.length, 0);
    console.log(`  - Total directions: ${totalDirections}`);
    console.log(`  - Scraped at: ${new Date(timestamp).toLocaleString()}`);
    
  } catch (error) {
    console.error('Fatal error:', error.message);
  } finally {
    if (browser) await browser.close();
  }
})();
