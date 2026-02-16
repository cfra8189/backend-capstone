
export function renderVerificationPage(success: boolean, message: string): string {
    const color = success ? "#c3f53c" : "#ef4444";
    const icon = success ? "✓" : "✗";
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Email Verification - The Box</title>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
      <style>
        * { font-family: 'JetBrains Mono', monospace; }
        body { background: #0a0a0a; color: #fff; margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
        .container { text-align: center; max-width: 400px; padding: 40px; }
        .icon { width: 80px; height: 80px; border-radius: 50%; background: ${color}; color: #000; font-size: 40px; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; }
        h1 { color: ${color}; margin-bottom: 10px; }
        p { color: #999; margin-bottom: 30px; }
        a { display: inline-block; background: ${color}; color: #000; font-weight: bold; padding: 15px 40px; text-decoration: none; border-radius: 8px; }
        a:hover { opacity: 0.9; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">${icon}</div>
        <h1>${success ? "Success!" : "Error"}</h1>
        <p>${message}</p>
        <a href="/">Go to The Box</a>
      </div>
    </body>
    </html>
  `;
}
