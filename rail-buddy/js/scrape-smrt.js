// Script to scrape first & last train info for all SMRT stations
// Usage: node rail-buddy/js/scrape-all-stations.js

const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const fs = require('fs');

// List of common SMRT stations (can be expanded)
// const stations = [
//   'admiralty', 'aljunied', 'ang-mo-kio', 'bartley', 'bedok', 'bencoolen',
//   'bishan', 'boon-keng', 'boon-lay', 'botanic-gardens', 'braddell', 'buangkok',
//   'bukit-batok', 'bukit-gombak', 'bukit-merah', 'bukit-panjang', 'caldecott',
//   'cashew', 'cecilia', 'changi', 'changi-airport', 'charing-cross', 'cheng-lim',
//   'chia-keng', 'chick-island', 'china-square', 'chinese-garden', 'clementi',
//   'clementi-industrial', 'collyer-quay', 'commonwealth', 'concert-hall', 'coney-island',
//   'cp-residential', 'cumberland', 'daito', 'dhoby-ghaut', 'docker', 'dover',
//   'east-coast', 'eunos', 'eu-tong-sen', 'expo', 'farrer-park', 'farrer-road',
//   'fengshan', 'gek-poh', 'geylang-bahru', 'geylang-lorong-35', 'gibb-street',
//   'goodwood-park', 'grange-park', 'great-world', 'green-ridge', 'henderson',
//   'heng-fai-road', 'hillview', 'holland-village', 'hong-leong-garden', 'hougang',
//   'hung-hom', 'iao-ang-keng', 'iba', 'jalan-besar', 'joo-koon', 'jorong',
//   'jurong-east', 'jurong-port', 'jurong-west', 'kampong-ampat', 'kampung-melayu',
//   'kandang-kerbau', 'kent-ridge', 'keppel', 'kinabalu', 'kle-engineering',
//   'kovan', 'kranji', 'kuala-lumpur', 'labrador-park', 'lakeside', 'lao-ban-seng',
//   'leng-kee', 'leon-road', 'leong-ming-road', 'limau-road', 'lloyd-road',
//   'lornie', 'loyang', 'loyang-industrial', 'lukang-road', 'lumiére', 'lusi-keng',
//   'ma-liu-shui', 'macpherson', 'mahon-road', 'malay-village', 'mandai', 'marina-bay',
//   'marina-centre', 'marina-south', 'marina-south-pier', 'marsiling', 'mattar',
//   'maxwell-road', 'mayflower', 'mc-donald-house', 'meek-road', 'mei-ling-street',
//   'mei-teck', 'meng-boon-road', 'mengembembang-island', 'merchant-road', 'merdeka-bridge',
//   'mereka-road', 'middle-point-road', 'middle-road', 'midview-tower', 'mingde-plaza',
//   'mitre-hotel', 'moberly-road', 'model-road', 'mohawk-road', 'mohan-garden',
//   'monarch-point', 'monmouth-road', 'montfort-drive', 'montt-road', 'moore-road',
//   'moorish-gardens', 'mopsy-lane', 'mornington-crescent', 'mornington-road', 'morses-road',
//   'morton-terrace', 'mossbank', 'mosses-road', 'moth-lane', 'mother-teresa-road',
//   'mountain-avenue', 'mountain-view', 'mountainview', 'mousehole', 'mousley-lane',
//   'mowbray-avenue', 'mowbray-road', 'moyne-avenue', 'moyne-road', 'mrzdn-street',
//   'mt-alvernia', 'mt-faber', 'mt-vernon', 'muchuan-road', 'mugnet-road',
//   'muir-road', 'mulberry-link', 'mulberry-street', 'mulberrybank', 'mule-lane',
//   'mulion-avenue', 'muller-avenue', 'mullikin-avenue', 'muls-road', 'multiview',
//   'multply-road', 'multon-lane', 'multon-road', 'munaroh-road', 'mundane-avenue',
//   'mundia-park', 'mundis-road', 'munga-road', 'mungo-avenue', 'muniadi-road',
//   'munion-lane', 'munroa', 'munro-avenue', 'munro-lane', 'munro-road',
//   'munson-avenue', 'munson-lane', 'munson-road', 'muntri-road', 'muntz-avenue'
// ];

