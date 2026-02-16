
async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
    console.log("STARTING TEST...");
    const browserUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";
    const url = "https://www.pinterest.com/pin/844495367610860662/";

    try {
        console.log(`Fetching ${url}...`);
        const res = await fetch(url, { headers: { "User-Agent": browserUA } });
        console.log(`Main Page Status: ${res.status}`);
        const html = await res.text();
        console.log(`HTML Length: ${html.length}`);

        const oembedUrl = `https://widgets.pinterest.com/oembed.json/?url=${encodeURIComponent(url)}`;
        console.log(`Fetching oEmbed ${oembedUrl}...`);
        const oe = await fetch(oembedUrl, { headers: { "User-Agent": browserUA } });
        console.log(`oEmbed Status: ${oe.status}`);

        if (oe.ok) {
            const json = await oe.json();
            console.log("OEMBED JSON FOUND:");
            console.log(JSON.stringify(json).substring(0, 500)); // Print first 500 chars
        } else {
            console.log("oEmbed FAILED. Checking META tags in HTML...");
            const m = html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*content=["']([^"']+)["']/i);
            if (m) {
                console.log(`META IMAGE FOUND: ${m[1]}`);
            } else {
                console.log("NO META IMAGE FOUND.");
            }
        }

    } catch (e: any) {
        console.error("CRASH:", e.message);
    }
    console.log("TEST COMPLETE");
}

main();
