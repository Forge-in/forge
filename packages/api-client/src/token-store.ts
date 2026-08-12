/**
 * Where a client keeps its tokens.
 *
 * An interface rather than an implementation because the right answer differs per platform,
 * and getting it wrong is a security bug rather than an inconvenience:
 *
 *   - Web goes through a BFF route handler and keeps the tokens in an httpOnly cookie, so
 *     they are unreachable from JavaScript and therefore from XSS. The browser client holds
 *     nothing at all.
 *   - React Native uses expo-secure-store (Keychain / Keystore), not AsyncStorage —
 *     AsyncStorage is plain unencrypted files, readable on a rooted device or from a backup.
 */
export interface TokenStore {
  getAccessToken(): Promise<string | undefined>;
  getRefreshToken(): Promise<string | undefined>;
  setTokens(tokens: { accessToken: string; refreshToken: string }): Promise<void>;
  clear(): Promise<void>;
}

/**
 * For the BFF path, where the browser has no tokens: the cookie travels automatically and
 * the route handler attaches the bearer server-side.
 *
 * Returning undefined is correct, not a stub. It is what makes the same client code work in
 * a browser with no access to its own credentials.
 */
export const cookieTokenStore: TokenStore = {
  getAccessToken: () => Promise.resolve(undefined),
  getRefreshToken: () => Promise.resolve(undefined),
  setTokens: () => Promise.resolve(),
  clear: () => Promise.resolve(),
};

/**
 * In-memory store, for tests and for a server-side script.
 *
 * Never for a real client: it dies with the process, so every app restart would force a
 * fresh sign-in.
 */
export function memoryTokenStore(initial?: {
  accessToken: string;
  refreshToken: string;
}): TokenStore {
  let tokens = initial;

  return {
    getAccessToken: () => Promise.resolve(tokens?.accessToken),
    getRefreshToken: () => Promise.resolve(tokens?.refreshToken),
    setTokens: (next) => {
      tokens = next;
      return Promise.resolve();
    },
    clear: () => {
      tokens = undefined;
      return Promise.resolve();
    },
  };
}
