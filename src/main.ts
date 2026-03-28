import Cloudflare from "cloudflare";
import * as dotenv from 'dotenv';
import { parser, render } from '@lemonadejs/html-to-json';
dotenv.config();

async function main() {
    const client = new Cloudflare({
        apiToken: process.env["CLOUDFLARE_API_TOKEN"],
    });

    console.log(process.env.CLOUDFLARE_API_TOKEN);
    console.log(process.env.CLOUDFLARE_ACCOUNT_ID);

    const content = parser(await client.browserRendering.content.create({
        account_id: process.env["CLOUDFLARE_ACCOUNT_ID"]!,
        url: "https://www.vlr.gg/matches/results"
    }));

    console.log(content);
    
}

main();