import 'dotenv/config';
import * as crypto from 'crypto';
import * as TwoCaptcha from '2captcha';
import { ethers } from 'ethers';
import { promises as fs } from 'fs';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import puppeteer from 'puppeteer';

const APIKEY_2CAPTCHA = process.env.APIKEY_2CAPTCHA || '';
const SKY_IP_TOKEN = process.env.SKY_IP_TOKEN || '';
const SITE_KEY = '0x4AAAAAAA-3X4Nd7hf3mNGx';
const URL = 'https://testnet.monad.xyz/';
const INTERVAL = 12 * 60 * 60 * 1000; // 12小时
const TARGET_ADDRESS = '0xYourTargetAddressHere'; // 替换为你的目标归集地址
const RPC_URL = 'https://testnet.monad.xyz/rpc'; // Monad Testnet RPC URL（根据实际情况替换）

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

const solver = new TwoCaptcha.Solver(APIKEY_2CAPTCHA);

function createProxyAgent(proxy: string | null) {
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

    if (!proxyString.match(/^\d+\.\d+\.\d+\.\d+:\d+$/)) {
      if (proxyString.includes('未加入白名单')) {
        throw new Error(`本地 IP 未加入 SKY-IP 白名单: ${proxyString}`);
      }
      throw new Error(`无效的代理格式: ${proxyString}`);
    }
    // return `http://${proxyString}`;
    return 'socks5://liu3:Q3TokPp46w@158.178.244.174:39466';
  } catch (e: any) {
    console.error('获取 Sky-IP 动态代理失败:', e.message);
    return null;
  }
}

function generateVisitorId(wallet: any): string {
  const screenResolution =
    RESOLUTIONS[Math.floor(Math.random() * RESOLUTIONS.length)];
  const timezone = TIMEZONES[Math.floor(Math.random() * TIMEZONES.length)];
  const language = LANGUAGES[Math.floor(Math.random() * LANGUAGES.length)];

  const fingerprintData = {
    userAgent: wallet.userAgent,
    language: language,
    screenResolution: screenResolution,
    screenDepth: 24,
    timezone: timezone,
    plugins: 'PDF Viewer,Chrome PDF Viewer,MetaMask',
    platform: 'Windows',
    randomSalt: crypto.randomBytes(8).toString('hex'),
  };

  return crypto
    .createHash('md5')
    .update(JSON.stringify(fingerprintData))
    .digest('hex');
}

async function getVercelChallenge(wallet: any, proxyString: string) {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      `--proxy-server=${proxyString}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent(wallet.userAgent);
    await page.goto('https://testnet.monad.xyz/', {
      waitUntil: 'networkidle2',
    });

    // 拦截请求，提取挑战参数
    let challengeData: { token?: string; solution?: string; version?: string } =
      {};
    page.on('request', (request) => {
      if (request.url().includes('request-challenge')) {
        challengeData = {
          token: request.headers()['x-vercel-challenge-token'],
          solution: request.headers()['x-vercel-challenge-solution'],
          version: request.headers()['x-vercel-challenge-version'],
        };
      }
    });

    // 等待挑战请求触发
    await page.waitForRequest(
      (req) => req.url().includes('request-challenge'),
      { timeout: 30000 }
    );

    await browser.close();
    if (!challengeData?.token) throw new Error('未捕获挑战参数');
    return challengeData;
  } catch (e: any) {
    await browser.close();
    throw e;
  }
}

async function claimTokens(wallet: any) {
  const { default: fetch } = await import('node-fetch');
  try {
    const proxyString = '';

    const captchaResult = await solver.turnstile(SITE_KEY, URL);
    const visitorId = generateVisitorId(wallet);
    // await getVercelChallenge(wallet, proxyString);

    await fetch('https://api.ipify.org', {
      agent: createProxyAgent(proxyString),
    })
      .then((res) => res.text())
      .then((ip) => console.log('代理IP:', ip))
      .catch((err) => console.error('获取代理IP失败:', err.message));

    const response = await fetch('https://testnet.monad.xyz/api/claim', {
      method: 'POST',
      headers: {
        accept: '*/*',
        'content-type': 'application/json',
        'user-agent': wallet.userAgent,
        referer: 'https://testnet.monad.xyz/',
        Cookie:
          '_vcrcs=1.1741254125.3600.MGQ5OGMwNjM0OGViZDQxNDE0M2JiYjY5Yjk0ZWEzYjI=.17a1e75d2090c258f1f968d435200fb0; wagmi.store={"state":{"connections":{"__type":"Map","value":[["cdc8504d7c1",{"accounts":["0xf40bA227C549CeE12218c53Cfcd108ec8fa353F5"],"chainId":1,"connector":{"id":"com.okex.wallet","name":"OKX Wallet","type":"injected","uid":"cdc8504d7c1"}}]]},"chainId":10143,"current":"cdc8504d7c1"},"version":2}',
      },
      body: JSON.stringify({
        address: wallet.address,
        visitorId: visitorId,
        cloudFlareResponseToken: captchaResult.data,
      }),
      agent: createProxyAgent(proxyString),
    });

    const result = await response;
    const { status, statusText } = result;

    if (status === 200) {
      console.log(`地址 ${wallet.address} 领取结果:`, statusText);
      return true;
    } else {
      console.log(result);
      console.log(
        `地址 ${wallet.address} 领取失败，状态: ${status} ${statusText}`
      );
      return false;
    }
  } catch (e: any) {
    console.error(`地址 ${wallet.address} 领取失败:`, e.message);
    return false;
  }
}

function generateWallet(index: number) {
  const wallet = ethers.Wallet.createRandom();
  const userAgent = USER_AGENTS[index % USER_AGENTS.length];

  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
    userAgent,
    lastClaim: 0,
    claimed: false,
  };
}

async function saveWallets(wallets: any[]) {
  await fs.writeFile('wallets.json', JSON.stringify(wallets, null, 2));
}

async function loadAndFilterWallets() {
  try {
    const data = await fs.readFile('wallets.json', 'utf8');
    const wallets = JSON.parse(data);
    const filteredWallets = wallets.filter((wallet: any) => wallet.claimed);
    console.log('正在初始化钱包....');
    await fs.writeFile(
      'wallets.json',
      JSON.stringify(filteredWallets, null, 2)
    );
    return filteredWallets;
  } catch (e) {
    console.log('未找到 wallets.json 或文件为空，初始化新数据');
    return [];
  }
}

async function unlimitedClaim() {
  let wallets = await loadAndFilterWallets();

  // 初始化 3000 个钱包
  while (wallets.length < 5) {
    const wallet = generateWallet(wallets.length);
    wallets.push(wallet);
  }
  await saveWallets(wallets);

  while (true) {
    for (let i = 0; i < 5; i++) {
      const wallet = wallets[i];
      const now = Date.now();

      if (now - wallet.lastClaim >= INTERVAL && !wallet.claimed) {
        const result: any = await claimTokens(wallet);

        if (result) {
          wallet.lastClaim = now;
          wallet.claimed = true; // 标记为已领取
          await saveWallets(wallets);
        }

        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }

    // 检查是否所有地址都已领取
    const allClaimed = wallets.every((wallet: any) => wallet.claimed);
    if (allClaimed) {
      console.log('所有地址已完成领取，开始归集...');
      // await collectFunds(wallets);
      break; // 归集完成后退出循环
    }
  }
}

unlimitedClaim().catch(console.error);
