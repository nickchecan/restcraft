import * as assert from 'assert';
import * as vscode from 'vscode';
import { buildAuthorizationUrl } from '../src/request/authorizationCode';
import { openOAuthBrowser } from '../src/webview/oauthBrowser';

suite('OAuth browser URL transport', () => {
    test('preserves the encoded URL through the VS Code external opener', async () => {
        const redirect = 'vscode://nickchecan.restcraft/oauth/callback?windowId=4&route=a%2Bb';
        const url = buildAuthorizationUrl({ url: 'https://demo.duendesoftware.com/connect/token',
            authorizationUrl: 'https://demo.duendesoftware.com/connect/authorize', clientId: 'interactive.public',
            clientSecret: '', clientAuthentication: 'none', state: 'example-state', usePkce: true,
            scope: 'api read' }, redirect, 'test-challenge');
        let browserUrl = '';
        // Match VS Code: strings remain intact; Uri arguments undergo encodeURI.
        const opener = async (target: vscode.Uri) => {
            assert.strictEqual(typeof target, 'string');
            browserUrl = typeof target === 'string' ? target : encodeURI(target.toString(true));
            return true;
        };
        assert.strictEqual(await openOAuthBrowser(url, opener), true);
        assert.strictEqual(browserUrl, url);
        const params = new URL(browserUrl).searchParams;
        assert.strictEqual(params.get('redirect_uri'), redirect);
        assert.strictEqual(params.get('scope'), 'api read');
        assert.strictEqual(params.get('client_id'), 'interactive.public');
        assert.strictEqual(params.get('code_challenge_method'), 'S256');
        // This was the previous adapter's extra-encoding behavior.
        assert.notStrictEqual(new URL(encodeURI(url)).searchParams.get('redirect_uri'), redirect);
    });

    test('reports browser-open failure and propagates errors', async () => {
        assert.strictEqual(await openOAuthBrowser('https://example.com/', async () => false), false);
        await assert.rejects(Promise.resolve(openOAuthBrowser('https://example.com/', async () => { throw new Error('Browser unavailable'); })), /Browser unavailable/);
    });
});
