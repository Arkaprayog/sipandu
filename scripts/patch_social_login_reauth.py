#!/usr/bin/env python3
"""Patch Capgo Social Login 7.x to recover once from Android Credential Manager error [16].

The upstream native fix is not present in the repository's locked 7.20.0 package.
This build-time patch changes only the installed plugin source; it fails closed if
the expected source layout changes, instead of producing an APK without the fix.
"""
from __future__ import annotations

from pathlib import Path
import sys

PLUGIN_SOURCE = Path(
    "node_modules/@capgo/capacitor-social-login/android/src/main/java/"
    "ee/forgr/capacitor/social/login/GoogleProvider.java"
)

CONSTANT_ANCHOR = '    private static final String LOG_TAG = "GoogleProvider";'
METHOD_ANCHOR = "    private void handleSignInError(GetCredentialException e, PluginCall call, JSONObject config) {"
OPTIONS_ANCHOR = '        JSONObject options = call.getObject("options", new JSObject());\n'

CONSTANT = '    private static final String REAUTH_RETRY_FLAG = "_googleReauthRetry";\n'

METHODS = r'''    private boolean isAccountReauthFailed(String message) {
        return message != null && message.contains("Account reauth failed");
    }

    private boolean isReauthRetry(PluginCall call) {
        return call.getData().optBoolean(REAUTH_RETRY_FLAG, false);
    }

    private void markReauthRetry(PluginCall call) {
        call.getData().put(REAUTH_RETRY_FLAG, true);
    }

    /** Clear stale Credential Manager selection state without clearing valid app tokens. */
    private void clearCredentialManagerState(CredentialManagerCallback<Void, Exception> handler) {
        ClearCredentialStateRequest request = new ClearCredentialStateRequest();
        Executor executor = Executors.newSingleThreadExecutor();
        credentialManager.clearCredentialStateAsync(
            request,
            null,
            executor,
            new CredentialManagerCallback<Void, ClearCredentialException>() {
                @Override
                public void onResult(Void result) {
                    handler.onResult(null);
                }

                @Override
                public void onError(@NonNull ClearCredentialException e) {
                    handler.onError(e);
                }
            }
        );
    }

    private void retryLoginAfterReauthFailure(PluginCall call, JSONObject config, JSONObject options) {
        try {
            // Use the standard sign-in UI and do not filter out accounts that
            // have not previously authorized this app (e.g. supervised accounts).
            options.put("style", "standard");
            options.put("filterByAuthorizedAccounts", false);
            call.getData().put("options", options);
        } catch (JSONException ex) {
            call.reject("Google Sign-In recovery failed while preparing the retry: " + ex.getMessage());
            return;
        }
        login(call, config);
    }

    private void handleAccountReauthFailed(
        GetCredentialException e,
        PluginCall call,
        JSONObject config,
        JSONObject options
    ) {
        String errorMessage = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
        if (isReauthRetry(call)) {
            Log.e(
                LOG_TAG,
                "Google Sign-In error [16] persisted after clearing Credential Manager state and retry: "
                    + errorMessage
            );
            call.reject(
                "Google Sign-In failed: [16] Account reauth failed after one automatic recovery attempt. "
                    + "Check that Google OAuth consent is External (not Internal), add this account as a test user "
                    + "if consent is in Testing mode, and verify the Android OAuth client uses package "
                    + "id.my.sipandu.odhiv with the SHA-1 certificate for this installed APK. "
                    + "Also check whether Sign in with Google is disabled for this app in the Google Account settings."
            );
            return;
        }

        Log.w(
            LOG_TAG,
            "Google Sign-In error [16] Account reauth failed; clearing stale Credential Manager state "
                + "and retrying once with standard sign-in UI."
        );
        markReauthRetry(call);
        clearCredentialManagerState(
            new CredentialManagerCallback<Void, Exception>() {
                @Override
                public void onResult(Void unused) {
                    retryLoginAfterReauthFailure(call, config, options);
                }

                @Override
                public void onError(@NonNull Exception clearError) {
                    Log.w(
                        LOG_TAG,
                        "Could not clear Credential Manager state before error [16] retry; retrying anyway.",
                        clearError
                    );
                    retryLoginAfterReauthFailure(call, config, options);
                }
            }
        );
    }

'''

def main() -> int:
    if not PLUGIN_SOURCE.is_file():
        print(f"Expected Capgo plugin source not found: {PLUGIN_SOURCE}", file=sys.stderr)
        return 1

    source = PLUGIN_SOURCE.read_text(encoding="utf-8")
    if "REAUTH_RETRY_FLAG" in source and "handleAccountReauthFailed" in source:
        print("Capgo Google Sign-In error [16] recovery is already present.")
        return 0

    if "REAUTH_RETRY_FLAG" in source:
        print("Unexpected partial error [16] patch; refusing to modify source.", file=sys.stderr)
        return 1

    if source.count(CONSTANT_ANCHOR) != 1:
        print("Unsupported Capgo GoogleProvider.java: LOG_TAG anchor was not unique.", file=sys.stderr)
        return 1
    if source.count(METHOD_ANCHOR) != 1:
        print("Unsupported Capgo GoogleProvider.java: sign-in error handler was not unique.", file=sys.stderr)
        return 1

    source = source.replace(CONSTANT_ANCHOR, CONSTANT_ANCHOR + "\n" + CONSTANT.rstrip("\n"), 1)
    source = source.replace(METHOD_ANCHOR, METHODS + METHOD_ANCHOR, 1)

    method_start = source.index(METHOD_ANCHOR)
    method_end = source.find("\n    private ", method_start + len(METHOD_ANCHOR))
    if method_end < 0:
        method_end = len(source)
    handler = source[method_start:method_end]
    if handler.count(OPTIONS_ANCHOR) != 1:
        print("Unsupported Capgo GoogleProvider.java: options anchor in error handler was not unique.", file=sys.stderr)
        return 1

    retry_check = '''        if (isAccountReauthFailed(e.getMessage())) {
            handleAccountReauthFailed(e, call, config, options);
            return;
        }
'''
    handler = handler.replace(OPTIONS_ANCHOR, OPTIONS_ANCHOR + retry_check, 1)
    source = source[:method_start] + handler + source[method_end:]

    if "handleAccountReauthFailed(e, call, config, options);" not in source:
        print("Patch verification failed: error [16] recovery handler was not installed.", file=sys.stderr)
        return 1

    PLUGIN_SOURCE.write_text(source, encoding="utf-8")
    print("Patched Capgo native Google Sign-In: clear stale Credential Manager state and retry error [16] once.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