// Keep it short for now - test with common stations
const testStations = [
  'jurong-east', 'bukit-batok', 'bukit-gombak', 'choa-chu-kang', 'yew-tee', 'kranji', 'marsiling',
  'woodlands', 'admiralty', 'sembawang', 'canberra', 'yishun', 'khatib', 'yio-chu-kang', 'ang-mo-kio',
  'bishan', 'braddell', 'toa-payoh', 'novena', 'newton', 'orchard', 'somerset', 'dhoby-ghaut', 'city-hall',
  'raffles-place', 'marina-bay', 'marina-south-pier', 'pasir-ris', 'tampines', 'simei', 'tanah-merah',
  'bedok', 'kembangan', 'eunos', 'paya-lebar', 'aljunied', 'kallang', 'lavender', 'bugis', 'city-hall',
  'raffles-place', 'tanjong-pagar', 'outram-park', 'tiong-bahru', 'redhill', 'queenstown', 'commonwealth',
  'buona-vista', 'dover', 'clementi', 'jurong-west', 'boon-lay', 'pioneer', 'joo-koon', 'gul-circle', 'tuas-crescent',
  'tuas-west-road', 'tuas-link'
];

(async () => {
  let browser;
  const allStationData = [];

  try {
    browser = await puppeteer.launch({ headless: 'new' });

    for (let i = 0; i < testStations.length; i++) {
      const stationSlug = testStations[i];
      console.log(`\n[${i + 1}/${testStations.length}] Scraping ${stationSlug}...`);

      try {
        const page = await browser.newPage();
        const url = `https://journey.smrt.com.sg/journey/station_info/${stationSlug}/first-and-last-train/`;

        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        const html = await page.content();
        await page.close();

        const $ = cheerio.load(html);

        // Get station name from the page
        const stationName = $('h1#txtStationName').text().trim() || stationSlug;

        // Extract first/last train data
        const directions = [];
        const containers = $('div.divTimesDescContainer');

        containers.each((idx, container) => {
          const $container = $(container);
          const header = $container.find('div#divTimeHeader').text().trim();

          // Skip empty headers
          if (!header || header.length === 0) {
            return;
          }

          const table = $container.find('table');
          if (table.length === 0) return;

          const directionData = {
            description: header,
            first_train: {},
            last_train: {}
          };

          const rows = table.find('tbody tr');
          rows.each((rowIdx, row) => {
            if (rowIdx === 0) return; // Skip header

            const $row = $(row);
            const cells = $row.find('td');
            if (cells.length >= 3) {
              const dayLabel = $(cells[0]).text().trim();
              const firstTime = $(cells[1]).text().trim().replace(/--:--/g, '--');
              const lastTime = $(cells[2]).text().trim().replace(/--:--/g, '--');

              let dayKey = null;
              if (dayLabel.includes('Eve')) {
                dayKey = 'eve_of_public_holidays';
              } else if (dayLabel.includes('Monday') && dayLabel.includes('Friday')) {
                dayKey = 'monday_to_friday';
              } else if (dayLabel.includes('Saturday')) {
                dayKey = 'saturday';
              } else if (dayLabel.includes('Sunday') || dayLabel.includes('Public')) {
                dayKey = 'sunday_public_holidays';
              }

              if (dayKey) {
                directionData.first_train[dayKey] = firstTime;
                directionData.last_train[dayKey] = lastTime;
              }
            }
          });

          if (Object.keys(directionData.first_train).length > 0) {
            directions.push(directionData);
          }
        });

        allStationData.push({
          station: stationName,
          station_slug: stationSlug,
          directions: directions,
          scraped_at: new Date().toISOString()
        });

        console.log(`  ✓ Found ${directions.length} directions`);

      } catch (error) {
        console.error(`  ✗ Error scraping ${stationSlug}: ${error.message}`);
      }
    }

    // Save the data
    const outputPath = __dirname + '/../json/smrt-ft-lt.json';
    fs.writeFileSync(outputPath, JSON.stringify(allStationData, null, 2));
    console.log(`\n✓ Saved data for ${allStationData.length} stations to ${outputPath}`);

  } catch (error) {
    console.error('Fatal error:', error.message);
  } finally {
    if (browser) await browser.close();
  }
})();
