/**
 * Scrape first/last bus timings from businterchange.net
 * Fetch all bus stops from LTA API and save to JSON file
 */

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../buszy/json/first-last-bus.json');
const LTA_API_URL = 'https://bat-lta-9eb7bbf231a2.herokuapp.com/bus-stops';

async function fetchAllBusStops() {
  try {
    console.log('Fetching all bus stops from LTA API...');
    let allBusStops = [];
    let skip = 0;
    const batchSize = 500;
    let hasMore = true;

    while (hasMore) {
      const response = await axios.get(`${LTA_API_URL}?$skip=${skip}&$top=${batchSize}`, {
        timeout: 15000
      });

      const stops = response.data.value || [];
      allBusStops = allBusStops.concat(stops);
      
      console.log(`  Fetched ${stops.length} stops (total: ${allBusStops.length})`);

      if (stops.length < batchSize) {
        hasMore = false;
      } else {
        skip += batchSize;
      }
    }

    console.log(`Total bus stops to process: ${allBusStops.length}`);
    return allBusStops;
  } catch (error) {
    console.error('Error fetching bus stops:', error.message);
    return [];
  }
}

async function scrapeStopData(stopCode) {
  try {
    const url = `https://businterchange.net/sgbus/stops/busstop.php?stop=${encodeURIComponent(stopCode)}`;
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    const busServices = [];

    // Find all tables with id='routedetails'
    $('table[id="routedetails"]').each((tableIndex, table) => {
      const rows = $(table).find('tr');
      
      if (rows.length < 3) return;

      let serviceNumber = '';
      let routeName = '';
      let serviceData = {};

      rows.each((rowIndex, row) => {
        const cells = $(row).find('td');
        const cellCount = cells.length;

        if (rowIndex === 0 && cellCount >= 2) {
          serviceNumber = $(cells[0]).text().trim();
          routeName = $(cells[1]).text().trim();
        } else if (rowIndex > 1 && cellCount >= 3) {
          const dayType = $(cells[0]).text().trim();
          const firstBus = $(cells[1]).text().trim();
          const lastBus = $(cells[2]).text().trim();
          
          if (dayType && firstBus && lastBus) {
            serviceData[dayType] = { firstBus, lastBus };
          }
        }
      });

      if (serviceNumber && Object.keys(serviceData).length > 0) {
        busServices.push({
          service: serviceNumber,
          routeName: routeName,
          timings: serviceData
        });
      }
    });

    return busServices;
  } catch (error) {
    console.error(`Error scraping stop ${stopCode}:`, error.message);
    return [];
  }
}

async function main() {
  console.log('Starting bus timings scrape for all stops...\n');
  
  // Fetch all bus stops from LTA API
  const allBusStops = await fetchAllBusStops();
  
  if (allBusStops.length === 0) {
    console.error('No bus stops fetched. Aborting.');
    return;
  }

  const startTime = Date.now();
  const allData = [];
  let successCount = 0;
  let errorCount = 0;

  // Scrape each bus stop
  for (let i = 0; i < allBusStops.length; i++) {
    const stop = allBusStops[i];
    const progress = `[${i + 1}/${allBusStops.length}]`;
    
    process.stdout.write(`\r${progress} Scraping ${stop.BusStopCode}... `);
    
    const busServices = await scrapeStopData(stop.BusStopCode);
    
    if (busServices.length > 0) {
      allData.push({
        busStopCode: stop.BusStopCode,
        description: stop.Description,
        services: busServices,
        scrapedAt: new Date().toISOString()
      });
      process.stdout.write(`✓ (${busServices.length} services)\n`);
      successCount++;
    } else {
      process.stdout.write(`⚠ (no services)\n`);
      errorCount++;
    }

    // Add delay to avoid rate limiting (100ms between requests)
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Save to JSON file
  const outputDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allData, null, 2));
  
  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);
  
  console.log(`\n========================================`);
  console.log(`Scraping Complete!`);
  console.log(`Total stops processed: ${allBusStops.length}`);
  console.log(`Successful: ${successCount}`);
  console.log(`Failed/No data: ${errorCount}`);
  console.log(`Time taken: ${duration}s`);
  console.log(`Data saved to: ${OUTPUT_FILE}`);
  console.log(`Total stops in JSON: ${allData.length}`);
  console.log(`========================================`);
}

main().catch(console.error);
