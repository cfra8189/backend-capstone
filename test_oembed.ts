
// global fetch is available in Node 18+

async function testUrl(url: string, userAgent: string) {
    console.log(`\n--- Testing URL: ${url} ---`);
    console.log(`Using User-Agent: ${userAgent}`);
    try {
        const initialResp = await fetch(url, { headers: { "User-Agent": userAgent }, redirect: "follow" });

        console.log(`Status: ${initialResp.status}`);
        const contentType = initialResp.headers.get("content-type");
        console.log(`Content-Type: ${contentType}`);

        if (contentType?.startsWith("image/")) {
            console.log("-> Detected as IMAGE");
        } else if (contentType?.startsWith("video/")) {
            console.log("-> Detected as VIDEO");
        } else {
            console.log("-> Detected as HTML/Other");
            if (url.includes("pinterest") || url.includes("pin.it")) {
                console.log("   (Checking Pinterest logic...)");
                // ... mock simple check
            } else {
                const text = await initialResp.text();
                console.log(`   Preview of body: ${text.substring(0, 100)}...`);
            }
        }

    } catch (e: any) {
        console.error("Error:", e.message);
    }
}

async function main() {
    const customUA = "TheBox/1.0";
    const browserUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";

    const testUrls = [
        "https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png",
        "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExYT.../giphy.gif" // need real url
    ];

    // Real URL for testing
    const realGif = "https://media.giphy.com/media/xT4uQulxzV39haRFjG/giphy.gif";

    console.log("\n=== TEST 1: Custom UA ===");
    await testUrl(realGif, customUA);

    console.log("\n=== TEST 2: Browser UA ===");
    await testUrl(realGif, browserUA);
}

main();
