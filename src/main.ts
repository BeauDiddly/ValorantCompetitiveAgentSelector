import Cloudflare from "cloudflare";
import dotenv from 'dotenv';
import { parser } from '@lemonadejs/html-to-json';

dotenv.config();

async function extractMatchUrls(htmlContent: string): Promise<string[]> {
    const urls: string[] = [];

    // Parse match links from the VLR results page
    // VLR match URLs follow pattern: /matches/{id}/...
    const linkRegex = /href=["']\/matches\/[\d]+[^"']*["']/g;
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

async function main() {
    const client = new Cloudflare({
        apiToken: process.env["CLOUDFLARE_API_TOKEN"],
    });

    console.log("API Token:", process.env.CLOUDFLARE_API_TOKEN ? "✓ Set" : "✗ Missing");
    console.log("Account ID:", process.env.CLOUDFLARE_ACCOUNT_ID ? "✓ Set" : "✗ Missing");

    const response = await client.browserRendering.content.create({
        account_id: process.env["CLOUDFLARE_ACCOUNT_ID"]!,
        url: "https://www.vlr.gg/matches/results"
    });

    const htmlContent = response.result?.html || '';
    const matchUrls = await extractMatchUrls(htmlContent);

    console.log("\nExtracted Match URLs:");
    console.log(matchUrls);
}

main();