const fs = require('fs');

async function scrapeAndUpdate() {
  const url = 'https://www.goodreturns.in/gold-rates/bangalore.html';

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Goodreturns page. HTTP status: ${response.status}`);
  }

  const html = await response.text();

  // Pattern 1: Match Goodreturns summary sentence ("₹13,964 per gram for 24 karat gold")
  const match24k = html.match(/₹\s*([\d,]+)\s*per gram for 24 karat gold/i);
  const match22k = html.match(/₹\s*([\d,]+)\s*per gram for 22 karat gold/i);

  // Pattern 2 (Fallback): Match the 1-gram row in the HTML tables
  const table24k = html.match(/24 Carat Gold Rate[\s\S]*?<td>\s*1\s*<\/td>\s*<td>\s*₹?\s*([\d,]+)/i);
  const table22k = html.match(/22 Carat Gold Rate[\s\S]*?<td>\s*1\s*<\/td>\s*<td>\s*₹?\s*([\d,]+)/i);

  const raw24k = match24k ? match24k[1] : (table24k ? table24k[1] : null);
  const raw22k = match22k ? match22k[1] : (table22k ? table22k[1] : null);

  if (!raw24k) {
    throw new Error('Could not find 24K gold price in the HTML response.');
  }

  const gold24k = parseInt(raw24k.replace(/,/g, ''), 10);
  const gold22k = raw22k ? parseInt(raw22k.replace(/,/g, ''), 10) : null;

  // Format current date in IST as "DD-MMM-YYYY" (e.g., "03-NOV-2026") to match your existing JSON
  const istDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const day = String(istDate.getDate()).padStart(2, '0');
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const month = months[istDate.getMonth()];
  const year = istDate.getFullYear();
  const formattedDate = `${day}-${month}-${year}`;

  const updatedData = {
    lastUpdated: formattedDate,
    gold24k: gold24k,
    ...(gold22k && { gold22k: gold22k }),
    updateMessage: 'New Price'
  };

  fs.writeFileSync('goldPrice.json', JSON.stringify(updatedData, null, 2) + '\n');
  console.log('Successfully updated goldPrice.json:', updatedData);
}

scrapeAndUpdate();
