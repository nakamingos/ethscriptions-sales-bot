import { Injectable } from '@nestjs/common';
import { Scraper } from '@mbcse/agent-twitter-client';

import { NotificationMessage } from '@/models/notification';

import dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';

/**
 * Service for interacting with Twitter to send tweets and manage authentication
 */
@Injectable()
export class TwitterService {
  private static fetchPatched = false;
  
  /** Twitter scraper instance for API interactions */
  private scraper: Scraper;
  private activeAccount?: string;
  private sendQueue: Promise<void> = Promise.resolve();
  private nextPostNotBefore = 0;
  
  constructor() {
    this.patchGlobalFetch();
    this.scraper = new Scraper();
  }

  private patchGlobalFetch(): void {
    if (TwitterService.fetchPatched) {
      return;
    }

    const originalFetch = globalThis.fetch?.bind(globalThis);
    if (!originalFetch) {
      return;
    }

    globalThis.fetch = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      const url = this.getRequestUrl(input);
      const headers = new Headers(
        init?.headers ??
          (input instanceof Request ? input.headers : undefined),
      );

      if (this.isTwitterRequest(url)) {
        this.applyTwitterHeaders(headers);
      }

      return originalFetch(input, { ...init, headers });
    }) as typeof fetch;

    TwitterService.fetchPatched = true;
  }

  private getRequestUrl(input: string | URL | Request): string {
    if (typeof input === 'string') {
      return input;
    }

    if (input instanceof URL) {
      return input.toString();
    }

    return input.url;
  }

  private isTwitterRequest(url: string): boolean {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      return (
        hostname === 'x.com' ||
        hostname.endsWith('.x.com') ||
        hostname === 'twitter.com' ||
        hostname.endsWith('.twitter.com') ||
        hostname === 'api.twitter.com' ||
        hostname === 'upload.twitter.com'
      );
    } catch {
      return false;
    }
  }

  private applyTwitterHeaders(headers: Headers): void {
    if (!headers.has('user-agent')) {
      headers.set(
        'user-agent',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      );
    }

    if (!headers.has('accept')) {
      headers.set('accept', '*/*');
    }

    if (!headers.has('accept-language')) {
      headers.set('accept-language', 'en-US,en;q=0.9');
    }

    if (!headers.has('origin')) {
      headers.set('origin', 'https://x.com');
    }

    if (!headers.has('referer')) {
      headers.set('referer', 'https://x.com/');
    }

    if (!headers.has('sec-ch-ua')) {
      headers.set(
        'sec-ch-ua',
        '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      );
    }

    if (!headers.has('sec-ch-ua-mobile')) {
      headers.set('sec-ch-ua-mobile', '?0');
    }

    if (!headers.has('sec-ch-ua-platform')) {
      headers.set('sec-ch-ua-platform', '"Windows"');
    }

    if (!headers.has('sec-fetch-dest')) {
      headers.set('sec-fetch-dest', 'empty');
    }

    if (!headers.has('sec-fetch-mode')) {
      headers.set('sec-fetch-mode', 'cors');
    }

    if (!headers.has('sec-fetch-site')) {
      headers.set('sec-fetch-site', 'same-site');
    }
  }

  /**
   * Initializes Twitter service for a specific account by loading cookies or performing fresh login
   * @param twitterAccount The account to initialize
   */
  private async initializeForAccount(twitterAccount: string): Promise<void> {
    const accountCookiesPath = path.join(process.cwd(), `${twitterAccount}-cookies.json`);
    
    try {
      if (this.activeAccount !== twitterAccount) {
        this.scraper = new Scraper();
        this.activeAccount = twitterAccount;
      }

      if (await this.loadCookiesFromEnv(twitterAccount)) {
        await this.saveCookies(accountCookiesPath);
        return;
      }

      if (await this.loadCookies(accountCookiesPath)) {
        return;
      }

      console.log(`Performing fresh login for ${twitterAccount}...`);
      await this.scraper.login(
        process.env[`${twitterAccount}_USERNAME`],
        process.env[`${twitterAccount}_PASSWORD`],
        process.env[`${twitterAccount}_EMAIL`],
        process.env[`${twitterAccount}_TWO_FACTOR_SECRET`]
      );

      // Save the new cookies for the specific account
      await this.saveCookies(accountCookiesPath);
      console.log(`Successfully logged into ${twitterAccount}`);
    } catch (error) {
      console.error(`Failed to initialize Twitter service for ${twitterAccount}:`, error);
      throw this.normalizeInitializationError(twitterAccount, error);
    }
  }

  /**
   * Loads saved cookies from file and sets them in the scraper
   * @param accountCookiesPath Path to account-specific cookies file
   * @returns True if cookies were successfully loaded, false otherwise
   */
  private async loadCookies(accountCookiesPath: string): Promise<boolean> {
    try {
      if (fs.existsSync(accountCookiesPath)) {
        const cookiesJson = fs.readFileSync(accountCookiesPath, 'utf8');
        return await this.trySetCookies(JSON.parse(cookiesJson));
      }
    } catch (error) {
      console.error('Error loading cookies:', error);
      return false;
    }
    return false;
  }

  private async loadCookiesFromEnv(twitterAccount: string): Promise<boolean> {
    const keys = [
      `${twitterAccount}_COOKIES_BASE64`,
      `${twitterAccount}_COOKIES_JSON`,
      'TWITTER_COOKIES_BASE64',
      'TWITTER_COOKIES_JSON',
    ];

    for (const key of keys) {
      const value = process.env[key];
      if (!value) {
        continue;
      }

      try {
        const decoded =
          key.endsWith('_BASE64')
            ? Buffer.from(value, 'base64').toString('utf8')
            : value;
        const parsed = JSON.parse(decoded);
        const loaded = await this.trySetCookies(parsed);
        if (loaded) {
          console.log(`Loaded Twitter cookies from ${key}`);
          return true;
        }
      } catch (error) {
        console.error(`Error loading cookies from ${key}:`, error);
      }
    }

    return false;
  }

  private async trySetCookies(cookiesArray: any[]): Promise<boolean> {
    if (!Array.isArray(cookiesArray) || !cookiesArray.length) {
      return false;
    }

    await this.scraper.setCookies([]);

    const auth = (this.scraper as any).auth;
    const jar = auth?.cookieJar?.();
    if (!jar) {
      return false;
    }

    for (const cookie of cookiesArray) {
      for (const variant of this.getCookieVariants(cookie)) {
        await jar.setCookie(variant.cookie, variant.url, { ignoreError: true });
      }
    }

    const loggedIn = await this.scraper.isLoggedIn();
    if (!loggedIn) {
      return false;
    }

    try {
      const profile = await this.scraper.me();
      if (profile?.username) {
        console.log(`Authenticated Twitter session for @${profile.username}`);
      }
    } catch {
      // Ignore profile lookup errors after successful auth verification
    }

    return true;
  }

  private getCookieVariants(cookie: any): Array<{ cookie: string; url: string }> {
    const domains = this.getCookieDomains(cookie.domain);
    const variants: Array<{ cookie: string; url: string }> = [];

    for (const domain of domains) {
      const formattedCookie = this.formatCookie({
        ...cookie,
        domain,
      });

      if (!formattedCookie) {
        continue;
      }

      variants.push({
        cookie: formattedCookie,
        url: domain.includes('x.com') ? 'https://x.com' : 'https://twitter.com',
      });
    }

    return variants;
  }

  private getCookieDomains(domain: unknown): string[] {
    if (typeof domain !== 'string' || !domain.length) {
      return ['.x.com', '.twitter.com'];
    }

    const normalized = domain.replace(/^\./, '').toLowerCase();

    if (normalized === 'x.com') {
      return ['.x.com', '.twitter.com'];
    }

    if (normalized === 'twitter.com') {
      return ['.twitter.com', '.x.com'];
    }

    return [domain];
  }

  private formatCookie(cookie: any): string | null {
    const key = cookie.key || cookie.name;
    const value = cookie.value;

    if (!key || typeof value !== 'string') {
      return null;
    }

    const parts = [`${key}=${value}`];

    if (cookie.domain) {
      parts.push(`Domain=${cookie.domain}`);
    }

    parts.push(`Path=${cookie.path || '/'}`);

    if (cookie.secure) {
      parts.push('Secure');
    }

    if (cookie.httpOnly) {
      parts.push('HttpOnly');
    }

    const expires = this.getCookieExpiry(cookie);
    if (expires) {
      parts.push(`Expires=${expires}`);
    }

    const sameSite = this.normalizeSameSite(cookie.sameSite);
    if (sameSite) {
      parts.push(`SameSite=${sameSite}`);
    }

    return parts.join('; ');
  }

  private getCookieExpiry(cookie: any): string | null {
    if (cookie.session) {
      return null;
    }

    if (cookie.expires) {
      return new Date(cookie.expires).toUTCString();
    }

    if (cookie.expirationDate) {
      return new Date(cookie.expirationDate * 1000).toUTCString();
    }

    return null;
  }

  private normalizeSameSite(value: unknown): string | null {
    if (typeof value !== 'string' || !value.length) {
      return null;
    }

    switch (value.toLowerCase()) {
      case 'no_restriction':
      case 'none':
        return 'None';
      case 'lax':
        return 'Lax';
      case 'strict':
        return 'Strict';
      default:
        return null;
    }
  }

  private normalizeInitializationError(
    twitterAccount: string,
    error: unknown,
  ): Error {
    const message = this.stringifyError(error);

    if (/cloudflare|cf-ray|you have been blocked/i.test(message)) {
      return new Error(
        `Cloudflare blocked the automated Twitter login flow for ${twitterAccount}. Refresh ${twitterAccount}-cookies.json from a real browser session or provide ${twitterAccount}_COOKIES_BASE64 / ${twitterAccount}_COOKIES_JSON.`,
      );
    }

    return error instanceof Error ? error : new Error(message);
  }

  private stringifyError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    if (typeof error === 'string') {
      return error;
    }

    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  private buildTweetText(data: NotificationMessage): string {
    const { title, message, link } = data;
    return `${title}\n\n${message}\n\n${link}`;
  }

  private getMediaType(filename: string): string {
    const extension = path.extname(filename).replace('.', '').toLowerCase();
    return `image/${extension || 'png'}`;
  }

  private async assertSuccessfulTweetResponse(response: Response): Promise<void> {
    if (response.ok) {
      return;
    }

    throw new Error(await response.text());
  }

  private getPostIntervalMs(): number {
    return Math.max(0, Number(process.env.POST_INTERVAL_MS || 0));
  }

  private isAccountDisabled(twitterAccount: string): boolean {
    const disabledAccounts = (process.env.DISABLED_TWITTER_ACCOUNTS || '')
      .split(',')
      .map((account) => account.trim())
      .filter(Boolean);

    return disabledAccounts.includes(twitterAccount);
  }

  private getPostIntervalJitterMs(): number {
    const configured = process.env.POST_INTERVAL_JITTER_MS;
    if (configured != null && configured !== '') {
      return Math.max(0, Number(configured));
    }

    const interval = this.getPostIntervalMs();
    if (!interval) {
      return 0;
    }

    return Math.round(interval * 0.2);
  }

  private getQueuedDelayMs(): number {
    const interval = this.getPostIntervalMs();
    const jitter = this.getPostIntervalJitterMs();
    if (!interval && !jitter) {
      return 0;
    }

    const spread = jitter ? Math.floor(Math.random() * ((jitter * 2) + 1)) - jitter : 0;
    return Math.max(0, interval + spread);
  }

  private async waitForPostWindow(): Promise<void> {
    const waitMs = this.nextPostNotBefore - Date.now();
    if (waitMs <= 0) {
      return;
    }

    console.log(`Waiting ${waitMs}ms before next post...`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  private enqueueSend(task: () => Promise<void>): Promise<void> {
    const queuedTask = this.sendQueue.then(async () => {
      await this.waitForPostWindow();

      try {
        await task();
      } finally {
        const delayMs = this.getQueuedDelayMs();
        this.nextPostNotBefore = Date.now() + delayMs;
      }
    });

    this.sendQueue = queuedTask.catch(() => undefined);
    return queuedTask;
  }

  private async sendTweetNow(
    data: NotificationMessage,
    twitterAccount: string,
  ): Promise<void> {
    if (this.isAccountDisabled(twitterAccount)) {
      console.log(`Twitter posting disabled for ${twitterAccount}, skipping post.`);
      return;
    }

    // Skip Twitter if it's disabled (TWITTER_ENABLED=0)
    if (!Number(process.env.TWITTER_ENABLED)) {
      console.log("Twitter is disabled (TWITTER_ENABLED=0), skipping tweet and saving image locally instead.");
      return;  // Skip the Twitter posting logic
    }

    try {
      // If Twitter is enabled, proceed with the tweet logic
      await this.initializeForAccount(twitterAccount);

      const accountCookiesPath = path.join(process.cwd(), `${twitterAccount}-cookies.json`);
      const tweetText = this.buildTweetText(data);
      const { imageBuffer, filename } = data;

      try {
        const response = await this.scraper.sendTweet(
          tweetText,
          undefined,
          imageBuffer?.length
            ? [{ data: imageBuffer, mediaType: this.getMediaType(filename) }]
            : undefined,
        );
        await this.assertSuccessfulTweetResponse(response);
      } catch (error) {
        if (imageBuffer?.length && Number(process.env.TWITTER_TEXT_ONLY_FALLBACK)) {
          console.warn('Tweet with media failed, retrying without media:', this.stringifyError(error));
          const response = await this.scraper.sendTweet(tweetText);
          await this.assertSuccessfulTweetResponse(response);
        } else {
          throw error;
        }
      }

      await this.saveCookies(accountCookiesPath);
    } catch (error) {
      console.error('Failed to send tweet:', error);
      throw error;
    }
  }

  /**
   * Saves current session cookies to file for a specific account
   * Only saves if essential authentication cookies are present
   * @param accountCookiesPath Path to account-specific cookies file
   */
  private async saveCookies(accountCookiesPath: string): Promise<void> {
    try {
      const cookies = await this.scraper.getCookies();
      fs.writeFileSync(accountCookiesPath, JSON.stringify(cookies, null, 2));
      console.log('Successfully saved session cookies');
    } catch (error) {
      console.error('Error saving cookies:', error);
    }
  }

  /**
   * Sends a tweet with optional image attachment from a specific Twitter account
   * If TWITTER_ENABLED is 0, skips the posting and focuses on image saving
   * @param data The tweet content and data
   * @param twitterAccount The Twitter account to send the tweet from
   * @param options Pacing options for queued historical backfills
   * @throws Error if tweet fails to send
   */
  async sendTweet(
    data: NotificationMessage,
    twitterAccount: string,
    options?: { paced?: boolean },
  ): Promise<void> {
    if (options?.paced) {
      return await this.enqueueSend(() => this.sendTweetNow(data, twitterAccount));
    }

    return await this.sendTweetNow(data, twitterAccount);
  }
}
