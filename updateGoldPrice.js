const fs = require('fs');

const TARGET_URL = 'https://www.goodreturns.in/gold-rates/bangalore.html';

// Converts raw HTML or Markdown into clean, single-line plain text
function normalizeToText(raw) {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ') // Strip all HTML tags (<span>, <td>, <strong>, etc.)
    .replace(/&#8377;|&#x20b9;|&₹|Rs\.?/gi, '₹') // Normalize rupee entities
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractPrices(cleanText) {
  let raw24k = null;
  let raw22k = null;

  // Strategy 1: Summary sentence ("stands at ₹13,964 per gram for 24 karat gold ... ₹12,800 per gram for 22 karat")
  const m24 = cleanText.match(/₹\s*([\d,]{4,7})\s*per\s*gram\s*for\s*24\s*(?:karat|carat)/i);
  const m22 = cleanText.match(/₹\s*([\d,]{4,7})\s*per\s*gram\s*for\s*22\s*(?:karat|carat)/i);
  if (m24) raw24k = m24[1];
  if (m22) raw22k = m22[1];

  // Strategy 2: Today Gold Price Per Gram in Bangalore table
  // Matches: "Gram 24K 22K 18K 1 ₹13,964 (+27) ₹12,800 (+25)"
  if (!raw24k || !raw22k) {
    const tableMatch = cleanText.match(
      /Today Gold Price Per Gram in Bangalore[\s\S]{1,150}?\b1\b\s*₹\s*([\d,]{4,7})[^₹]{1,30}?₹\s*([\d,]{4,7})/i
    );
    if (tableMatch) {
      raw24k = raw24k || tableMatch[1];
      raw22k = raw22k || tableMatch[2];
    }
  }

  // Strategy 3: Last 10 Days table first row (Today's date -> 24K -> 22K)
  if (!raw24k || !raw22k) {
    const historyMatch = cleanText.match(
      /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{2},\s+\d{4}\s*₹\s*([\d,]{4,7})[^₹]{1,30}?₹\s*([\d,]{4,7})/i
    );
    if (historyMatch) {
      raw24k = raw24k || historyMatch[1];
      raw22k = raw22k || historyMatch[2];
    }
  }

  return {
    gold24k: raw24k ? parseInt(raw24k.replace(/,/g, ''), 10) : null,
    gold22k: raw22k ? parseInt(raw22k.replace(/,/g, ''), 10) : null
  };
}

async function fetchPageText() {
  // Attempt 1: Direct fetch with full browser headers
  try {
    const res = await fetch(TARGET_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    if (res.ok) {
      const html = await res.text();
      const text = normalizeToText(html);
      const prices = extractPrices(text);
      if (prices.gold24k) {
        console.log('Extracted prices via direct fetch.');
        return prices;
      }
      console.warn('Direct fetch succeeded (HTTP 200), but price pattern not matched. Trying reader fallback...');
    } else {
      console.warn(`Direct fetch returned HTTP ${res.status}. Trying reader fallback...`);
    }
  } catch (err) {
    console.warn('Direct fetch error:', err.message);
  }

  // Attempt 2: Fallback via Jina Reader (bypasses Cloudflare blocks on GitHub Runner IPs)
  const fallbackUrl = `https://r.jina.ai/${TARGET_URL}`;
  const fallbackRes = await fetch(fallbackUrl, {
    headers: {
      'Accept': 'text/plain',
      'X-No-Cache': 'true'
    }
  });

  if (!fallbackRes.ok) {
    throw new Error(`Both direct fetch and fallback failed. Fallback HTTP status: ${fallbackRes.status}`);
  }

  const fallbackRaw = await fallbackRes.text();
  const cleanFallback = normalizeToText(fallbackRaw);
  const prices = extractPrices(cleanFallback);

  if (!prices.gold24k) {
    console.error('--- DEBUG SNIPPET (First 600 chars) ---');
    console.error(cleanFallback.slice(0, 600));
    throw new Error('Could not find 24K gold price in either direct or fallback response.');
  }

  console.log('Extracted prices via Jina Reader fallback.');
  return prices;
}

async function scrapeAndUpdate() {
  const { gold24k, gold22k } = await fetchPageText();

  // Format date in IST as "DD-MMM-YYYY" (e.g., "03-NOV-2026")
  const istDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const day = String(istDate.getDate()).padStart(2, '0');
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const formattedDate = `${day}-${months[istDate.getMonth()]}-${istDate.getFullYear()}`;

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
