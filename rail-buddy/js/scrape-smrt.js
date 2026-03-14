// Script to scrape train timings from LTA train map
// Scrapes www.lta.gov.sg/content/ltagov/en/map/train.html
// Users click on different stations to view timings
// Usage: node rail-buddy/js/scrape-smrt.js

const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const fs = require('fs');

(async () => {
  let browser;
  const allStationData = [];

  try {
    console.log('🚀 Starting LTA Train Map Scraper...\n');
    
    browser = await puppeteer.launch({ 
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    
    // Load the LTA train map page
    const mapUrl = 'https://www.lta.gov.sg/content/ltagov/en/map/train.html';
    console.log(`📍 Loading LTA train map: ${mapUrl}`);
    
    await page.goto(mapUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    
    // Wait for stations to load
    await page.waitForSelector('[data-station]', { timeout: 30000 }).catch(() => {
      console.log('⚠️  Could not find station elements with data-station attribute');
    });

    // Extract all available stations
    const stations = await page.evaluate(() => {
      const stationElements = document.querySelectorAll('[data-station], .station-item, [role="button"][data-name]');
      const stationList = [];
      
      stationElements.forEach((el) => {
        const stationName = el.getAttribute('data-station') || 
                           el.getAttribute('data-name') || 
                           el.textContent?.trim();
        if (stationName && stationName.length > 0) {
          stationList.push(stationName);
        }
      });
      
      // Remove duplicates
      return [...new Set(stationList)];
    });

    console.log(`\n✓ Found ${stations.length} stations\n`);

    // Scrape timing data for each station
    for (let i = 0; i < stations.length; i++) {
      const stationName = stations[i];
      console.log(`[${i + 1}/${stations.length}] Clicking station: ${stationName}...`);

      try {
        // Click on the station to load its timings
        await page.evaluate((name) => {
          const elements = Array.from(document.querySelectorAll('[data-station], .station-item, [role="button"][data-name]'));
          const element = elements.find(el => 
            (el.getAttribute('data-station') === name || 
             el.getAttribute('data-name') === name || 
             el.textContent?.trim() === name)
          );
          
          if (element) {
            element.click();
          }
        }, stationName);

        // Wait for timing data to appear
        await page.waitForTimeout(1000);

        // Extract timing information from the page
        const timingData = await page.evaluate(() => {
          const timingContainer = document.querySelector('[id*="timing"], [class*="timing"], [class*="schedule"]');
          const nextTrainInfo = document.querySelector('[id*="next"], [class*="next-train"]');
          
          if (!timingContainer && !nextTrainInfo) {
            return null;
          }

          const data = {
            next_train: null,
            directions: []
          };

          // Try to extract next train info
          if (nextTrainInfo) {
            data.next_train = nextTrainInfo.textContent?.trim();
          }

          // Extract direction-specific timings
          const directionElements = document.querySelectorAll('[id*="direction"], [class*="direction"]');
          directionElements.forEach((dir) => {
            const dirName = dir.querySelector('h3, h4, .direction-name')?.textContent?.trim();
            const timings = dir.querySelectorAll('[class*="time"], td');
            
            const times = [];
            timings.forEach(timing => {
              const text = timing.textContent?.trim();
              if (text && /\d{1,2}:\d{2}/.test(text)) {
                times.push(text);
              }
            });

            if (dirName || times.length > 0) {
              data.directions.push({
                description: dirName || 'Direction ' + (data.directions.length + 1),
                times: times
              });
            }
          });

          return data;
        });

        if (timingData) {
          allStationData.push({
            station: stationName,
            timing_data: timingData,
            scraped_at: new Date().toISOString()
          });

          console.log(`  ✓ Extracted timing data`);
        } else {
          console.log(`  ⚠️  No timing data found on page`);
        }

      } catch (error) {
        console.error(`  ✗ Error scraping ${stationName}: ${error.message}`);
      }

      // Small delay between clicks to avoid overwhelming the page
      await page.waitForTimeout(500);
    }

    await page.close();

    // Save the data
    const outputPath = __dirname + '/../json/lta-train-timings.json';
    fs.writeFileSync(outputPath, JSON.stringify(allStationData, null, 2));
    console.log(`\n✅ Saved data for ${allStationData.length} stations to ${outputPath}`);

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
  } finally {
    if (browser) await browser.close();
  }
})();
