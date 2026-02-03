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
    
    // Extract LRT line data from SBS Transit
    const masterData = {
      operator: 'SBS Transit',
      lines: [],
      page_url: url,
      scraped_at: new Date().toISOString()
    };
    
    // SBS Transit organizes data in tabs with tables for each line
    // Look for tab panes containing timing data
    const tabPanes = $('div.tab-pane');
    
    tabPanes.each((paneIdx, pane) => {
      const $pane = $(pane);
      const tabTitle = $pane.find('.tab-pane-content strong').first().text().trim();
      
      if (!tabTitle || tabTitle.length === 0) return;
      
      console.log(`\nProcessing: ${tabTitle.substring(0, 80)}`);
      
      // Get all tables in this pane
      const tables = $pane.find('table');
      
      tables.each((tableIdx, table) => {
        const $table = $(table);
        const rows = $table.find('tr');
        
        // Skip if less than 3 rows (header + at least 1 data row)
        if (rows.length < 3) return;
        
        // Extract station/line names and timings
        const stations = [];
        
        rows.each((rowIdx, row) => {
          const $row = $(row);
          const cells = $row.find('td');
          
          if (cells.length < 2) return;
          
          const cellTexts = cells.map((i, cell) => {
            return $(cell).text().trim().replace(/\s+/g, ' ');
          }).get();
          
          // Skip header-like rows
          if (cellTexts[0].toLowerCase().includes('towards') ||
              cellTexts[0].toLowerCase().includes('mondays') ||
              cellTexts[0].toLowerCase().includes('weekdays') ||
              cellTexts[0].toLowerCase().includes('saturdays') ||
              cellTexts[0].toLowerCase().includes('first trains') ||
              cellTexts[0].toLowerCase().includes('last trains') ||
              cellTexts[0].toLowerCase().includes('sundays')) {
            return;
          }
          
          // Row should have station name in first cell
          if (cellTexts[0] && cellTexts[0].match(/[A-Z\d]/)) {
            // This looks like a data row
            const stationName = cellTexts[0];
            
            // Parse time format (e.g., "5.30am" or "11:35pm")
            const normalizeTime = (timeStr) => {
              if (!timeStr || timeStr === '--') return '--';
              return timeStr.toLowerCase()
                .replace(/am|pm/g, '')
                .replace(/\./g, ':')
                .trim();
            };
            
            // Determine structure based on number of columns
            let stationData = { name: stationName };
            
            if (cellTexts.length === 4) {
              // Format: Station | First (Mon-Sat) | First (Sun/Hol) | Last (unified)
              stationData.first_train_weekdays = normalizeTime(cellTexts[1] || '--');
              stationData.first_train_weekends = normalizeTime(cellTexts[2] || '--');
              stationData.last_train = normalizeTime(cellTexts[3] || '--');
            } else if (cellTexts.length === 6) {
              // Format: Station | First (Weekdays) | First (Saturdays) | First (Sun/Hol) | Last (Weekdays) | Last (Weekends/Hol)
              stationData.first_train_weekdays = normalizeTime(cellTexts[1] || '--');
              stationData.first_train_saturdays = normalizeTime(cellTexts[2] || '--');
              stationData.first_train_sundays = normalizeTime(cellTexts[3] || '--');
              stationData.last_train_weekdays = normalizeTime(cellTexts[4] || '--');
              stationData.last_train_weekends = normalizeTime(cellTexts[5] || '--');
            } else {
              // Fallback: use available columns
              stationData.first_train_weekdays = normalizeTime(cellTexts[1] || '--');
              if (cellTexts.length > 2) stationData.first_train_weekends = normalizeTime(cellTexts[2] || '--');
              if (cellTexts.length > 3) stationData.last_train = normalizeTime(cellTexts[cellTexts.length - 1] || '--');
            }
            
            stations.push(stationData);
          }
        });
        
        if (stations.length > 0) {
          masterData.lines.push({
            service: tabTitle,
            stations: stations
          });
          console.log(`  ✓ Found ${stations.length} stations`);
        }
      });
    });
    
    // Save the data
    const outputPath = __dirname + '/../json/sbs-transit-ft-lt.json';
    fs.writeFileSync(outputPath, JSON.stringify(masterData, null, 2));
    
    console.log(`\n✓ Scraping complete!`);
    console.log(`✓ Saved to ${outputPath}`);
    console.log(`  - Operator: ${masterData.operator}`);
    console.log(`  - Services found: ${masterData.lines.length}`);
    if (masterData.lines.length > 0) {
      const totalStations = masterData.lines.reduce((sum, line) => sum + (line.stations?.length || 0), 0);
      console.log(`  - Total stations: ${totalStations}`);
    }
    console.log(`  - Scraped at: ${new Date(masterData.scraped_at).toLocaleString()}`);
    
  } catch (error) {
    console.error('Fatal error:', error.message);
  } finally {
    if (browser) await browser.close();
  }
})();
