import * as TwoCaptcha from '2captcha';
import { ethers } from 'ethers';
import { promises as fs } from 'fs';
import * as crypto from 'crypto';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';

const API_KEY =
  process.env.APIKEY_2CAPTCHA || '0b4c850a1019b2ebac8ec150fdab0fec';
const SITE_KEY = '0x4AAAAAAA-3X4Nd7hf3mNGx';
const URL = 'https://testnet.monad.xyz/';
const INTERVAL = 12 * 60 * 60 * 1000; // 12小时
const SKY_IP_TOKEN = 'l3RcoISGoDwmONcF1741101016554'; // 只保留 token 值

const solver = new TwoCaptcha.Solver(API_KEY);

// 可选特征值
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
];
const RESOLUTIONS = [
  '1920x1080',
  '1366x768',
  '1440x900',
  '2560x1440',
  '1280x720',
];
const TIMEZONES = [
  'Asia/Shanghai',
  'America/New_York',
  'Europe/London',
  'Asia/Tokyo',
];
const LANGUAGES = ['zh-CN', 'en-US', 'en-GB', 'ja-JP'];

function createProxyAgent(proxy: string | undefined) {
  if (!proxy) return undefined;

  if (proxy.startsWith('http')) {
    return new HttpsProxyAgent(proxy);
  } else if (proxy.startsWith('socks')) {
    return new SocksProxyAgent(proxy, {
      timeout: 30000,
      keepAlive: true,
      keepAliveMsecs: 1000,
      maxSockets: 256,
      maxFreeSockets: 256,
      scheduling: 'lifo',
    });
  } else {
    console.error(`代理 IP 格式不支持：${proxy}`);
    return undefined;
  }
}

async function getDynamicProxy() {
  const { default: fetch } = await import('node-fetch');
  try {
    const response = await fetch(
      `http://list.sky-ip.net/user_get_ip_list?token=${SKY_IP_TOKEN}&qty=1&country=&time=5&format=txt&protocol=http`,
      { method: 'GET' }
    );
    const proxyString = await response.text();
    console.log(proxyString, '---res---');
    // if (!proxyString || !proxyString.includes(':')) {
    //   throw new Error('无效的代理格式');
    // }
    return proxyString.trim(); // 返回类似 "http://user:pass@1.2.3.4:8080"
  } catch (e) {
    return null;
  }
}

function generateVisitorId(wallet: any, ipIndex: number): string {
  const fingerprintData = {
    userAgent: wallet.userAgent,
    screen: `${wallet.screenResolution}x${24}`,
    plugins: 'PDF Viewer,Chrome PDF Viewer,Native Client',
    timezone: wallet.timezone,
    language: wallet.language,
    webglVendor: wallet.webglVendor,
    webglRenderer: wallet.webglRenderer,
    canvasHash: wallet.canvasHash,
    timestamp: Date.now(),
    uniqueId: ipIndex,
  };

  return crypto
    .createHash('md5')
    .update(JSON.stringify(fingerprintData))
    .digest('hex');
}

async function claimTokens(wallet: any, ipIndex: number) {
  const { default: fetch } = await import('node-fetch');
  try {
    const proxyString = await getDynamicProxy();
    if (!proxyString) throw new Error('无法获取动态代理');
    console.log(proxyString, '---proxyString---');

    // const proxyParts = proxyString.match(/http:\/\/(.+):(.+)@(.+):(\d+)/);
    // if (!proxyParts) throw new Error(`代理格式解析失败: ${proxyString}`);

    // const proxy = {
    //   host: proxyParts[3],
    //   port: parseInt(proxyParts[4]),
    //   auth: {
    //     username: proxyParts[1],
    //     password: proxyParts[2],
    //   },
    // };

    const captchaResult = await solver.turnstile(SITE_KEY, URL);
    const visitorId = generateVisitorId(wallet, ipIndex);

    const response = await fetch('https://testnet.monad.xyz/api/claim', {
      method: 'POST',
      headers: {
        accept: '*/*',
        'accept-language': `${wallet.language},zh;q=0.9`,
        'cache-control': 'no-cache',
        'content-type': 'application/json',
        pragma: 'no-cache',
        priority: 'u=1, i',
        'sec-ch-ua': wallet.userAgent.split(' ')[2] || '"Chromium";v="133"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': `"${
          wallet.userAgent.includes('Macintosh')
            ? 'macOS'
            : wallet.userAgent.includes('Windows')
            ? 'Windows'
            : 'Linux'
        }"`,
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'user-agent': wallet.userAgent,
      },
      body: JSON.stringify({
        address: wallet.address,
        visitorId: visitorId,
        cloudFlareResponseToken: captchaResult.data, // 注意这里使用 data 而非 code
      }),
      agent: createProxyAgent(proxyString),
    });

    const result = await response.json();
    console.log(`地址 ${wallet.address} 领取结果:`, result);
    return result;
  } catch (e) {
    console.error(`地址 ${wallet.address} 领取失败:`, e);
    return null;
  }
}

function generateWallet(index: number) {
  const wallet = ethers.Wallet.createRandom();
  const userAgent = USER_AGENTS[index % USER_AGENTS.length];
  const screenResolution =
    RESOLUTIONS[Math.floor(Math.random() * RESOLUTIONS.length)];
  const timezone = TIMEZONES[Math.floor(Math.random() * TIMEZONES.length)];
  const language = LANGUAGES[Math.floor(Math.random() * LANGUAGES.length)];
  const webglOptions = [
    { vendor: 'Intel Inc.', renderer: 'Intel Iris OpenGL Engine' },
    {
      vendor: 'NVIDIA Corporation',
      renderer: 'NVIDIA GeForce GTX 970 OpenGL Engine',
    },
    { vendor: 'AMD', renderer: 'AMD Radeon Pro 560 OpenGL Engine' },
  ];
  const webgl = webglOptions[Math.floor(Math.random() * webglOptions.length)];
  const canvasHash = crypto.randomBytes(16).toString('hex');

  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
    userAgent,
    screenResolution,
    timezone,
    language,
    webglVendor: webgl.vendor,
    webglRenderer: webgl.renderer,
    canvasHash,
    lastClaim: 0,
  };
}

async function saveWallets(wallets: any[]) {
  await fs.writeFile('wallets.json', JSON.stringify(wallets, null, 2));
}

async function loadWallets() {
  try {
    const data = await fs.readFile('wallets.json', 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

async function unlimitedClaim() {
  let wallets = await loadWallets();

  while (wallets.length < 3000) {
    const wallet = generateWallet(wallets.length);
    wallets.push(wallet);
  }

  while (true) {
    for (let i = 0; i < 3000; i++) {
      const wallet = wallets[i];
      const now = Date.now();

      if (now - wallet.lastClaim >= INTERVAL) {
        const result: any = await claimTokens(wallet, i);

        if (result && result?.success) {
          wallet.lastClaim = now;
          await saveWallets(wallets);
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    console.log('一轮完成，等待下一次检查...');
    await new Promise((resolve) => setTimeout(resolve, 60000));
  }
}

fetch('https://api.ipify.org')
  .then((res) => res.text())
  .then((ip) => console.log('我的公网 IP:', ip))
  .catch((err) => console.error('获取 IP 失败:', err));


unlimitedClaim().catch(console.error);

