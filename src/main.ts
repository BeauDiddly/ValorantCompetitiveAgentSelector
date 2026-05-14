import puppeteer from 'puppeteer';
import type { Browser } from 'puppeteer';
import dotenv from 'dotenv';
import readline from 'readline';
import pLimit from 'p-limit';
import { openDb, getStoredMatchUrls, storeMatch, findMapComps } from './database.js';

dotenv.config();

async function promptForInput(question: string): Promise<string> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(question, answer => {
        rl.close();
        resolve(answer.trim());
    }));
}

async function extractMatchUrls(htmlContent: string): Promise<string[]> {
    const urls: string[] = [];
    const linkRegex = /href=["']\/(?:matches\/)?\d+[^"']*["']/g;
    const matches = htmlContent.match(linkRegex);

    if (matches) {
        matches.forEach(match => {
            const url = match.replace(/href=["'](.*?)["']/, '$1');
            if (!urls.includes(url)) {
                urls.push(`https://www.vlr.gg${url}`);
            }
        });
    }

    return urls;
}

function extractWinningMapComps(htmlContent: string, targetMap?: string): Array<{ map: string; agents: string[] }> {
    const gameBlocks = htmlContent.split(/<div class="vm-stats-game\b[^>]*>/).slice(1);
    const targetLower = targetMap?.trim().toLowerCase();
    const results: Array<{ map: string; agents: string[] }> = [];

    for (const block of gameBlocks) {
        const mapMatch = block.match(/<div class="map">[\s\S]*?<span style="position: relative;">\s*([^<]+?)(?:\s*<span|\s*<\/span>)/i);
        const map = mapMatch?.[1]?.trim() ?? 'Unknown';
        if (map === 'Unknown') continue;
        if (targetLower && map.toLowerCase() !== targetLower) continue;

        const leftHasWin = /<div class="team(?: mod-left)?">[\s\S]*?<div class="score[^>]*mod-win[^>]*>/i.test(block);
        const rightHasWin = /<div class="team mod-right">[\s\S]*?<div class="score[^>]*mod-win[^>]*>/i.test(block);

        let winnerSide: 'left' | 'right' = 'left';
        if (leftHasWin && !rightHasWin) {
            winnerSide = 'left';
        } else if (rightHasWin) {
            winnerSide = 'right';
        } else {
            const leftScoreMatch = block.match(/<div class="team(?: mod-left)?">[\s\S]*?<div class="score[^>]*>(\d+)/i);
            const rightScoreMatch = block.match(/<div class="team mod-right">[\s\S]*?<div class="score[^>]*>(\d+)/i);
            const leftScore = leftScoreMatch ? Number(leftScoreMatch[1]) : NaN;
            const rightScore = rightScoreMatch ? Number(rightScoreMatch[1]) : NaN;
            if (!isNaN(leftScore) && !isNaN(rightScore)) {
                winnerSide = leftScore >= rightScore ? 'left' : 'right';
            }
        }

        const agentTitles = Array.from(block.matchAll(/<span class="stats-sq mod-agent small"><img[^>]*title="([^"]+)"/gi), match => match[1] ?? '').filter(Boolean);
        const relevantTitles = agentTitles.slice(0, 10);
        const leftAgents = relevantTitles.slice(0, 5);
        const rightAgents = relevantTitles.slice(5, 10);
        const agents = winnerSide === 'right' ? rightAgents : leftAgents;

        if (agents.length > 0) {
            results.push({ map, agents });
            if (targetLower) break;
        }
    }

    return results;
}

async function fetchMatchHtml(url: string, browser: Browser): Promise<string> {
    const page = await browser.newPage();
    try {
        await page.goto(url, { waitUntil: 'networkidle2' });
        return await page.content();
    } finally {
        await page.close();
    }
}

async function main() {
    const db = openDb();
    const browser = await puppeteer.launch({ headless: true });

    try {
        console.log("Fetching match results page...");
        const resultsHtml = await fetchMatchHtml("https://www.vlr.gg/matches/results", browser);
        const matchUrls = await extractMatchUrls(resultsHtml);

        const storedUrls = getStoredMatchUrls(db);
        const newUrls = matchUrls.filter(url => !storedUrls.has(url));

        if (newUrls.length > 0) {
            console.log(`Caching ${newUrls.length} new matches (${storedUrls.size} already stored)...`);
            const limit = pLimit(3);
            await Promise.all(newUrls.map(url => limit(async () => {
                console.log(`  Fetching: ${url}`);
                const html = await fetchMatchHtml(url, browser);
                const comps = extractWinningMapComps(html);
                storeMatch(db, url, comps);
            })));
            console.log("Done caching.");
        } else {
            console.log(`All ${storedUrls.size} matches already cached.`);
        }

        const targetMap = process.argv[2] ? process.argv[2].trim() : await promptForInput('\nEnter map name: ');
        if (!targetMap) {
            console.error('No map name provided.');
            return;
        }

        console.log(`\nSearching database for map: ${targetMap}`);
        const results = findMapComps(db, targetMap);

        if (results.length > 0) {
            console.log(JSON.stringify(results, null, 2));
        } else {
            console.log(`No map named "${targetMap}" found in cached data.`);
        }
    } finally {
        await browser.close();
        db.close();
    }
}

main();
