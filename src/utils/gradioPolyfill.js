// Fix for @gradio/client CORS preflight bug with Hugging Face spaces in modern browsers.
// Hugging Face Spaces return `Access-Control-Allow-Origin: *` without `Access-Control-Allow-Credentials: true`.
// @gradio/client hardcodes `credentials: "include"`, which triggers Chrome/Safari/Firefox CORS policy violations.
//
// Root cause: @gradio/client creates `new Request(url, { credentials: "include" })` and then passes that
// Request object directly to `fetch(request)` without a second `init` argument.
// To resolve this completely:
// 1. We subclass `window.Request` so any Request instance targeting an HF space is created with `credentials: 'omit'`.
// 2. We wrap `window.fetch` so any direct fetch call or passed Request instance has its credentials downgraded to 'omit'.
// 3. We wrap `window.EventSource` if configured with credentials.

let isPolyfilled = false;

export const installGradioCorsFix = () => {
    if (typeof window === 'undefined' || isPolyfilled) return;
    isPolyfilled = true;

    const isHfUrl = (url) => {
        if (!url) return false;
        const str = typeof url === 'string'
            ? url
            : (typeof url === 'object' && 'url' in url)
                ? url.url
                : String(url);
        return str.includes('.hf.space') || str.includes('huggingface.co');
    };

    // 1. Intercept Request constructor
    const OriginalRequest = window.Request;
    if (OriginalRequest) {
        window.Request = class extends OriginalRequest {
            constructor(input, init) {
                let options = init;
                const isTarget = isHfUrl(input) || (init && isHfUrl(init.url));
                if (isTarget) {
                    options = {
                        ...(options || {}),
                        credentials: 'omit'
                    };
                }
                super(input, options);
            }
        };
    }

    // 2. Intercept window.fetch
    const originalFetch = window.fetch;
    window.fetch = function(input, init) {
        let isHf = false;

        if (input && (input instanceof OriginalRequest || (window.Request && input instanceof window.Request))) {
            isHf = isHfUrl(input.url);
            if (isHf && input.credentials !== 'omit') {
                try {
                    input = new (window.Request || OriginalRequest)(input, { credentials: 'omit' });
                } catch (e) {
                    console.warn("Could not rewrite Request credentials:", e);
                }
            }
        } else {
            isHf = isHfUrl(input);
        }

        if (isHf) {
            if (init) {
                init = { ...init, credentials: 'omit' };
            } else if (!input || !(input instanceof OriginalRequest)) {
                init = { credentials: 'omit' };
            }
        }

        return originalFetch.call(this, input, init);
    };

    // 3. Intercept EventSource if used
    const OriginalEventSource = window.EventSource;
    if (OriginalEventSource) {
        window.EventSource = class extends OriginalEventSource {
            constructor(url, config) {
                if (config && config.withCredentials && isHfUrl(url)) {
                    config = { ...config, withCredentials: false };
                }
                super(url, config);
            }
        };
    }
};

// Run automatically on import
installGradioCorsFix();
